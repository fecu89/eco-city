import anime from 'animejs';
import { ENERGY_COMPARISON, BONUS_ROUND, QUIZ_PASS_THRESHOLD, FACILITIES, STAGES, EVIDENCE_CONCEPTS } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { setModal, closeModal, $modal, $$modal } from './Modal.js';
import { escapeHtml, round1 } from './format.js';
import { cellStats, getCellSpatial, upgradeCost, investedCost, stageLevelCap, upgradeCell, demolishCell } from '../systems/BoardSystem.js';
import { proceedToConcepts } from '../systems/CrisisSystem.js';
import { setStage } from '../systems/StageSystem.js';
import * as Concepts from '../systems/ConceptsSystem.js';
import * as Redesign from '../systems/RedesignSystem.js';
import * as Report from '../systems/ReportSystem.js';

let refreshAll = () => {};
export function initStageModals(refreshCallback) {
  refreshAll = refreshCallback;
}

// ---------- Help ----------
export function openHelpModal() {
  setModal(`
    <div class="modal-head">
      <div><span class="eyebrow">HOW TO PLAY</span><h2>6단계 미션</h2></div>
      <button class="icon-btn close-modal"><i data-lucide="x"></i></button>
    </div>
    <div class="help-grid">
      <article><span>01</span><h3>건설</h3><p>빈 칸을 눌러 시설을 배치한다.</p></article>
      <article><span>02</span><h3>관리</h3><p>건물을 다시 누르면 업그레이드·철거.</p></article>
      <article><span>03</span><h3>인접 설계</h3><p>공장↔발전소, 데이터센터↔냉각 등 연결을 만든다.</p></article>
      <article><span>04</span><h3>위기</h3><p>전력·탄소·냉각 비용이 공개된다.</p></article>
      <article><span>05</span><h3>진단</h3><p>1차 도시를 스캔해 문제 지점을 찾는다.</p></article>
      <article><span>06</span><h3>재설계</h3><p>6×6로 확장해 근거와 함께 도시를 다시 짓는다.</p></article>
    </div>
    <div class="callout"><strong>주의</strong><p>수치는 실제 실측값이 아닌 <b>교수학습용 상대값</b>입니다 (에너지 비교 제외 — 3단계에서 출처 확인).</p></div>
  `);
  $modal('.close-modal').addEventListener('click', closeModal);
}

