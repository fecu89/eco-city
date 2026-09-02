import { QUESTS, QUEST_COUNT, questForState } from '../core/QuestDefinitions.js';
import { gameState } from '../core/GameState.js';
import { RESEARCH } from '../core/ResearchDefinitions.js';
import { FACILITIES, QUEST_REQUIREMENTS, RESEARCH_RULES, STRESS_TEST_RULES } from '../core/Constants.js';
import { claimCurrentQuest, evaluateCurrentQuest, requestEmergencySupport } from '../systems/QuestSystem.js';
import { markQuestQuizResult } from '../systems/QuestSystem.js';
import {
  advanceQuestQuiz,
  answerQuestQuiz,
  currentQuestQuizQuestion,
  retryQuestQuiz,
  startQuestQuiz,
  startResearchQuiz,
} from '../systems/QuizSystem.js';
import { expandGrid } from '../systems/BoardSystem.js';
import { setModal, closeModal, $modal, $$modal } from './Modal.js';
import { escapeHtml, formatCredits } from './format.js';
import { eventBus, Events } from '../core/EventBus.js';
import { CITY_EVENTS, STRESS_PHASES } from '../core/EventDefinitions.js';
import {
  acknowledgeClimateBriefing,
  currentClimateQuestEvaluation,
  isClimateQuestActive,
  retryClimateQuest,
} from '../systems/ClimateQuestSystem.js';
import { CAMPAIGN_QUEST_INDEXES } from '../core/CampaignProgression.js';

let els;
let onChanged = () => {};
let detailsExpanded = false;
let researchQuizReturnIndex = null;
const QUIZ_KINDS = {};
const nodes = (value) => (Array.isArray(value) ? value : [value]).filter(Boolean);
const eachNode = (value, callback) => nodes(value).forEach(callback);

export function initQuestView(elements, changed) {
  els = elements;
  onChanged = changed || (() => {});
  eachNode(els.claim, (claim) => claim.addEventListener('click', () => {
    if (['ready', 'failed'].includes(gameState.stressTest?.status)) {
      eventBus.emit(Events.STRESS_TEST_START_REQUESTED, {});
      return;
    }
    if (gameState.stressTest?.status === 'passed') {
      eventBus.emit(Events.REPORT_OPEN_REQUESTED, {});
      return;
    }
    if (isClimateQuestActive(gameState)) {
      const campaign = gameState.climateCampaign;
      if (campaign.status === 'briefing') {
        const result = acknowledgeClimateBriefing(gameState);
        if (!result.ok) {
          eventBus.emit(Events.TOAST_SHOW, { title: '기후 대비를 시작할 수 없습니다.', text: result.reason, priority: true });
          return;
        }
        onChanged({ phase: 'climate-forecast', result });
        return;
      }
      if (campaign.status === 'result' && campaign.lastResult?.passed === false) {
        const result = retryClimateQuest(gameState);
        if (result.ok) onChanged({ phase: 'climate-retry', result });
        return;
      }
    }
    const quizKind = QUIZ_KINDS[gameState.questIndex];
    if (quizKind && gameState.questStatus !== 'ready_to_claim') {
      startQuestQuiz(gameState, quizKind);
      renderQuestQuizModal();
      return;
    }
    const completed = questForState(gameState);
    const result = claimCurrentQuest(gameState);
    if (!result.ok) return;
    if (result.expandGrid) expandGrid();
    if (result.expandSecondGrid && result.secondExpansionSide) expandGrid(result.secondExpansionSide);
    detailsExpanded = false;
    onChanged({ phase: 'claimed', quest: completed, result });
    if (result.nextQuest) {
      eventBus.emit(Events.QUEST_STARTED, { quest: questForState(gameState, result.nextQuest), silentAlert: true });
    }
  }));
  const mapButtons = Array.isArray(els.map) ? els.map : [els.map];
  mapButtons.filter(Boolean).forEach((button) => button.addEventListener('click', openQuestMap));
  eventBus.on(Events.RESEARCH_QUIZ_REQUESTED, ({ researchId, dataCenterIndex }) => {
    const result = startResearchQuiz(gameState, researchId);
    if (!result.ok) {
      const text = result.reason === 'no_questions_remaining'
        ? '이 연구의 가속 퀴즈는 모두 맞혔습니다. 남은 연구 시간은 게임 시간으로 진행됩니다.'
        : '진행 중인 연구에서만 가속 퀴즈를 풀 수 있습니다.';
      eventBus.emit(Events.TOAST_SHOW, { title: '연구 퀴즈를 열 수 없습니다.', text });
      return;
    }
    researchQuizReturnIndex = dataCenterIndex;
    renderQuestQuizModal();
  });
  eventBus.on(Events.FINAL_QUIZ_REQUESTED, () => {
    startQuestQuiz(gameState, 'climate-council');
    renderQuestQuizModal();
  });
  els.expand?.addEventListener('click', () => {
    detailsExpanded = !detailsExpanded;
    renderQuest();
  });
  eventBus.on(Events.GAME_RESET, () => {
    detailsExpanded = false;
    researchQuizReturnIndex = null;
  });
}

