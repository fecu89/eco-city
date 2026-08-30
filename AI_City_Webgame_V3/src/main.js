import './style.css';
import { FACILITIES, LEVEL_VISUALS, TIME } from './core/Constants.js';
import { formatCredits } from './core/Money.js';
import { gameState } from './core/GameState.js';
import { eventBus, Events } from './core/EventBus.js';

import { placeFacility, validatePlacement } from './systems/BoardSystem.js';
import { initSaveSystem, loadSavedGame, clearSavedGame } from './systems/SaveSystem.js';
import { calculatePowerNetwork } from './systems/PowerNetworkSystem.js';
import { settleEconomy } from './systems/EconomySystem.js';
import { createHourSettler, createSimulationController } from './systems/SimulationSystem.js';
import { applySimulationQuestProgress } from './systems/QuestSystem.js';
import { advanceResearchOneHour, researchDemandByIndex } from './systems/ResearchSystem.js';
import { calendarAtElapsedHour, formatCalendar, intervalForTimeScale } from './systems/CalendarSystem.js';
import { createHexCoordinates } from './systems/HexGridSystem.js';

import { closeModal, initModal, refreshIcons } from './ui/Modal.js';
import { initToastView } from './ui/ToastView.js';
import { initGridView, renderGrid } from './ui/GridView.js';
import { finishBirdVisit, getCityCameraState, getCityRendererStats, renderCityScene3D, resetCityCamera, setCityCameraOrbitForTest, setVisualWorldHour, triggerBirdVisit } from './ui/CityScene3D.js';
import { initDockView, renderDock } from './ui/DockView.js';
import { initHudView, renderHud } from './ui/HudView.js';
import { initQuestView, renderQuest } from './ui/QuestView.js';
import { initSimulationHudView, renderSimulationHud } from './ui/SimulationHudView.js';
import { initChartView, requestChartResize, updateChart } from './ui/ChartView.js';
import { initThreeBackground } from './ui/ThreeBackground.js';
import { getWorldHudState, initWorldHud, syncWorldHud } from './ui/WorldHud.js';
import { getTheme, initThemeManager } from './ui/ThemeManager.js';
import { getWorldLightingMode, initWorldLightingManager } from './ui/WorldLightingManager.js';
import { initFeedbackBridge } from './ui/FeedbackBridge.js';
import { initQuestCelebration } from './ui/QuestCelebration.js';
import { getOnboardingState, initOnboardingView, openStory, syncTutorialHighlight } from './ui/OnboardingView.js';
import {
  initStageModals,
  openHelpModal,
  openFacilityInspectorModal,
  openReportModal,
  openResetConfirmModal,
  openCarbonGameOverModal,
  openConstructionRiskModal,
} from './ui/StageModals.js';
import { initAudioManager, toggleMusic } from './audio/AudioManager.js';
import { getAssetStatus } from './level/CityAssetLoader.js';
import { createContinuousClockView } from './ui/ContinuousClockView.js';

const $ = (s) => document.querySelector(s);
const settleHour = createHourSettler({
  calculatePowerNetwork,
  settleEconomy,
  getResearchDemand: researchDemandByIndex,
  advanceResearch: advanceResearchOneHour,
  evaluateQuest: applySimulationQuestProgress,
});
let simulationController = null;
let continuousClockView = null;
let resumeTimeScale = TIME.DEFAULT_SCALE;

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

  boardSizeChip: $('#boardSizeChip'),
  cityGrid: $('#cityGrid'),
  boardOverlay: $('#boardOverlay'),
  facilityDock: $('#facilityDock'),
  facilityDetail: $('#facilityDetail'),
  buildConfirm: $('#buildConfirm'),
  buildConfirmText: $('#buildConfirmText'),
  buildConfirmMetrics: $('#buildConfirmMetrics'),
  cancelBuildBtn: $('#cancelBuildBtn'),
  confirmBuildBtn: $('#confirmBuildBtn'),

  cityChart: $('#cityChart'),

  rightPanel: $('#rightPanel'),
  hudControls: $('#hudControls'),
  hudRail: $('#hudRail'),
  questPanelMapBtn: $('#questPanelMapBtn'),
  questPanelLevel: $('#questPanelLevel'),
  questPanelTitle: $('#questPanelTitle'),
  questPanelGoal: $('#questPanelGoal'),
  questPanelProgressBar: $('#questPanelProgressBar'),
  questPanelReward: $('#questPanelReward'),
  questPanelClaimBtn: $('#questPanelClaimBtn'),
  questPanelContextAction: $('#questPanelContextAction'),
  simTime: $('#simTime'),
  simNet: $('#simNet'),
  simCarbonRate: $('#simCarbonRate'),
  simPower: $('#simPower'),
  simWater: $('#simWater'),
  simLabor: $('#simLabor'),
  simCarbon: $('#simCarbon'),
  simAlert: $('#simAlert'),
  timeControls: $('#timeControls'),
  storyReplayBtn: $('#storyReplayBtn'),
  worldLightingControls: $('#worldLightingControls'),

  mobileBar: document.querySelector('.mobile-bar'),
  toastStack: $('#toastStack'),
  questCelebration: $('#questCelebration'),
  modal: $('#modal'),
  modalCard: $('#modalCard'),
};