// ---------- Facility inspector ----------
export function openFacilityInspectorModal(index) {
  const cell = gameState.grid[index];
  if (!cell) return;
  const f = FACILITIES[cell.type];
  const s = cellStats(cell);
  const sp = getCellSpatial(gameState.grid, index, gameState.gridSize);
  const cap = Math.min(f.maxLevel, stageLevelCap());
  const canEdit = gameState.isEditable;
  const nextCost = upgradeCost(cell);
  const canLevel = cell.level < cap;
  const lockedByStage = cell.level >= cap && cell.level < f.maxLevel;
  const refund = Math.ceil(investedCost(cell) * 0.5);
  const positive = sp.positive.length
    ? sp.positive.map((x) => `<span class="spatial-tag good">🔗 ${x}</span>`).join('')
    : '<span class="spatial-tag neutral">연결 보너스 없음</span>';
  const warns = sp.warnings.map((x) => `<span class="spatial-tag warn">⚠ ${x}</span>`).join('');

  setModal(`
    <div class="modal-head"><div><span class="eyebrow">FACILITY</span><h2>${f.icon} ${f.name} · Lv.${cell.level}</h2></div><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div>
    <div class="facility-inspector-grid">
      <div><span>발전</span><strong>+${round1(s.dev)}</strong></div>
      <div><span>전력</span><strong>${s.supply ? `+${round1(s.supply)}` : `-${round1(s.demand)}`}</strong></div>
      <div><span>탄소</span><strong>${round1(s.carbon)}</strong></div>
      <div><span>물</span><strong>${round1(s.water)}</strong></div>
    </div>
    <div class="spatial-tags">${positive}${warns}</div>
    <div class="callout"><strong>공간 규칙</strong><p>${f.desc}</p></div>
    ${gameState.stage === STAGES.REDESIGN ? '<button class="btn secondary full" id="recordEvidenceBtn"><i data-lucide="notebook-pen"></i> 이 시설 근거 기록</button>' : ''}
    <div class="modal-actions facility-actions">
      <button class="btn secondary" id="demolishBtn" ${canEdit ? '' : 'disabled'}><i data-lucide="trash-2"></i> 철거 +${refund}C</button>
      <button class="btn primary" id="upgradeBtn" ${canEdit && canLevel && gameState.credits >= nextCost ? '' : 'disabled'}><i data-lucide="chevrons-up"></i> ${canLevel ? `Lv.${cell.level + 1} · ${nextCost}C` : lockedByStage ? '5단계 해금' : '최대 레벨'}</button>
    </div>
  `);
  $modal('.close-modal').addEventListener('click', closeModal);
  $modal('#recordEvidenceBtn')?.addEventListener('click', () => {
    gameState.selectedCell = index;
    openEvidenceEntryModal(index);
  });
  $modal('#demolishBtn')?.addEventListener('click', () => {
    const res = demolishCell(index);
    if (res.ok) {
      closeModal();
      refreshAll();
      eventBus.emit(Events.TOAST_SHOW, { title: '철거 완료', text: `${f.name} 제거 · ${res.refund}C 환급` });
      eventBus.emit(Events.AUDIO_SFX, { name: 'demolish' });
    }
  });
  $modal('#upgradeBtn')?.addEventListener('click', () => {
    const res = upgradeCell(index);
    if (res.ok) {
      closeModal();
      refreshAll();
      eventBus.emit(Events.TOAST_SHOW, { title: '시설 업그레이드', text: `${f.name} → Lv.${cell.level}` });
      eventBus.emit(Events.AUDIO_SFX, { name: 'upgrade' });
    }
  });
}

// 근거 입력 폼은 사이드바에 넣기엔 select+textarea가 너무 좁아져서(사용자 피드백) 모달로 옮겼다.
function openEvidenceEntryModal(index) {
  const cell = gameState.grid[index];
  if (!cell) return;
  const f = FACILITIES[cell.type];
  const goodCount = gameState.evidence.filter((e) => e.good).length;

  setModal(`
    <div class="modal-head"><div><span class="eyebrow">EVIDENCE</span><h2>${f.icon} ${f.name} 근거 기록</h2></div><button class="icon-btn close-modal"><i data-lucide="x"></i></button></div>
    <p class="muted">이 시설을 왜 여기에 배치·강화했는지 과학 개념과 연결해 기록하세요. (인정된 근거 ${goodCount} / 3)</p>
    <select id="evidenceConceptModal">
      <option value="">개념 선택</option>
      ${EVIDENCE_CONCEPTS.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}
    </select>
    <textarea id="evidenceReasonModal" maxlength="200" placeholder="예: 데이터센터는 발열이 커서 순환냉각과 연결해야 물 부담이 줄어든다."></textarea>
    <div class="modal-actions"><button class="btn primary" id="evidenceSaveModalBtn">저장</button></div>
  `);
  $modal('.close-modal').addEventListener('click', closeModal);
  $modal('#evidenceSaveModalBtn').addEventListener('click', () => {
    const select = $modal('#evidenceConceptModal');
    const concept = select.value;
    const conceptLabel = select.options[select.selectedIndex]?.text || '';
    const reason = $modal('#evidenceReasonModal').value;
    gameState.selectedCell = index;
    const result = Redesign.saveEvidence(concept, conceptLabel, reason);
    if (!result.ok) {
      const messages = {
        too_short: '개념을 고르고 15자 이상 적어주세요.',
        wrong_stage: '지금은 기록할 수 없습니다.',
        no_facility_selected: '시설을 다시 선택해주세요.',
      };
      eventBus.emit(Events.TOAST_SHOW, { title: messages[result.reason] || '근거를 구체화하세요.' });
      return;
    }
    closeModal();
    refreshAll();
  });
}