function rewardText(quest) {
  const parts = [];
  if (quest.reward.credits) parts.push(formatCredits(quest.reward.credits));
  if (quest.reward.unlockFacilities.length) {
    const facilityNames = quest.reward.unlockFacilities
      .map((facility) => FACILITIES[facility]?.name || facility)
      .join('·');
    parts.push(`${facilityNames} 해금`);
  }
  if (quest.reward.unlockResearch?.length) {
    parts.push(`${quest.reward.unlockResearch.map((id) => RESEARCH[id]?.name || id).join('·')} 해금`);
  }
  if (quest.reward.upgradePermitFacilities?.length) {
    const names = quest.reward.upgradePermitFacilities
      .map((facility) => FACILITIES[facility]?.name || facility)
      .join('·');
    parts.push(`${names} Lv.3 강화 허가`);
  }
  if (quest.reward.upgradePermitLevel) parts.push(`Lv.${quest.reward.upgradePermitLevel} 강화 허가`);
  return `보상 ${parts.join(' · ') || '최종 성적표'}`;
}

function progressForCurrent() {
  if (gameState.questStatus === 'ready_to_claim' || gameState.questStatus === 'claimed') return 100;
  if (isClimateQuestActive(gameState)) {
    const evaluation = currentClimateQuestEvaluation(gameState);
    return Math.min(100, (evaluation.bestConsecutiveDays || evaluation.consecutiveDays || 0) / evaluation.quest.targetDays * 100);
  }
  if (gameState.questIndex === 1) return Math.min(100, gameState.grid.filter((cell) => cell?.type === 'residential').length * 50);
  if (gameState.questIndex === 3) return Math.min(100, gameState.grid.filter((cell) => cell?.type === 'green').length * 100);
  const days = gameState.questProgress.consecutiveDays || 0;
  const required = [2, 4, 5, 6, 9, 10].includes(gameState.questIndex)
    ? QUEST_REQUIREMENTS.OPERATING_DAYS
    : 3;
  return Math.min(100, days / required * 100);
}

function oneDecimal(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—';
}

function liveClimateConditions(evaluation) {
  const quest = evaluation.quest;
  const summary = gameState.lastTickSummary || {};
  const lines = [`최고 연속 달성 ${evaluation.bestConsecutiveDays || evaluation.consecutiveDays || 0} / ${quest.targetDays}일`];
  const essential = `필수시설 전력 ${oneDecimal(summary.essentialSupplyPercent)}% / 90%`;
  if (['essential', 'battery', 'diversity', 'cleanAir', 'tidal'].includes(quest.objective)) lines.push(essential);
  if (quest.objective === 'battery') {
    lines.push(`배터리 실제 방전 ${oneDecimal(evaluation.batteryEnergy)} / ${quest.batteryTarget}E`);
    lines.push(`또는 장마 최저 예비력 ${oneDecimal(evaluation.batteryReserveMinimum)} / ${quest.batteryReserveTarget}E`);
  }
  if (quest.objective === 'diversity') {
    const types = Object.values(summary.generationDeliveredByType || {}).filter((delivered) => Number(delivered) >= 0.1).length;
    lines.push(`실제 공급 발전원 ${types} / ${quest.generationTypeTarget}종`);
  }
  if (quest.objective === 'winter') {
    const residentialRatios = Object.entries(summary.facilityPower || {})
      .filter(([index]) => gameState.grid[Number(index)]?.type === 'residential')
      .map(([, power]) => Number(power.ratio) * 100);
    lines.push(`주거 최저 전력 ${oneDecimal(residentialRatios.length ? Math.min(...residentialRatios) : NaN)}% / 90%`);
    lines.push(`도시 순수익 ${oneDecimal(summary.netCredits)} 💰/일 / 0 초과`);
  }
  if (quest.objective === 'water') {
    lines.push(`물 사용 ${oneDecimal(summary.dailyWater)} / ${oneDecimal(summary.waterLimit)}/일`);
  }
  if (['cleanAir', 'wildfire'].includes(quest.objective)) {
    lines.push(`CO₂ ${oneDecimal(summary.dailyCarbon)} / ${quest.carbonTarget}/일 이하`);
  }
  if (quest.objective === 'wildfire') {
    lines.push(`도시 순수익 ${oneDecimal(summary.netCredits)} 💰/일 / 0 초과`);
  }
  if (quest.objective === 'tidal') {
    lines.push(`조력 실제 공급 ${oneDecimal(evaluation.tidalEnergy)} / ${quest.tidalEnergyTarget}E`);
  }
  return lines;
}