function refreshAll() {
  renderHud();
  renderDock();
  renderGrid();
  renderQuest();
  renderSimulationHud();
  updateChart();
}

function settleSimulationHour() {
  const result = settleHour(gameState);
  result.research?.completed?.forEach((completion) => eventBus.emit(Events.RESEARCH_COMPLETED, completion));
  if (result.research?.status !== 'idle') eventBus.emit(Events.RESEARCH_PROGRESS, result.research);
  result.carbonCrisis?.warnings?.forEach((hours) => eventBus.emit(Events.CARBON_WARNING, { hours, summary: result.summary }));
  if (result.carbonCrisis?.gameOverTransition) eventBus.emit(Events.GAME_OVER, { summary: result.summary });
  eventBus.emit(Events.SIMULATION_TICKED, result);
  refreshAll();
  return result;
}

function refreshTimeControls() {
  const paused = gameState.timeScale === 0;
  const toggle = els.timeControls.querySelector('#toggleTimeBtn');
  const fast = els.timeControls.querySelector('#fastForwardBtn');
  toggle.innerHTML = `<i data-lucide="${paused ? 'play' : 'pause'}"></i>`;
  toggle.setAttribute('aria-label', paused ? '재생' : '일시정지');
  toggle.title = paused ? '재생' : '일시정지';
  fast.classList.toggle('active', (paused ? resumeTimeScale : gameState.timeScale) === TIME.FAST_SCALE);
  refreshIcons();
}

function setPlayerTimeScale(scale) {
  if (scale > 0) resumeTimeScale = scale;
  gameState.timeScale = simulationController.setTimeScale(scale);
  continuousClockView?.renderNow();
  refreshTimeControls();
  eventBus.emit(Events.SAVE_REQUESTED, {});
  return gameState.timeScale;
}

function completeFacilityPlacement(index) {
  const result = placeFacility(index);
  if (!result.ok) {
    if (result.reason === 'insufficient_credits') {
      eventBus.emit(Events.TOAST_SHOW, { title: '크레딧 부족', text: `${result.facility.name} 건설: ${formatCredits(result.facility.cost)}` });
    } else eventBus.emit(Events.TOAST_SHOW, { title: result.message || '건설할 수 없습니다.' });
    return;
  }
  eventBus.emit(Events.BOARD_PLACED, result);
  eventBus.emit(Events.AUDIO_SFX, { name: 'place' });
  refreshAll();
}

function forecastOperationsForGrid(grid) {
  const coords = createHexCoordinates(gameState.boardRadius);
  const calendar = calendarAtElapsedHour(gameState.elapsedGameHours);
  const power = calculatePowerNetwork({
    grid,
    coords,
    hour: calendar.hour,
    tickIndex: gameState.tickIndex,
    heatwave: gameState.climateAlert === 'extreme_heat',
    additionalDemandByIndex: researchDemandByIndex(gameState),
  });
  const economy = settleEconomy({ grid, coords, facilityPower: power.facilityPower, credits: gameState.credits });
  return {
    ...economy,
    deliveredPower: power.delivered,
    demand: power.demand,
  };
}

function constructionForecastAt(index) {
  const projectedGrid = gameState.grid.map((cell) => cell ? { ...cell } : null);
  projectedGrid[index] = { type: gameState.selectedFacility, level: 1 };
  const current = forecastOperationsForGrid(gameState.grid);
  const projected = forecastOperationsForGrid(projectedGrid);
  return { current, projected };
}