// ---------- Crisis reveal (2단계) ----------
export function openCrisisModal(baseline) {
  const m = baseline;
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">CITY CRISIS</span><h2>성장 뒤의 비용이 공개되었습니다</h2></div></div>
    <div class="crisis-grid">
      <div class="crisis-card"><div class="value">${m.reliableSupply}/${m.demand}</div><h3>⚡ 전력</h3><p>수지 ${m.balance}</p></div>
      <div class="crisis-card"><div class="value">${m.carbon}</div><h3>☁ 탄소</h3><p>화력·산업 영향</p></div>
      <div class="crisis-card"><div class="value">${m.water}</div><h3>💧 냉각</h3><p>열집중 ${m.heatCluster}</p></div>
    </div>
    <div class="crisis-grid">
      <div class="crisis-card"><div class="value">${m.synergyLinks}</div><h3>🔗 인접 연결</h3><p>좋은 배치</p></div>
      <div class="crisis-card"><div class="value">${m.conflictPairs}</div><h3>⚠ 배치 갈등</h3><p>주거-산업 충돌</p></div>
      <div class="crisis-card"><div class="value">${m.synergyScore}</div><h3>★ 공간 보너스</h3><p>인접 효과 점수</p></div>
    </div>
    <div class="callout"><strong>핵심</strong><p>시설 종류뿐 아니라 <b>어디에 배치했는지</b>가 도시 성능을 바꿉니다.</p></div>
    <div class="modal-actions"><button class="btn primary" id="toLearningBtn">원인 학습 <i data-lucide="brain"></i></button></div>
  `);
  $modal('#toLearningBtn').addEventListener('click', () => {
    closeModal();
    document.getElementById('boardOverlay')?.classList.add('hidden');
    proceedToConcepts();
    refreshAll();
    openEnergyScaleModal();
  });
}

// ---------- Energy scale (3단계, 신규) ----------
export function openEnergyScaleModal() {
  const { brainWatts, disclaimer, scenarios, sources } = ENERGY_COMPARISON;
  let scenarioIndex = 0;

  function scenarioHtml(i) {
    const sc = scenarios[i];
    const aiText = sc.aiWattHoursLow
      ? `${sc.aiWattHoursLow}~${sc.aiWattHoursHigh}Wh`
      : `${sc.aiMegawattHours.toLocaleString()}MWh`;
    return `
      <div class="energy-scale" id="scaleWrap">
        <div class="energy-side brain"><span class="energy-icon">🧠</span><strong>${brainWatts}W</strong><small>${sc.brainLabel}</small></div>
        <div class="scale-beam" id="scaleBeam"><div class="scale-fulcrum"></div></div>
        <div class="energy-side ai"><span class="energy-icon">🤖</span><strong id="aiValue">?</strong><small>${sc.aiLabel}</small></div>
      </div>
      <button class="btn primary full" id="revealScaleBtn">저울 기울이기 <i data-lucide="scale"></i></button>
      <p class="energy-value-reveal hidden" id="scaleRevealText">추정 ${aiText} — 같은 시간 사람 뇌보다 훨씬 큰 에너지가 필요합니다.</p>
    `;
  }

  function render() {
    setModal(`
      <div class="modal-head"><div><span class="eyebrow">CONCEPT · 데이터로 확인</span><h2>뇌 vs AI, 에너지 저울</h2></div></div>
      <div class="energy-tabs" id="energyTabs">
        ${scenarios.map((sc, i) => `<button data-i="${i}" class="${i === scenarioIndex ? 'active' : ''}">${sc.label}</button>`).join('')}
      </div>
      ${scenarioHtml(scenarioIndex)}
      <div class="callout"><strong>출처를 확인하세요</strong><p>${disclaimer}</p></div>
      <div class="energy-sources">${sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>`).join('')}</div>
      <div class="modal-actions"><button class="btn primary" id="energyContinueBtn">개념 퀴즈로 이동 <i data-lucide="arrow-right"></i></button></div>
    `);
    $$modal('#energyTabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        scenarioIndex = Number(btn.dataset.i);
        render();
      });
    });
    $modal('#revealScaleBtn')?.addEventListener('click', revealScale);
    $modal('#energyContinueBtn').addEventListener('click', () => {
      Concepts.markEnergyScaleSeen();
      closeModal();
      Concepts.startQuiz();
      refreshAll();
      renderQuizModal();
    });
  }

  function revealScale() {
    const beam = $modal('#scaleBeam');
    const aiValueEl = $modal('#aiValue');
    const revealText = $modal('#scaleRevealText');
    const btn = $modal('#revealScaleBtn');
    if (!beam) return;
    btn.disabled = true;
    beam.classList.add('tipped');
    eventBus.emit(Events.AUDIO_SFX, { name: 'reveal' });
    const counter = { v: 0 };
    anime({
      targets: counter,
      v: 100,
      duration: 900,
      easing: 'easeOutCubic',
      update: () => {
        if (aiValueEl) aiValueEl.textContent = `${Math.round(counter.v)}%`;
      },
      complete: () => {
        if (aiValueEl) aiValueEl.textContent = '≫';
        revealText?.classList.remove('hidden');
      },
    });
  }

  render();
}

