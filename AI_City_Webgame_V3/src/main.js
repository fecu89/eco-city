import './style.css';
import anime from 'animejs';

import { LEVEL_VISUALS, STAGES, STAGE_INFO } from './core/Constants.js';
import { gameState } from './core/GameState.js';
import { eventBus, Events } from './core/EventBus.js';

import { placeFacility } from './systems/BoardSystem.js';
import { initAchievementSystem } from './systems/AchievementSystem.js';
import { ask, blindBuild, defaultAdvisorTopic } from './systems/AdvisorSystem.js';
import { revealCrisis } from './systems/CrisisSystem.js';
import { startQuiz } from './systems/ConceptsSystem.js';
import { finishDiagnosis } from './systems/DiagnosisSystem.js';
import { initSaveSystem, loadSavedGame, clearSavedGame } from './systems/SaveSystem.js';

import { initModal, refreshIcons } from './ui/Modal.js';
import { initToastView } from './ui/ToastView.js';
import { initGridView, renderGrid } from './ui/GridView.js';
import { getCityCameraState, getCityRendererStats, renderCityScene3D, resetCityCamera } from './ui/CityScene3D.js';
import { initDiagnosisView, renderDiagnosisGrid, handleUseHint } from './ui/DiagnosisView.js';
import { initDockView, renderDock } from './ui/DockView.js';
import { initHudView, renderHud } from './ui/HudView.js';
import { initAdvisorPanel, renderPromptChips, initBadgesPanel, renderBadges, initEvidencePanel, renderEvidence } from './ui/PanelViews.js';
import { initChartView, updateChart } from './ui/ChartView.js';
import { initThreeBackground } from './ui/ThreeBackground.js';
import { getWorldHudState, initWorldHud } from './ui/WorldHud.js';
import { initFeedbackBridge } from './ui/FeedbackBridge.js';
import {
  initStageModals,
  openHelpModal,
  openFacilityInspectorModal,
  openCrisisModal,
  openEnergyScaleModal,
  renderQuizModal,
  openRedesignCheckModal,
  openBonusValidationModal,
  openReportModal,
  openResetConfirmModal,
} from './ui/StageModals.js';
import { initAudioManager, toggleMusic } from './audio/AudioManager.js';
import { getAssetStatus } from './level/CityAssetLoader.js';

const $ = (s) => document.querySelector(s);

const els = {
  loading: $('#loadingScreen'),
  loadingText: $('#loadingText'),
  loadingBar: $('#loadingBar'),
  threeBg: $('#threeBg'),

  phaseText: $('#phaseText'),
  helpBtn: $('#helpBtn'),
  musicBtn: $('#musicBtn'),
  soundBtn: $('#soundBtn'),
  resetBtn: $('#resetBtn'),

  missionTitle: $('#missionTitle'),
  teacherNote: $('#teacherNote'),
  turnCount: $('#turnCount'),
  credits: $('#credits'),
  devScore: $('#devScore'),
  energyScore: $('#energyScore'),
  carbonScore: $('#carbonScore'),
  waterScore: $('#waterScore'),
  energyCard: $('#energyCard'),
  carbonCard: $('#carbonCard'),
  waterCard: $('#waterCard'),
  advanceBtn: $('#advanceBtn'),
  blindBuildBtn: $('#aiBlindBuildBtn'),

  boardSizeChip: $('#boardSizeChip'),
  diagnosisProgress: $('#diagnosisProgress'),
  diagnosisHintBtn: $('#diagnosisHintBtn'),
  cityGrid: $('#cityGrid'),
  boardOverlay: $('#boardOverlay'),
  facilityDock: $('#facilityDock'),

  aiAdviceBtn: $('#aiAdviceBtn'),
  advisorLog: $('#advisorLog'),
  promptChips: $('#promptChips'),

  badges: $('#badges'),
  badgeCount: $('#badgeCount'),

  cityChart: $('#cityChart'),

  rightPanel: $('#rightPanel'),
  hudControls: $('#hudControls'),
  hudRail: $('#hudRail'),
  evidenceBox: $('#evidenceBox'),
  evidenceCount: $('#evidenceCount'),
  evidenceList: $('#evidenceList'),

  mobileBar: document.querySelector('.mobile-bar'),
  toastStack: $('#toastStack'),
  modal: $('#modal'),
  modalCard: $('#modalCard'),
};