function constructionRiskAt(index) {
  const { current, projected } = constructionForecastAt(index);
  return {
    currentEconomy: current,
    projectedEconomy: projected,
    risky: projected.netCredits < 0 && projected.netCredits < current.netCredits,
  };
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
  const validation = validatePlacement(gameState, gameState.selectedFacility, index);
  if (!validation.ok) {
    completeFacilityPlacement(index);
    return;
  }
  const risk = constructionRiskAt(index);
  if (risk.risky) {
    openConstructionRiskModal({
      facility: FACILITIES[gameState.selectedFacility],
      currentEconomy: risk.currentEconomy,
      projectedEconomy: risk.projectedEconomy,
      onConfirm: () => completeFacilityPlacement(index),
    });
    return;
  }
  completeFacilityPlacement(index);
}

function handleReset() {
  openResetConfirmModal(() => {
    gameState.reset();
    clearSavedGame();
    refreshAll();
    eventBus.emit(Events.TOAST_SHOW, { title: '초기화 완료', text: '처음부터 다시 시작합니다.' });
  });
}

function resetAfterGameOver() {
  gameState.reset();
  clearSavedGame();
  closeModal();
  simulationController.setTimeScale(gameState.timeScale);
  continuousClockView?.renderNow();
  refreshAll();
  eventBus.emit(Events.TOAST_SHOW, { title: '새 도시 시작', text: '탄소 위기 기록을 초기화했습니다.' });
}

function bindEvents() {
  els.helpBtn.addEventListener('click', openHelpModal);
  els.resetBtn.addEventListener('click', handleReset);
  els.storyReplayBtn.addEventListener('click', () => openStory({ replay: true }));
  els.timeControls.addEventListener('click', (event) => {
    const button = event.target.closest('[data-time-action]');
    if (!button) return;
    if (button.dataset.timeAction === 'toggle') {
      setPlayerTimeScale(gameState.timeScale === 0 ? resumeTimeScale : 0);
      return;
    }
    const effectiveScale = gameState.timeScale === 0 ? resumeTimeScale : gameState.timeScale;
    setPlayerTimeScale(effectiveScale === TIME.FAST_SCALE ? TIME.DEFAULT_SCALE : TIME.FAST_SCALE);
  });

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

}

function simulateLoading() {
  const steps = [
    [24, '도시 보드 구성…'],
    [48, '공간 규칙 연결…'],
    [72, '시각화 로딩…'],
    [92, '미션 준비…'],
    [100, 'CLIMATE CITY 준비 완료'],
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
  initGridView(els.cityGrid, els.boardSizeChip, onCellClick, {
    root: els.buildConfirm,
    text: els.buildConfirmText,
    metrics: els.buildConfirmMetrics,
    cancel: els.cancelBuildBtn,
    confirm: els.confirmBuildBtn,
    getForecast: constructionForecastAt,
  });
  initWorldLightingManager(els.worldLightingControls, setVisualWorldHour, refreshIcons);
  initDockView(els.facilityDock, els.facilityDetail);
  initHudView(els, syncWorldHud);
  initQuestView({
    root: document.querySelector('.quest-panel-current'),
    level: els.questPanelLevel,
    title: els.questPanelTitle,
    goal: els.questPanelGoal,
    bar: els.questPanelProgressBar,
    reward: els.questPanelReward,
    contextAction: els.questPanelContextAction,
    claim: els.questPanelClaimBtn,
    map: els.questPanelMapBtn,
  }, (change) => {
    refreshAll();
    if (change?.phase !== 'reward_closed') return;
    if (change.quest.index === 15) openReportModal();
  });
  initSimulationHudView({ time: els.simTime, net: els.simNet, carbonRate: els.simCarbonRate, power: els.simPower, water: els.simWater, labor: els.simLabor, carbon: els.simCarbon, alert: els.simAlert });
  initChartView(els.cityChart);
  initStageModals(refreshAll);
  initFeedbackBridge();
  initQuestCelebration(els.questCelebration);
  initOnboardingView();
  initSaveSystem();
  initAudioManager();
  initWorldHud({
    controls: els.hudControls,
    desktopRail: els.hudRail,
    mobileBar: els.mobileBar,
    panelHost: els.rightPanel,
    panels: [...document.querySelectorAll('[data-hud-panel]')],
    onStatusOpened: requestChartResize,
  });
  initThreeBackground(els.threeBg);

  loadSavedGame();
  resumeTimeScale = gameState.timeScale || TIME.DEFAULT_SCALE;

  simulationController = createSimulationController({ settle: settleSimulationHour, getIntervalMs: intervalForTimeScale });
  simulationController.setTimeScale(gameState.timeScale);
  continuousClockView = createContinuousClockView({
    timeElement: els.simTime,
    getElapsedHours: () => gameState.elapsedGameHours,
    getProgress: () => simulationController.getProgress(),
  });
  eventBus.on(Events.MODAL_OPEN, ({ pausesSimulation, pauseReason }) => {
    if (pausesSimulation) {
      simulationController.pause(pauseReason);
      continuousClockView?.renderNow();
    }
  });
  eventBus.on(Events.MODAL_CLOSE, ({ pausesSimulation, pauseReason }) => {
    if (pausesSimulation) {
      simulationController.resume(pauseReason);
      continuousClockView?.renderNow();
    }
  });
  eventBus.on(Events.CARBON_WARNING, ({ hours }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '탄소 위기 경보',
      text: `${hours}/168시간 · 시간당 탄소를 8 이하로 낮추세요.`,
      priority: true,
    });
  });
  eventBus.on(Events.GAME_OVER, ({ summary }) => {
    openCarbonGameOverModal({ hourlyCarbon: summary?.hourlyCarbon, onReset: resetAfterGameOver });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) simulationController.pause('hidden');
    else simulationController.resume('hidden');
  });
  simulationController.start();
  continuousClockView.start();
  if (gameState.gameOver) {
    openCarbonGameOverModal({ hourlyCarbon: gameState.lastTickSummary?.hourlyCarbon, onReset: resetAfterGameOver });
  }

  bindEvents();
  refreshAll();
  refreshTimeControls();
  syncTutorialHighlight();

  simulateLoading();
  openStory();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// --- 테스트/에이전트용 훅 ---