function climateDetailsMarkup(evaluation, quest) {
  const definition = CITY_EVENTS[evaluation.quest.eventType];
  return `
    <strong>현재 조건</strong>
    <ul>${liveClimateConditions(evaluation).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
    <div><span>기후 영향</span><b>${escapeHtml(definition?.description || '')}</b></div>
    <div><span>대비 권장</span><b>${escapeHtml(definition?.preparation || '')}</b></div>
    <strong>완료 조건</strong>
    <ul>${quest.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>
    <div><span>퀘스트 보상</span><b>${escapeHtml(rewardText(quest))}</b></div>`;
}

// 최종시험 패널이 감춰 둔 펼치기 버튼을 일반 퀘스트 렌더 전에 되돌린다.
function resetQuestPanelMode() {
  els.expand?.classList.remove('hidden');
}

export function renderQuest() {
  if (!els) return;
  resetQuestPanelMode();
  if (renderStressTestPanel()) return;
  const evaluation = evaluateCurrentQuest(gameState);
  const quest = questForState(gameState);
  const climatePosition = gameState.questIndex - CAMPAIGN_QUEST_INDEXES.CLIMATE_START + 1;
  eachNode(els.level, (node) => {
    node.textContent = isClimateQuestActive(gameState)
      ? `기후 대응 ${climatePosition} / 8`
      : `LEVEL ${gameState.questIndex} / ${QUEST_COUNT}`;
  });
  eachNode(els.title, (node) => { node.textContent = quest.title; });
  eachNode(els.goal, (node) => { node.textContent = quest.goal; });
  eachNode(els.reward, (node) => { node.textContent = rewardText(quest); });
  eachNode(els.bar, (node) => { node.style.width = `${progressForCurrent()}%`; });
  const isQuizQuest = !!QUIZ_KINDS[gameState.questIndex];
  const quizPassed = Boolean(gameState.questProgress.quizPassed);
  const canStartQuiz = isQuizQuest && !quizPassed;
  eachNode(els.claim, (node) => {
    const campaign = isClimateQuestActive(gameState) ? gameState.climateCampaign : null;
    const canBrief = campaign?.status === 'briefing';
    const canRetry = campaign?.status === 'result' && campaign.lastResult?.passed === false;
    node.disabled = !evaluation.ready && !canStartQuiz && !canBrief && !canRetry;
    node.textContent = evaluation.ready
      ? '보상 받기'
      : canBrief
        ? '24일 대비 시작'
        : canRetry
          ? '24일 준비부터 재도전'
          : campaign?.status === 'preparation'
            ? `${evaluation.startsInDays}일 후 시작`
            : campaign?.status === 'active'
              ? '기후 대응 중'
              : canStartQuiz ? '퀴즈 시작' : quizPassed ? '도시 조건 진행 중' : '진행 중';
  });
  eachNode(els.root, (node) => node.classList.toggle('quest-ready', evaluation.ready));
  eachNode(els.contextAction, (node) => {
    node.classList.add('hidden');
  });
  if (els.details) {
    els.details.innerHTML = isClimateQuestActive(gameState)
      ? climateDetailsMarkup(currentClimateQuestEvaluation(gameState), quest)
      : `
        <strong>완료 조건</strong>
        <ul>${quest.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>
        <div><span>퀘스트 보상</span><b>${escapeHtml(rewardText(quest))}</b></div>`;
    els.details.classList.toggle('hidden', !detailsExpanded);
  }
  if (els.expand) {
    els.expand.setAttribute('aria-expanded', String(detailsExpanded));
    els.expand.querySelector('span').textContent = detailsExpanded ? '간단히 보기' : '전체 내용 펼치기';
  }
  eachNode(els.root, (node) => node.closest('[data-hud-panel="quest"]')?.classList.toggle('quest-details-expanded', detailsExpanded));
}