function refreshAll() {
  const isDiagnosis = gameState.stage === STAGES.DIAGNOSIS;
  els.diagnosisProgress.classList.toggle('hidden', !isDiagnosis);
  els.diagnosisHintBtn.classList.toggle('hidden', !isDiagnosis);
  renderHud();
  renderDock();
  if (isDiagnosis) renderDiagnosisGrid();
  else renderGrid();
  renderBadges();
  renderEvidence();
  updateChart();
}

function onCellClick(index) {
  gameState.selectedCell = index;
  const existing = gameState.grid[index];
  if (existing) {
    openFacilityInspectorModal(index);
    renderGrid();
    return;
  }
  if (!gameState.isEditable) {
    renderGrid();
    eventBus.emit(Events.TOAST_SHOW, { title: '현재는 편집할 수 없습니다.' });
    return;
  }
  const result = placeFacility(index);
  if (!result.ok) {
    if (result.reason === 'insufficient_credits') {
      eventBus.emit(Events.TOAST_SHOW, { title: '크레딧 부족', text: `${result.facility.name} 건설: ${result.facility.cost}C` });
    } else if (result.reason === 'locked') {
      eventBus.emit(Events.TOAST_SHOW, { title: '아직 해금되지 않은 시설입니다.' });
    }
    return;
  }
  eventBus.emit(Events.AUDIO_SFX, { name: 'place' });
  refreshAll();
}

function handleAdvance() {
  switch (gameState.stage) {
    case STAGES.EXECUTION: {
      const { baseline } = revealCrisis();
      els.boardOverlay.classList.remove('hidden');
      anime({ targets: '.left-panel', translateX: [0, -7, 7, -4, 4, 0], duration: 500 });
      anime({ targets: '.crisis-stamp', scale: [1.4, 1], opacity: [0, 1], duration: 400, easing: 'easeOutBack' });
      openCrisisModal(baseline);
      break;
    }
    case STAGES.CRISIS:
      openCrisisModal(gameState.baseline);
      break;
    case STAGES.CONCEPTS:
      if (!gameState.energyScaleSeen) openEnergyScaleModal();
      else if (gameState.quizPool.length) renderQuizModal();
      else {
        startQuiz();
        renderQuizModal();
      }
      break;
    case STAGES.DIAGNOSIS:
      finishDiagnosis();
      refreshAll();
      break;
    case STAGES.REDESIGN:
      if (gameState.bonusRound.active) openBonusValidationModal();
      else openRedesignCheckModal();
      break;
    case STAGES.REPORT:
    default:
      openReportModal();
      break;
  }
  refreshAll();
}

function handleBlindBuild() {
  const result = blindBuild();
  if (!result.ok) {
    const messages = {
      grid_full: '보드가 가득 찼습니다.',
      insufficient_credits: '크레딧이 부족합니다.',
      wrong_stage: '지금은 사용할 수 없습니다.',
    };
    eventBus.emit(Events.TOAST_SHOW, { title: messages[result.reason] || '실행할 수 없습니다.' });
    return;
  }
  eventBus.emit(Events.AUDIO_SFX, { name: 'place' });
  refreshAll();
}

function handleReset() {
  openResetConfirmModal(() => {
    gameState.reset();
    clearSavedGame();
    els.advisorLog.innerHTML =
      '<div class="message ai"><b>AI</b><p>성장점수를 높이려면 데이터센터·공장을 우선 투자하세요. 전력시설도 필요합니다.</p></div>';
    renderPromptChips();
    refreshAll();
    eventBus.emit(Events.TOAST_SHOW, { title: '초기화 완료', text: '처음부터 다시 시작합니다.' });
  });
}

function bindEvents() {
  els.aiAdviceBtn.addEventListener('click', () => ask(defaultAdvisorTopic()));
  els.blindBuildBtn.addEventListener('click', handleBlindBuild);
  els.advanceBtn.addEventListener('click', handleAdvance);
  els.helpBtn.addEventListener('click', openHelpModal);
  els.resetBtn.addEventListener('click', handleReset);

  els.soundBtn.addEventListener('click', () => {
    eventBus.emit(Events.AUDIO_TOGGLE_MUTE, {});
    els.soundBtn.innerHTML = `<i data-lucide="${gameState.sound ? 'volume-2' : 'volume-x'}"></i>`;
    refreshIcons();
  });

  els.musicBtn.addEventListener('click', () => {
    const enabled = toggleMusic();
    els.musicBtn.classList.toggle('active', enabled);
    refreshIcons();
  });

  els.diagnosisHintBtn.addEventListener('click', () => {
    const index = handleUseHint();
    if (index == null) {
      eventBus.emit(Events.TOAST_SHOW, { title: '더 이상 힌트가 없습니다.' });
      return;
    }
    eventBus.emit(Events.TOAST_SHOW, { title: '힌트 사용', text: '완벽 진단 배지 조건에서 제외됩니다.' });
  });
}