// ---------- Quiz (3단계) ----------
export function renderQuizModal() {
  const q = Concepts.currentQuizQuestion();
  if (!q) return;
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">CONCEPT UNLOCK</span><h2>${escapeHtml(q.title)}</h2></div></div>
    <div class="quiz-progress">${gameState.quizPool.map((_, i) => `<span class="${i < gameState.quizIndex ? 'done' : i === gameState.quizIndex ? 'current' : ''}"></span>`).join('')}</div>
    <div class="quiz-question">
      <h3>${escapeHtml(q.prompt)}</h3>
      <div class="quiz-options" id="quizOptions">${q.options.map((o, i) => `<button class="quiz-option" data-i="${i}">${String.fromCharCode(65 + i)}. ${escapeHtml(o.text)}</button>`).join('')}</div>
      <div id="quizExplain"></div>
    </div>
    <div class="modal-actions"><button class="btn primary" id="quizNextBtn" disabled>${gameState.quizIndex === gameState.quizPool.length - 1 ? '결과' : '다음'}</button></div>
  `);
  $$modal('#quizOptions .quiz-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (gameState.quizAnswered) return;
      const i = Number(btn.dataset.i);
      const result = Concepts.answerQuiz(i);
      if (!result) return;
      if (result.correct) {
        btn.classList.add('correct');
        eventBus.emit(Events.AUDIO_SFX, { name: 'correct' });
      } else {
        btn.classList.add('wrong');
        $$modal('#quizOptions .quiz-option')[result.correctIndex]?.classList.add('correct');
        eventBus.emit(Events.AUDIO_SFX, { name: 'wrong' });
      }
      $modal('#quizExplain').innerHTML = `<div class="quiz-explain"><strong>${result.correct ? '정답' : '오답'}</strong><br>${escapeHtml(result.explain)}</div>`;
      $modal('#quizNextBtn').disabled = false;
    });
  });
  $modal('#quizNextBtn').addEventListener('click', () => {
    if (!gameState.quizAnswered) return;
    const result = Concepts.nextQuizQuestion();
    if (!result.done) {
      renderQuizModal();
    } else {
      renderQuizResultModal(result);
    }
  });
}

function renderQuizResultModal({ passed, correct, total }) {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">LEARNING RESULT</span><h2>${passed ? '진단 단계 해금' : '개념 재도전'}</h2></div></div>
    <div class="summary-grid">
      <div class="summary-card"><span>정답</span><strong>${correct}/${total}</strong></div>
      <div class="summary-card"><span>기준</span><strong>${QUIZ_PASS_THRESHOLD}개 이상</strong></div>
    </div>
    <div class="callout"><strong>${passed ? '4단계 진단으로 이동' : `${QUIZ_PASS_THRESHOLD}문항 이상 필요`}</strong><p>${passed ? '이제 1차 도시를 스캔해 문제 지점을 찾아봅니다.' : '틀린 문항 설명을 다시 확인한 뒤 새 문제로 재도전하세요.'}</p></div>
    <div class="modal-actions"><button class="btn primary" id="quizResultBtn">${passed ? '진단 시작' : '다시 풀기'}</button></div>
  `);
  $modal('#quizResultBtn').addEventListener('click', () => {
    closeModal();
    if (!passed) {
      Concepts.retryQuiz();
      refreshAll();
      renderQuizModal();
      return;
    }
    openReflectionModal();
  });
}