function renderStressTestPanel() {
  const stress = gameState.stressTest;
  if (!stress || ['locked', 'legacy_complete'].includes(stress.status)) return false;
  const totalDays = STRESS_PHASES.reduce((sum, phase) => sum + phase.durationDays, 0);
  const completedDays = STRESS_PHASES
    .slice(0, stress.phaseIndex)
    .reduce((sum, phase) => sum + phase.durationDays, 0) + (stress.phaseDay || 0);
  const phase = STRESS_PHASES[Math.min(stress.phaseIndex, STRESS_PHASES.length - 1)];
  const statusText = stress.status === 'running'
    ? `${phase.label} ${stress.phaseDay}/${phase.durationDays}일`
    : stress.status === 'failed'
      ? '도시 보완 후 재도전 가능'
      : stress.status === 'passed'
        ? '생존 성공 · 운영 보고서 준비 완료'
        : '41일 · 8구간 복합기후 시험 준비 완료';
  eachNode(els.level, (node) => {
    node.textContent = stress.status === 'running'
      ? `최종 기후시험 · 구간 ${stress.phaseIndex + 1} / ${STRESS_PHASES.length}`
      : `최종 기후시험 · ${stress.status === 'failed' ? '재도전' : stress.status === 'passed' ? '통과' : '준비'}`;
  });
  eachNode(els.title, (node) => { node.textContent = '대한민국 복합기후 시험'; });
  eachNode(els.goal, (node) => { node.textContent = statusText; });
  eachNode(els.reward, (node) => { node.textContent = '통과 후 도시 운영 프로필과 최종 보고서'; });
  eachNode(els.bar, (node) => {
    node.style.width = `${stress.status === 'passed' ? 100 : Math.min(100, completedDays / totalDays * 100)}%`;
  });
  eachNode(els.claim, (node) => {
    node.disabled = stress.status === 'running';
    node.textContent = stress.status === 'ready'
      ? '테스트 시작'
      : stress.status === 'failed'
        ? '테스트 재도전'
        : stress.status === 'passed'
          ? '최종 보고서 보기'
          : `${phase.label} 진행 중`;
  });
  eachNode(els.root, (node) => node.classList.toggle('quest-ready', stress.status !== 'running'));
  eachNode(els.contextAction, (node) => node.classList.add('hidden'));
  if (els.details) {
    els.details.innerHTML = `<div class="stress-quest-phases">${STRESS_PHASES.map((item, index) => `<span class="${index < stress.phaseIndex || stress.status === 'passed' ? 'complete' : index === stress.phaseIndex && stress.status === 'running' ? 'active' : ''}"><b>${index + 1}. ${escapeHtml(item.label)}</b><small>${item.durationDays}일</small></span>`).join('')}</div><p>평균 공급 ${STRESS_TEST_RULES.PASS_ESSENTIAL_SUPPLY_PERCENT}% · 최저 공급 ${STRESS_TEST_RULES.MINIMUM_ESSENTIAL_SUPPLY_PERCENT}% · CO₂ 평균 ${STRESS_TEST_RULES.MAX_AVERAGE_CARBON}/일 · 안전일 ${STRESS_TEST_RULES.MIN_SAFE_CARBON_DAYS}일 · 물 초과 ${STRESS_TEST_RULES.MAX_WATER_VIOLATION_DAYS}일 이하(건조 위기 구간, 시험 시작 시 사용량 기준) · 조력 ${STRESS_TEST_RULES.MIN_TIDAL_DELIVERY}E · 복구 ${STRESS_TEST_RULES.RECOVERY_DEADLINE_DAYS}일 이내</p>${stress.result && !stress.result.passed ? `<p class="objective-stress-diagnosis">${escapeHtml(stress.result.diagnosis?.label || '')}</p>` : ''}`;
    els.details.classList.remove('hidden');
  }
  els.expand?.classList.add('hidden');
  return true;
}