function simulateLoading() {
  const steps = [
    [24, '도시 보드 구성…'],
    [48, '공간 규칙 연결…'],
    [72, '시각화 로딩…'],
    [92, '미션 준비…'],
    [100, 'AI CITY 준비 완료'],
  ];
  steps.forEach(([p, t], i) => {
    setTimeout(() => {
      els.loadingBar.style.width = `${p}%`;
      els.loadingText.textContent = t;
      if (p === 100) setTimeout(() => els.loading.classList.add('done'), 300);
    }, i * 220);
  });
}

function boot() {
  initModal(els.modal, els.modalCard);
  initToastView(els.toastStack);
  initGridView(els.cityGrid, els.boardSizeChip, onCellClick);
  initDiagnosisView(els.cityGrid, els.boardSizeChip, els.diagnosisProgress, els.diagnosisHintBtn);
  initDockView(els.facilityDock);
  initHudView(els);
  initAdvisorPanel(els.advisorLog, els.promptChips, (type) => ask(type));
  initBadgesPanel(els.badges, els.badgeCount);
  initEvidencePanel({
    count: els.evidenceCount,
    list: els.evidenceList,
  });
  initChartView(els.cityChart);
  initStageModals(refreshAll);
  initFeedbackBridge();
  initAchievementSystem();
  initSaveSystem();
  initAudioManager();
  initWorldHud({
    controls: els.hudControls,
    desktopRail: els.hudRail,
    mobileBar: els.mobileBar,
    panelHost: els.rightPanel,
    panels: [...document.querySelectorAll('[data-hud-panel]')],
    buildTriggerSummary: $('#selectedFacilitySummary'),
    evidenceBox: els.evidenceBox,
  });
  initThreeBackground(els.threeBg);

  const loaded = loadSavedGame();

  bindEvents();
  renderPromptChips();
  refreshAll();

  simulateLoading();
  if (!loaded) {
    setTimeout(() => {
      eventBus.emit(Events.TOAST_SHOW, { title: '시장 임명 완료', text: '빈 칸=건설 · 건물 터치=업그레이드/철거 · 🔗=인접 보너스' });
    }, 1200);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// --- 테스트/에이전트용 훅 ---
window.__GAME_STATE__ = gameState;
window.__EVENT_BUS__ = eventBus;
window.__EVENTS__ = Events;
window.__getCityCameraState = () => getCityCameraState();
window.__resetCityCamera = () => resetCityCamera();
window.__getCityAssetStatus = () => getAssetStatus();
window.__getCityLevelVisuals = () => LEVEL_VISUALS.slice(1).map((level) => ({ ...level }));
window.__getCityRendererStats = () => getCityRendererStats();
window.__getWorldHudState = () => getWorldHudState();
window.__renderCityForTest = () => renderGrid();
window.__renderCityConfigsForTest = (configs, size) => renderCityScene3D(configs, size);

window.render_game_to_text = () => {
  const m = gameState.metrics;
  const info = STAGE_INFO[gameState.stage];
  const payload = {
    coords: 'grid index 0..gridSize*gridSize-1, row-major, origin top-left',
    mode: 'playing',
    stage: gameState.stage,
    stageLabel: info.label,
    turn: gameState.turn,
    credits: gameState.credits,
    devScore: m ? m.dev : 0,
    metrics: m,
    gridSize: gameState.gridSize,
    entities: gameState.grid
      .map((cell, index) => (cell ? { index, type: cell.type, level: cell.level } : null))
      .filter(Boolean),
    selectedFacility: gameState.selectedFacility,
    selectedCell: gameState.selectedCell,
    badges: [...gameState.badges],
    evidenceCount: gameState.evidence.length,
    bonusRoundActive: gameState.bonusRound.active,
  };
  return JSON.stringify(payload);
};

window.advanceTime = (ms) =>
  new Promise((resolve) => {
    const start = performance.now();
    function step() {
      if (performance.now() - start >= ms) return resolve();
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