// 2차시 정리 활동: "내가 놓친 게 무엇이었을까?" 1~2문장 성찰. 저장해야 4단계 진단으로 넘어간다.
export function openReflectionModal() {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">REFLECTION</span><h2>성찰 저널</h2></div></div>
    <p class="muted">"내가 놓친 게 무엇이었을까?" 1~2문장으로 짧게 적어보세요.</p>
    <textarea id="reflectionInput" maxlength="200" placeholder="예: 전력과 냉각수 비용을 물어보지 않아서 결과를 몰랐다."></textarea>
    <div class="modal-actions"><button class="btn primary" id="reflectionSaveBtn">저장하고 진단 시작 <i data-lucide="arrow-right"></i></button></div>
  `);
  $modal('#reflectionSaveBtn').addEventListener('click', () => {
    const text = $modal('#reflectionInput').value;
    const result = Concepts.saveReflection(text);
    if (!result.ok) {
      eventBus.emit(Events.TOAST_SHOW, { title: '조금 더 적어주세요', text: '8자 이상 입력해주세요.' });
      return;
    }
    setStage(STAGES.DIAGNOSIS);
    closeModal();
    refreshAll();
  });
}

// ---------- Redesign validation (5단계) ----------
export function openRedesignCheckModal() {
  const { checks, allPassed, passed, total } = Redesign.evaluateRedesign();
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">REDESIGN CHECK</span><h2>${allPassed ? '재설계 성공' : `${passed}/${total} 조건 충족`}</h2></div></div>
    <div class="rubric">${checks.map((c) => `<div class="rubric-row"><strong>${c.label}</strong><div class="rubric-meter"><span style="width:${c.ok ? 100 : 24}%"></span></div><span>${c.ok ? 'PASS' : 'RETRY'}</span></div><div class="muted validation-note">${c.text}</div>`).join('')}</div>
    <div class="callout"><strong>${allPassed ? '도시는 공간적 시스템입니다.' : '부족한 조건을 다시 설계하세요.'}</strong><p>${allPassed ? '배치, 연결, 강화, 환경 지표를 함께 만족시켰습니다.' : '건물 터치로 철거·업그레이드하고 인접 관계를 다시 확인하세요.'}</p></div>
    <div class="modal-actions"><button class="btn ${allPassed ? 'primary' : 'secondary'}" id="validationBtn">${allPassed ? '성적표 보기' : '계속 재설계'}</button></div>
  `);
  $modal('#validationBtn').addEventListener('click', () => {
    closeModal();
    Redesign.confirmRedesignResult(allPassed);
    refreshAll();
    if (allPassed) openReportModal();
  });
}

// 보너스 라운드는 6개 체크리스트가 아니라 "더 높은 종합 점수" 하나만 본다 (이미 통과한 체크리스트는 재검증 의미가 없기 때문).
export function openBonusValidationModal() {
  const result = Report.evaluateBonusRound();
  openBonusResultModal(result);
}