function renderQuestQuizModal() {
  const question = currentQuestQuizQuestion(gameState);
  if (!question) return;
  const research = gameState.quizResearchId ? RESEARCH[gameState.quizResearchId] : null;
  const accelerationDays = research ? research.durationDays / RESEARCH_RULES.QUIZ_QUESTION_COUNT : 0;
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">${research ? 'RESEARCH ACCELERATION' : 'CLIMATE QUIZ'}</span><h2>${research ? `${escapeHtml(research.name)} · ` : ''}${escapeHtml(question.title)}</h2></div><button class="icon-btn" type="button" data-quiz-close aria-label="퀴즈 닫기"><i data-lucide="x"></i></button></div>
    <div class="quiz-count">${gameState.quizIndex + 1} / ${gameState.quizPool.length} · ${research ? `정답마다 ${accelerationDays}일 단축` : `통과 ${gameState.quizPassThreshold}문항`}</div>
    <div class="quiz-question">
      <h3>${escapeHtml(question.prompt)}</h3>
      <div class="quiz-options" id="questQuizOptions">${question.options.map((option, index) => `<button class="quiz-option" data-index="${index}">${String.fromCharCode(65 + index)}. ${escapeHtml(option.text)}</button>`).join('')}</div>
      <div id="questQuizExplain"></div>
    </div>
    <div class="modal-actions"><button class="btn primary" id="questQuizNext" disabled>${gameState.quizIndex === gameState.quizPool.length - 1 ? '결과 보기' : '다음'}</button></div>
  `, { id: 'quiz', pausesSimulation: true });
  $modal('[data-quiz-close]').addEventListener('click', () => {
    researchQuizReturnIndex = null;
    closeModal();
    onChanged();
  });
  $$modal('#questQuizOptions .quiz-option').forEach((button) => {
    button.addEventListener('click', () => {
      const result = answerQuestQuiz(gameState, Number(button.dataset.index));
      if (!result) return;
      button.classList.add(result.correct ? 'correct' : 'wrong');
      $$modal('#questQuizOptions .quiz-option')[result.correctIndex]?.classList.add('correct');
      const accelerationText = result.acceleration
        ? result.acceleration.appliedJobs.length
          ? `${RESEARCH[result.researchId]?.name || result.researchId} ${result.acceleration.days}일 단축`
          : result.acceleration.reason === 'question_already_credited'
            ? '이 문항의 가속 보상은 이전 시도에서 이미 반영되었습니다.'
            : '이 연구는 이미 완료되었습니다.'
        : '';
      $modal('#questQuizExplain').innerHTML = `<div class="quiz-explain"><strong>${result.correct ? '정답' : '오답'}</strong><br>${escapeHtml(result.explain)}${accelerationText ? `<br><b>${escapeHtml(accelerationText)}</b>` : ''}</div>`;
      $modal('#questQuizNext').disabled = false;
    });
  });
  $modal('#questQuizNext').addEventListener('click', () => {
    const result = advanceQuestQuiz(gameState);
    if (!result.done) renderQuestQuizModal();
    else renderQuestQuizResultModal(result);
  });
}

function renderQuestQuizResultModal(result) {
  if (result.researchId) {
    const definition = RESEARCH[result.researchId];
    const creditedCount = gameState.research.quizCreditQuestionIds?.[result.researchId]?.length || 0;
    const reducedDays = (definition.durationDays / RESEARCH_RULES.QUIZ_QUESTION_COUNT) * creditedCount;
    setModal(`
      <div class="modal-head"><div><span class="eyebrow">RESEARCH QUIZ COMPLETE</span><h2>${escapeHtml(definition.name)} 가속 결과</h2></div></div>
      <div class="summary-grid"><div class="summary-card"><span>정답</span><strong>${result.correct}/${result.total}</strong></div><div class="summary-card"><span>단축</span><strong>${reducedDays}일</strong></div></div>
      <div class="callout"><strong>선택한 연구에만 반영되었습니다.</strong><p>다른 데이터센터의 연구 진행도는 바뀌지 않습니다.</p></div>
      <div class="modal-actions"><button class="btn primary" id="questQuizFinish">연구 화면으로</button></div>
    `, { id: 'research-quiz-result', pausesSimulation: true });
    $modal('#questQuizFinish').addEventListener('click', () => {
      const dataCenterIndex = researchQuizReturnIndex;
      researchQuizReturnIndex = null;
      closeModal();
      eventBus.emit(Events.RESEARCH_QUIZ_CLOSED, { dataCenterIndex });
      onChanged();
    });
    return;
  }
  if (gameState.stressTest?.status === 'passed') {
    const bonus = result.correct * 2.5;
    setModal(`
      <div class="modal-head"><div><span class="eyebrow">OPTIONAL BONUS</span><h2>개념 퀴즈 보너스</h2></div></div>
      <div class="summary-grid"><div class="summary-card"><span>정답</span><strong>${result.correct}/${result.total}</strong></div><div class="summary-card"><span>보너스</span><strong>+${bonus}점</strong></div></div>
      <div class="callout"><strong>운영 점수는 바뀌지 않습니다.</strong><p>퀴즈 보너스는 도시 운영 100점과 별도로 최종 합계에만 표시됩니다.</p></div>
      <div class="modal-actions"><button class="btn primary" id="questQuizFinish">최종 보고서로</button></div>
    `, { id: 'final-bonus-result', pausesSimulation: true });
    $modal('#questQuizFinish').addEventListener('click', () => {
      eventBus.emit(Events.SAVE_REQUESTED, {});
      eventBus.emit(Events.REPORT_OPEN_REQUESTED, {});
    });
    return;
  }
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">QUIZ RESULT</span><h2>${result.passed ? '퀴즈 통과' : '다시 준비하세요'}</h2></div></div>
    <div class="summary-grid"><div class="summary-card"><span>정답</span><strong>${result.correct}/${result.total}</strong></div><div class="summary-card"><span>통과 기준</span><strong>${result.passThreshold}/${result.total}</strong></div></div>
    <div class="callout"><strong>${result.passed ? '보상을 받을 수 있습니다.' : '도시 상태는 그대로 유지됩니다.'}</strong><p>${result.passed ? '퀘스트 카드에서 보상을 받아 다음 레벨로 이동하세요.' : '설명을 확인한 뒤 퀴즈만 다시 풀 수 있습니다.'}</p></div>
    <div class="modal-actions"><button class="btn primary" id="questQuizFinish">${result.passed ? '확인' : '다시 풀기'}</button></div>
  `, { id: 'quiz', pausesSimulation: true });
  $modal('#questQuizFinish').addEventListener('click', () => {
    if (!result.passed) {
      retryQuestQuiz(gameState);
      renderQuestQuizModal();
      return;
    }
    markQuestQuizResult(gameState, true);
    closeModal();
    onChanged();
  });
}

export function openQuestMap() {
  setModal(`
    <div class="modal-head"><div><span class="eyebrow">QUEST MAP</span><h2>기후 생존 퀘스트</h2></div><button class="icon-btn" id="questMapClose">×</button></div>
    <div class="quest-map-list">${QUESTS.map((baseQuest) => {
      const quest = questForState(gameState, baseQuest.index);
      return `<div class="quest-map-item ${gameState.claimedQuestIds.has(quest.id) ? 'done' : quest.index === gameState.questIndex ? 'active' : 'locked'}"><b>${quest.index}. ${quest.title}</b><span>${gameState.claimedQuestIds.has(quest.id) ? '완료' : quest.index === gameState.questIndex ? '진행 중' : '잠김'}</span></div>`;
    }).join('')}</div>
    ${gameState.credits <= 1 ? `<button class="btn secondary full" id="emergencyCreditBtn">긴급지원 ${formatCredits(4)}</button>` : ''}
  `);
  $modal('#questMapClose').addEventListener('click', closeModal);
  $modal('#emergencyCreditBtn')?.addEventListener('click', () => {
    requestEmergencySupport(gameState);
    closeModal();
    onChanged();
  });
}
