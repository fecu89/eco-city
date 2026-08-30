import './style.css';
import { LEVEL_VISUALS, STAGES } from './core/Constants.js';
import { gameState } from './core/GameState.js';
import { eventBus, Events } from './core/EventBus.js';

import { placeFacility } from './systems/BoardSystem.js';
import { initAchievementSystem } from './systems/AchievementSystem.js';
import { ask, blindBuild } from './systems/AdvisorSystem.js';
import { initSaveSystem, loadSavedGame, clearSavedGame } from './systems/SaveSystem.js';
import { calculatePowerNetwork } from './systems/PowerNetworkSystem.js';
import { settleEconomy } from './systems/EconomySystem.js';
import { createHourSettler, createSimulationController } from './systems/SimulationSystem.js';
import { applySimulationQuestProgress } from './systems/QuestSystem.js';

import { initModal, refreshIcons } from './ui/Modal.js';
import { initToastView } from './ui/ToastView.js';
import { initGridView, renderGrid } from './ui/GridView.js';
import { finishBirdVisit, getCityCameraState, getCityRendererStats, renderCityScene3D, resetCityCamera, triggerBirdVisit } from './ui/CityScene3D.js';
import { initDiagnosisView, renderDiagnosisGrid, handleUseHint } from './ui/DiagnosisView.js';
import { initDockView, renderDock } from './ui/DockView.js';
import { initHudView, renderHud } from './ui/HudView.js';
import { initAdvisorPanel, renderPromptChips, initBadgesPanel, renderBadges } from './ui/PanelViews.js';
import { initQuestView, renderQuest } from './ui/QuestView.js';
import { initSimulationHudView, renderSimulationHud } from './ui/SimulationHudView.js';
import { initChartView, requestChartResize, updateChart } from './ui/ChartView.js';
import { initThreeBackground } from './ui/ThreeBackground.js';
import { getWorldHudState, initWorldHud, syncWorldHud } from './ui/WorldHud.js';
import { getTheme, initThemeManager } from './ui/ThemeManager.js';
import { initFeedbackBridge } from './ui/FeedbackBridge.js';
import { initAchievementCelebration } from './ui/AchievementCelebration.js';
import {
  initStageModals,
  openHelpModal,
  openFacilityInspectorModal,
  openCrisisModal,
  openReportModal,
  openResetConfirmModal,
} from './ui/StageModals.js';
import { initAudioManager, toggleMusic } from './audio/AudioManager.js';
import { getAssetStatus } from './level/CityAssetLoader.js';

const $ = (s) => document.querySelector(s);
const settleHour = createHourSettler({ calculatePowerNetwork, settleEconomy, evaluateQuest: applySimulationQuestProgress });
let simulationController = null;

const els = {
  loading: $('#loadingScreen'),
  loadingText: $('#loadingText'),
  loadingBar: $('#loadingBar'),
  threeBg: $('#threeBg'),

  phaseText: $('#phaseText'),
  helpBtn: $('#helpBtn'),
  musicBtn: $('#musicBtn'),
  soundBtn: $('#soundBtn'),
  themeBtn: $('#themeBtn'),
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
  blindBuildBtn: $('#aiBlindBuildBtn'),

  boardSizeChip: $('#boardSizeChip'),
  diagnosisProgress: $('#diagnosisProgress'),
  diagnosisHintBtn: $('#diagnosisHintBtn'),
  cityGrid: $('#cityGrid'),
  boardOverlay: $('#boardOverlay'),
  facilityDock: $('#facilityDock'),

  advisorLog: $('#advisorLog'),
  promptChips: $('#promptChips'),

  badges: $('#badges'),
  badgeCount: $('#badgeCount'),

  cityChart: $('#cityChart'),

  rightPanel: $('#rightPanel'),
  hudControls: $('#hudControls'),
  hudRail: $('#hudRail'),
  questTracker: $('#questTracker'),
  questLevel: $('#questLevel'),
  questTitle: $('#questTitle'),
  questGoal: $('#questGoal'),
  questProgressBar: $('#questProgressBar'),
  questReward: $('#questReward'),
  questClaimBtn: $('#questClaimBtn'),
  questMapBtn: $('#questMapBtn'),
  simTime: $('#simTime'),
  simNet: $('#simNet'),
  simPower: $('#simPower'),
  simCarbon: $('#simCarbon'),
  simAlert: $('#simAlert'),

  mobileBar: document.querySelector('.mobile-bar'),
  toastStack: $('#toastStack'),
  achievementCelebration: $('#achievementCelebration'),
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
  renderQuest();
  renderSimulationHud();
  updateChart();
}