// ---------- Report (6단계) ----------
export function openReportModal() {
  const r = Report.computeReport();
  const deltaText = (v) => (v > 0 ? `+${v}` : `${v}`);
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">FINAL REPORT</span><h2>1차 도시 → 재설계 도시</h2></div></div>
    <div class="final-rank"><div class="rank-icon">${r.tier.icon}</div><h2>${escapeHtml(r.tier.title)} · ${r.total}점</h2><p>시설 종류뿐 아니라 배치·강화·환경 지표를 함께 관리했습니다.</p></div>
    <div class="summary-grid">
      <div class="summary-card"><span>발전</span><strong>${r.baseline.dev}→${r.metrics.dev} (${deltaText(r.devDelta)})</strong></div>
      <div class="summary-card"><span>전력수지</span><strong>${r.baseline.balance}→${r.metrics.balance} (${deltaText(r.balanceDelta)})</strong></div>
      <div class="summary-card"><span>탄소</span><strong>${r.baseline.carbon}→${r.metrics.carbon} (${deltaText(r.carbonDelta)})</strong></div>
      <div class="summary-card"><span>인접 연결</span><strong>${r.metrics.synergyLinks}</strong></div>
    </div>
    <div class="rubric">
      <div class="rubric-row"><strong>과학 타당성</strong><div class="rubric-meter"><span style="width:${r.science}%"></span></div><span>${r.science}</span></div>
      <div class="rubric-row"><strong>공간 설계</strong><div class="rubric-meter"><span style="width:${r.spatial}%"></span></div><span>${r.spatial}</span></div>
      <div class="rubric-row"><strong>AI 주체성</strong><div class="rubric-meter"><span style="width:${r.autonomy}%"></span></div><span>${r.autonomy}</span></div>
    </div>
    <div class="callout"><strong>발표 자료로 활용하세요</strong><p>4차시 발표는 이 화면과 위 성장폭(1차 → 재설계)을 근거로 진행할 수 있습니다. 학급 투표는 교실에서 별도로 진행합니다.</p></div>
    <div class="modal-actions">
      <button class="btn secondary" id="bonusBtn">보너스 라운드 <i data-lucide="sparkles"></i></button>
      <button class="btn secondary" id="exportBtn"><i data-lucide="download"></i> 결과 저장</button>
      <button class="btn primary" id="closeFinalBtn">닫기</button>
    </div>
  `);
  celebrate();
  $modal('#closeFinalBtn').addEventListener('click', closeModal);
  $modal('#exportBtn').addEventListener('click', () => exportResultFile());
  $modal('#bonusBtn').addEventListener('click', () => {
    closeModal();
    Report.startBonusRound();
    refreshAll();
    eventBus.emit(Events.TOAST_SHOW, { title: BONUS_ROUND.label, text: `목표 종합점수 ${gameState.bonusRound.targetTotal}점 이상` });
  });
}

function openBonusResultModal(result) {
  if (!result.success) {
    setModal(`
      <div class="modal-head"><div><span class="eyebrow">BONUS ROUND</span><h2>목표 미달 — 계속 도전!</h2></div></div>
      <div class="callout"><strong>목표 ${result.target}점 / 현재 ${result.total}점</strong><p>줄어든 예산 안에서 시설을 조정해 종합 점수를 더 끌어올려보세요.</p></div>
      <div class="modal-actions"><button class="btn primary" id="bonusRetryBtn">계속하기</button></div>
    `);
    $modal('#bonusRetryBtn').addEventListener('click', closeModal);
    return;
  }
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">BONUS ROUND CLEAR</span><h2>🎉 예산 삭감 속에서도 성공!</h2></div></div>
    <div class="summary-grid">
      <div class="summary-card"><span>목표</span><strong>${result.target}점</strong></div>
      <div class="summary-card"><span>달성</span><strong>${result.total}점</strong></div>
    </div>
    <div class="modal-actions"><button class="btn primary" id="bonusDoneBtn">성적표로 돌아가기</button></div>
  `);
  celebrate();
  $modal('#bonusDoneBtn').addEventListener('click', () => {
    closeModal();
    refreshAll();
    openReportModal();
  });
}

function celebrate() {
  anime({ targets: '.final-rank .rank-icon', scale: [0.4, 1], rotate: [-15, 0], duration: 500, easing: 'easeOutElastic(1, .6)' });
}

function exportResultFile() {
  const result = Report.exportReport();
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ai-city-result.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Reset confirm ----------
export function openResetConfirmModal(onConfirm) {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">RESET</span><h2>처음부터 다시 시작?</h2></div></div>
    <p class="muted">도시·업그레이드·근거·성취가 초기화됩니다.</p>
    <div class="modal-actions"><button class="btn secondary" id="cancelReset">취소</button><button class="btn primary" id="confirmReset">초기화</button></div>
  `);
  $modal('#cancelReset').addEventListener('click', closeModal);
  $modal('#confirmReset').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}