window.__GAME_STATE__ = gameState;
window.__EVENT_BUS__ = eventBus;
window.__EVENTS__ = Events;
window.__getCityCameraState = () => getCityCameraState();
window.__resetCityCamera = () => resetCityCamera();
window.__setCityCameraOrbitForTest = (azimuth, polar) => setCityCameraOrbitForTest(azimuth, polar);
window.__getCityAssetStatus = () => getAssetStatus();
window.__getCityLevelVisuals = () => LEVEL_VISUALS.slice(1).map((level) => ({ ...level }));
window.__getCityRendererStats = () => getCityRendererStats();
window.__getWorldHudState = () => getWorldHudState();
window.__getTheme = () => getTheme();
window.__getWorldLightingMode = () => getWorldLightingMode();
window.__getOnboardingState = () => getOnboardingState();
window.__openStoryForTest = () => openStory({ replay: true });
window.__renderCityForTest = () => renderGrid();
window.__refreshGameForTest = () => refreshAll();
window.__settleSimulationHour = () => settleSimulationHour();
window.__getSimulationState = () => simulationController?.getState();
window.__setTimeScale = (scale) => {
  const applied = setPlayerTimeScale(scale);
  refreshAll();
  return applied;
};
window.__renderCityConfigsForTest = (configs, size) => renderCityScene3D(configs, size);
window.__triggerBirdVisitForTest = (greenIndex, birdCount = 2) => triggerBirdVisit(greenIndex, birdCount);
window.__finishBirdVisitForTest = () => finishBirdVisit();

window.render_game_to_text = () => {
  const m = gameState.metrics;
  const coords = createHexCoordinates(gameState.boardRadius);
  const calendar = calendarAtElapsedHour(gameState.elapsedGameHours);
  const visualCalendar = calendarAtElapsedHour(gameState.elapsedGameHours + (simulationController?.getProgress() || 0));
  const payload = {
    coords: 'axial pointy-top hex grid; index 0 is center; radius 2=19 cells, radius 3=37 cells',
    mode: gameState.gameOver ? 'game_over' : 'playing',
    stage: gameState.stage,
    quest: gameState.questIndex,
    questStatus: gameState.questStatus,
    gameTime: { ...calendar, label: formatCalendar(calendar), timeScale: gameState.timeScale },
    visualGameTime: { ...visualCalendar, label: formatCalendar(visualCalendar) },
    climateAlert: gameState.climateAlert,
    carbonCrisisHours: gameState.carbonCrisisHours,
    carbonCrisisLimit: 168,
    turn: gameState.turn,
    credits: gameState.credits,
    devScore: m ? m.dev : 0,
    metrics: m,
    boardRadius: gameState.boardRadius,
    entities: gameState.grid
      .map((cell, index) => (cell ? { index, ...coords[index], type: cell.type, level: cell.level } : null))
      .filter(Boolean),
    selectedFacility: gameState.selectedFacility,
    selectedCell: gameState.selectedCell,
    research: {
      jobs: gameState.research.jobs,
      completedIds: [...gameState.research.completedIds],
      techLevels: gameState.research.techLevels,
      quizAccelerationBankHours: gameState.research.quizAccelerationBankHours,
    },
    island: getCityRendererStats().environment,
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