function settleSimulationHour() {
  const result = settleHour(gameState);
  eventBus.emit(Events.SIMULATION_TICKED, result);
  eventBus.emit(Events.SAVE_REQUESTED, {});
  refreshAll();
  return result;
}

function onCellClick(index) {
  gameState.selectedCell = index;
  const existing = gameState.grid[index];
  if (existing) {
    openFacilityInspectorModal(index);
    renderGrid();
    return;
  }
  if (getWorldHudState().activePanel !== 'build') {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '건설 메뉴를 먼저 여세요',
      text: '오른쪽 건설 버튼을 누르면 빈 대지에 시설을 지을 수 있습니다.',
    });
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
  els.blindBuildBtn.addEventListener('click', handleBlindBuild);
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
  initThemeManager(els.themeBtn, refreshIcons);
  initToastView(els.toastStack);
  initGridView(els.cityGrid, els.boardSizeChip, onCellClick);
  initDiagnosisView(els.cityGrid, els.boardSizeChip, els.diagnosisProgress, els.diagnosisHintBtn);
  initDockView(els.facilityDock, $('#selectedFacilitySummary'));
  initHudView(els, syncWorldHud);
  initAdvisorPanel(els.advisorLog, els.promptChips, (type) => ask(type));
  initBadgesPanel(els.badges, els.badgeCount);
  initQuestView({
    root: els.questTracker,
    level: els.questLevel,
    title: els.questTitle,
    goal: els.questGoal,
    bar: els.questProgressBar,
    reward: els.questReward,
    claim: els.questClaimBtn,
    map: els.questMapBtn,
  }, (change) => {
    refreshAll();
    if (change?.phase !== 'reward_closed') return;
    if (change.quest.index === 4) openCrisisModal(gameState.baseline);
    if (change.quest.index === 15) openReportModal();
  });
  initSimulationHudView({ time: els.simTime, net: els.simNet, power: els.simPower, carbon: els.simCarbon, alert: els.simAlert });
  initChartView(els.cityChart);
  initStageModals(refreshAll);
  initFeedbackBridge();
  initAchievementCelebration(els.achievementCelebration);
  initAchievementSystem();
  eventBus.on(Events.DIAGNOSIS_TILE_FOUND, refreshAll);
  initSaveSystem();
  initAudioManager();
  initWorldHud({
    controls: els.hudControls,
    desktopRail: els.hudRail,
    mobileBar: els.mobileBar,
    panelHost: els.rightPanel,
    panels: [...document.querySelectorAll('[data-hud-panel]')],
    buildTriggerSummary: $('#selectedFacilitySummary'),
    onStatusOpened: requestChartResize,
  });
  initThreeBackground(els.threeBg);

  const loaded = loadSavedGame();

  simulationController = createSimulationController({ settle: settleSimulationHour });
  eventBus.on(Events.MODAL_OPEN, () => simulationController.pause('modal'));
  eventBus.on(Events.MODAL_CLOSE, () => simulationController.resume('modal'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) simulationController.pause('hidden');
    else simulationController.resume('hidden');
  });
  simulationController.start();

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
window.__getTheme = () => getTheme();
window.__renderCityForTest = () => renderGrid();
window.__refreshGameForTest = () => refreshAll();
window.__settleSimulationHour = () => settleSimulationHour();
window.__getSimulationState = () => simulationController?.getState();
window.__renderCityConfigsForTest = (configs, size) => renderCityScene3D(configs, size);
window.__triggerBirdVisitForTest = (greenIndex, birdCount = 2) => triggerBirdVisit(greenIndex, birdCount);
window.__finishBirdVisitForTest = () => finishBirdVisit();

window.render_game_to_text = () => {
  const m = gameState.metrics;
  const payload = {
    coords: 'grid index 0..gridSize*gridSize-1, row-major, origin top-left',
    mode: 'playing',
    stage: gameState.stage,
    quest: gameState.questIndex,
    questStatus: gameState.questStatus,
    gameTime: { day: gameState.simulationDay, hour: gameState.simulationHour },
    climateAlert: gameState.climateAlert,
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
    simulation: gameState.lastTickSummary,
    netCreditsPerHour: gameState.lastTickSummary?.netCredits ?? 0,
    deliveredPower: gameState.lastTickSummary?.deliveredPower ?? 0,
    demand: gameState.lastTickSummary?.demand ?? 0,
    lowCarbonPercent: gameState.lastTickSummary?.lowCarbonPercent ?? 0,
    workforce: gameState.lastTickSummary?.workforce ?? 0,
    jobs: gameState.lastTickSummary?.jobs ?? 0,
    facilityPowerRatios: Object.fromEntries(Object.entries(gameState.lastTickSummary?.facilityPower || {}).map(([index, item]) => [index, item.ratio])),
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
