import './style.css';
import { CARBON_CRISIS, CITY_FAILURE_RULES, FACILITIES, FLOATING_PANEL_STORAGE, GRID_RESERVE_RULES, LEVEL_VISUALS, LOADING_SCREEN, TIME } from './core/Constants.js';
import { gameState } from './core/GameState.js';
import { eventBus, Events } from './core/EventBus.js';

import { assessConstructionPlan, commitConstructionPlan } from './systems/ConstructionPlanSystem.js';
import { clearSavedGame, flushSave, initSaveSystem, loadSavedGame } from './systems/SaveSystem.js';
import { calculatePowerNetwork } from './systems/PowerNetworkSystem.js';
import { settleEconomy } from './systems/EconomySystem.js';
import { createDaySettler, createSimulationController } from './systems/SimulationSystem.js';
import { applySimulationQuestProgress } from './systems/QuestSystem.js';
import { advanceResearchOneDay, researchDemandByIndex } from './systems/ResearchSystem.js';
import { calendarAtElapsedDay, formatCalendar, intervalForTimeScale } from './systems/CalendarSystem.js';
import { createHexCoordinates } from './systems/HexGridSystem.js';
import { buildCityModifierContext } from './systems/CityModifierSystem.js';
import { forecastConstruction, forecastUpgrade } from './systems/SimulationForecastSystem.js';
import { expansionChoicePending } from './systems/ZoneSystem.js';

import { clearModalQueue, closeModal, getModalState, initModal, refreshIcons } from './ui/Modal.js';
import { initToastView } from './ui/ToastView.js';
import { initGridView, renderGrid } from './ui/GridView.js';
import { disposeCityScene3D, finishBirdVisit, finishFacilityAmbientEffects, getCityCameraState, getCityRendererStats, refreshCityConstructionProgress, renderCityScene3D, resetCityCamera, setBuildPreviewMode, setCityCameraOrbitForTest, setVisualWorldHour, triggerBirdVisit, triggerFacilityAmbient } from './ui/CityScene3D.js';
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
import { initQuestPanelController } from './ui/QuestPanelController.js';
import { createFloatingPanelController } from './ui/FloatingPanelController.js';
import { ONBOARDING_VERSION, getOnboardingState, initOnboardingView, openStory, syncTutorialHighlight } from './ui/OnboardingView.js';
import {
  initStageModals,
  openHelpModal,
  openFacilityInspectorModal,
  openReportModal,
  openResetConfirmModal,
  openCarbonGameOverModal,
  openConstructionRiskModal,
  openOperationalRiskModal,
  openHudMetricCausesModal,
  openStressTestModal,
  openStressResultModal,
  refreshStageConstructionProgress,
} from './ui/StageModals.js';
import { audioContextState, initAudioManager, toggleMusic } from './audio/AudioManager.js';
import { getAssetStatus } from './level/CityAssetLoader.js';
import { createContinuousClockView } from './ui/ContinuousClockView.js';
import { CITY_EVENTS, EVENT_FORECAST_DAYS, STRESS_PHASES } from './core/EventDefinitions.js';
import { initForecastView, renderForecast } from './ui/ForecastView.js';
import { showEventResult } from './ui/EventResultView.js';

const $ = (s) => document.querySelector(s);
const settleDay = createDaySettler({
  calculatePowerNetwork,
  settleEconomy,
  getResearchDemand: researchDemandByIndex,
  advanceResearch: advanceResearchOneDay,
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
  buildPanel: $('#buildPanel'),
  facilityDock: $('#facilityDock'),
  facilityDetail: $('#facilityDetail'),
  buildConfirm: $('#buildConfirm'),
  buildConfirmText: $('#buildConfirmText'),
  buildConfirmMetrics: $('#buildConfirmMetrics'),
  buildForecastTimeline: $('#buildForecastTimeline'),
  buildPlanCost: $('#buildPlanCost'),
  buildPlanBalance: $('#buildPlanBalance'),
  buildPlanError: $('#buildPlanError'),

  cityChart: $('#cityChart'),

  rightPanel: $('#rightPanel'),
  hudControls: $('#hudControls'),
  hudRail: $('#hudRail'),
  questPanelMapBtn: $('#questPanelMapBtn'),
  questPanel: $('#questPanel'),
  questPanelPinBtn: $('#questPanelPinBtn'),
  questPanelLevel: $('#questPanelLevel'),
  questPanelTitle: $('#questPanelTitle'),
  questPanelGoal: $('#questPanelGoal'),
  questPanelProgressBar: $('#questPanelProgressBar'),
  questPanelReward: $('#questPanelReward'),
  questPanelClaimBtn: $('#questPanelClaimBtn'),
  questPanelEmergencyBtn: $('#questPanelEmergencyBtn'),
  simTime: $('#simTime'),
  simNet: $('#simNet'),
  simCarbonRate: $('#simCarbonRate'),
  simPower: $('#simPower'),
  simBattery: $('#simBattery'),
  simWater: $('#simWater'),
  statusWorkforce: $('#statusWorkforce'),
  simCarbon: $('#simCarbon'),
  simAlert: $('#simAlert'),
  timeControls: $('#timeControls'),
  storyReplayBtn: $('#storyReplayBtn'),
  worldLightingControls: $('#worldLightingControls'),
  forecastStrip: $('#forecastStrip'),
  srAnnouncer: $('#srAnnouncer'),

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
  renderForecast();
  updateChart();
  refreshAudioControls();
  // 시계 루프가 쉬는 동안에는 날짜 라벨과 공사 배지의 유일한 갱신 지점이 여기다.
  // 공사가 새로 시작됐다면 이 호출이 rAF 루프도 다시 깨운다.
  continuousClockView?.renderNow();
}

function refreshAudioControls() {
  els.musicBtn.classList.toggle('active', gameState.musicEnabled);
  els.musicBtn.setAttribute('aria-pressed', String(gameState.musicEnabled));
  els.musicBtn.title = gameState.musicEnabled ? '배경음 끄기' : '배경음 켜기';
  els.soundBtn.classList.toggle('active', gameState.sound);
  els.soundBtn.setAttribute('aria-pressed', String(gameState.sound));
  els.soundBtn.title = gameState.sound ? '효과음 끄기' : '효과음 켜기';
}

function settleSimulationDay() {
  const result = settleDay(gameState);
  result.construction?.stageChanged?.forEach((transition) => {
    eventBus.emit(Events.CONSTRUCTION_STAGE_CHANGED, transition);
  });
  result.construction?.completed?.forEach((completion) => {
    const facility = FACILITIES[completion.type];
    if (completion.kind === 'build') {
      eventBus.emit(Events.CONSTRUCTION_COMPLETED, completion);
      eventBus.emit(Events.BOARD_PLACED, {
        ...completion,
        key: completion.type,
        type: facility?.name || completion.type,
        metrics: gameState.metrics,
        placedCount: gameState.grid.filter(Boolean).length,
      });
    } else {
      eventBus.emit(Events.UPGRADE_COMPLETED, completion);
      eventBus.emit(Events.BOARD_UPGRADED, {
        ...completion,
        key: completion.type,
        type: facility?.name || completion.type,
        metrics: gameState.metrics,
      });
    }
    eventBus.emit(Events.TOAST_SHOW, {
      kicker: completion.kind === 'build' ? 'CONSTRUCTION COMPLETE' : 'UPGRADE COMPLETE',
      title: `${facility?.name || completion.type} ${completion.kind === 'build' ? '완공' : `Lv.${completion.level} 강화 완료`}`,
      text: '이번 일일 정산부터 새 성능이 적용됩니다.',
    });
    eventBus.emit(Events.AUDIO_SFX, { name: completion.kind === 'build' ? 'place' : 'upgrade' });
  });
  result.research?.completed?.forEach((completion) => eventBus.emit(Events.RESEARCH_COMPLETED, completion));
  if (result.research?.status !== 'idle') eventBus.emit(Events.RESEARCH_PROGRESS, result.research);
  result.carbonCrisis?.warnings?.forEach((days) => eventBus.emit(Events.CARBON_WARNING, { days, summary: result.summary }));
  if (result.carbonCrisis?.gameOverTransition) eventBus.emit(Events.GAME_OVER, { summary: result.summary });
  result.operationalRisk?.warnings?.forEach((warning) => eventBus.emit(Events.OPERATIONAL_RISK_WARNING, {
    warning,
    risk: result.operationalRisk,
  }));
  if (result.operationalRisk?.pauseTransition) eventBus.emit(Events.OPERATIONAL_RISK_PAUSE, {
    reason: result.operationalRisk.pauseTransition,
  });
  if (result.operationalRisk?.gameOverTransition) eventBus.emit(Events.GAME_OVER, {
    summary: result.summary,
    reason: gameState.gameOverReason,
  });
  if (result.cityEvent?.forecasted) eventBus.emit(Events.CITY_EVENT_FORECASTED, result.cityEvent.forecasted);
  if (result.cityEvent?.started) eventBus.emit(Events.CITY_EVENT_STARTED, result.cityEvent.started);
  if (result.cityEvent?.ended) eventBus.emit(Events.CITY_EVENT_ENDED, result.cityEvent.ended);
  if (result.stressTest?.phaseEnded) eventBus.emit(Events.STRESS_PHASE_CHANGED, result.stressTest);
  if (result.stressTest?.result) eventBus.emit(Events.STRESS_TEST_FINISHED, result.stressTest.result);
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
  refreshIcons(els.timeControls);
}

function setPlayerTimeScale(scale) {
  if (scale > 0) resumeTimeScale = scale;
  gameState.timeScale = simulationController.setTimeScale(scale);
  continuousClockView?.renderNow();
  refreshTimeControls();
  eventBus.emit(Events.SAVE_REQUESTED, {});
  return gameState.timeScale;
}

function completeConstructionPlan() {
  const result = commitConstructionPlan(gameState);
  if (!result.ok) {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '건설 계획을 확정할 수 없습니다',
      text: result.errors?.[0]?.message || '계획을 다시 확인하세요.',
      priority: true,
    });
    refreshAll();
    return result;
  }
  result.projects.forEach((project) => eventBus.emit(Events.CONSTRUCTION_STARTED, project));
  eventBus.emit(Events.BUILD_PLAN_COMMITTED, result);
  eventBus.emit(Events.SAVE_REQUESTED, {});
  const [startedProject] = result.projects;
  const startedFacility = result.projects.length === 1 ? FACILITIES[startedProject.key] : null;
  eventBus.emit(Events.TOAST_SHOW, {
    kicker: 'CONSTRUCTION STARTED',
    title: startedFacility ? `${startedFacility.icon} ${startedFacility.name} 착공` : `${result.projects.length}개 시설 착공`,
    text: '게임 날짜가 흐르면 공사 기간에 맞춰 완공됩니다.',
  });
  refreshAll();
  return result;
}

function forecastOperationsForGrid(grid) {
  const coords = createHexCoordinates(gameState.boardRadius);
  const calendar = calendarAtElapsedDay(gameState.elapsedGameDays);
  const modifierContext = buildCityModifierContext({ ...gameState, grid }, { coords, calendar });
  const power = calculatePowerNetwork({
    grid,
    coords,
    dayIndex: gameState.elapsedGameDays,
    tickIndex: gameState.tickIndex,
    heatwave: gameState.climateAlert === 'extreme_heat',
    additionalDemandByIndex: researchDemandByIndex(gameState),
    batteryReserveUnlocked: gameState.claimedQuestIds?.has?.(GRID_RESERVE_RULES.BATTERY_SUBSTITUTE_QUEST_ID) === true,
    modifierContext,
  });
  const economy = settleEconomy({
    grid,
    coords,
    facilityPower: power.facilityPower,
    generationAvailableByIndex: power.generationAvailableByIndex,
    generationDispatchedByIndex: power.generationDispatchedByIndex,
    credits: gameState.credits,
    modifierContext,
  });
  return {
    ...economy,
    deliveredPower: power.delivered,
    demand: power.demand,
    generationAvailable: power.generationAvailable,
    generationAvailableByIndex: power.generationAvailableByIndex,
  };
}

function constructionForecastForGrid(projectedGrid) {
  const current = forecastOperationsForGrid(gameState.grid);
  const projected = forecastOperationsForGrid(projectedGrid);
  return { current, projected };
}

function constructionForecastForAssessment(assessment) {
  const current = forecastOperationsForGrid(gameState.grid);
  const plannedProjects = assessment.items.map(({ index, type }) => ({
    index,
    type,
    paidCost: assessment.paidCostByIndex[index],
  }));
  const forecast = forecastConstruction(gameState, plannedProjects, { settleDay });
  const finalEconomy = forecast.finalEconomy || current;
  const finalSummary = forecast.finalSummary || gameState.lastTickSummary || {};
  const projected = {
    ...finalEconomy,
    deliveredPower: finalSummary.deliveredPower || 0,
    demand: finalSummary.demand || 0,
    dailyCarbon: finalSummary.dailyCarbon || 0,
    dailyWater: finalSummary.dailyWater || 0,
    labor: {
      used: finalSummary.used || 0,
      capacity: finalSummary.capacity || 0,
    },
  };
  return { current, projected, ...forecast };
}

function operationSnapshotFromForecastDay(day, facilityIndex) {
  if (!day) return null;
  return {
    netCredits: day.summary.netCredits,
    deliveredPower: day.summary.deliveredPower,
    demand: day.summary.demand,
    generationAvailable: day.summary.generationAvailable,
    facilityGenerationAvailable: day.summary.generationAvailableByIndex?.[facilityIndex] || 0,
    dailyCarbon: day.summary.dailyCarbon,
    dailyWater: day.summary.dailyWater,
    used: day.summary.used,
    capacity: day.summary.capacity,
  };
}

function upgradeForecastForIndex(index, paidCost) {
  const currentEconomy = forecastOperationsForGrid(gameState.grid);
  const prediction = forecastUpgrade(gameState, index, { paidCost, settleDay });
  return {
    ...prediction,
    current: {
      netCredits: currentEconomy.netCredits,
      deliveredPower: currentEconomy.deliveredPower,
      demand: currentEconomy.demand,
      generationAvailable: currentEconomy.generationAvailable,
      facilityGenerationAvailable: currentEconomy.generationAvailableByIndex?.[index] || 0,
      dailyCarbon: currentEconomy.dailyCarbon,
      dailyWater: currentEconomy.dailyWater,
      used: currentEconomy.labor.used,
      capacity: currentEconomy.labor.capacity,
    },
    during: operationSnapshotFromForecastDay(prediction.daily[0], index),
    completed: operationSnapshotFromForecastDay(prediction.daily.at(-1), index),
  };
}

function constructionRiskForPlan(assessment) {
  const { current, projected } = constructionForecastForAssessment(assessment);
  return {
    currentEconomy: current,
    projectedEconomy: projected,
    risky: projected.netCredits < 0 && projected.netCredits < current.netCredits,
  };
}

function confirmActiveConstructionPlan() {
  const assessment = assessConstructionPlan(gameState);
  if (!assessment.ok) return completeConstructionPlan();
  const risk = constructionRiskForPlan(assessment);
  if (risk.risky) {
    openConstructionRiskModal({
      facility: assessment.items.length === 1 ? FACILITIES[assessment.items[0]?.type] || null : null,
      planCount: assessment.items.length,
      currentEconomy: risk.currentEconomy,
      projectedEconomy: risk.projectedEconomy,
      onConfirm: completeConstructionPlan,
    });
    return null;
  }
  return completeConstructionPlan();
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
  eventBus.emit(Events.TOAST_SHOW, {
    title: '대지를 다시 선택하세요',
    text: '건설 패널이 열려 있으면 빈 대지를 눌러 계획에 추가할 수 있습니다.',
  });
}

function handleReset() {
  openResetConfirmModal(() => resetGame({
    title: '초기화 완료',
    text: '처음부터 다시 시작합니다.',
  }));
}

function resetGame({ title, text }) {
  // gameState.reset()이 onboardingVersionSeen을 0으로 되돌리므로 "안내를 아직 못 봤는가"는
  // 초기화 전에 읽어야 한다. 이렇게 해야 스토리를 이미 끝낸 플레이어는 초기화해도 다시 보지 않고,
  // 게임오버 저장으로 부팅해 스토리가 대기열에만 있던 플레이어는 새 도시에서 스토리를 본다.
  const onboardingUnseen = gameState.onboardingVersionSeen < ONBOARDING_VERSION;
  // 대기열을 먼저 비운다 — 이전 도시에서 밀려 있던 모달이 새 도시 위로 튀어나오면 안 된다.
  clearModalQueue();
  closeModal();
  gameState.reset();
  clearSavedGame();
  resumeTimeScale = TIME.DEFAULT_SCALE;
  simulationController.reset(gameState.timeScale);
  continuousClockView?.renderNow();
  eventBus.emit(Events.GAME_RESET, {});
  refreshAll();
  refreshTimeControls();
  eventBus.emit(Events.TOAST_SHOW, { title, text });
  if (onboardingUnseen) openStory();
}

function resetAfterGameOver() {
  resetGame({
    title: '새 도시 시작',
    text: '탄소 위기 기록을 초기화했습니다.',
  });
}

function bindEvents() {
  els.helpBtn.addEventListener('click', openHelpModal);
  els.resetBtn.addEventListener('click', handleReset);
  eventBus.on(Events.BUILD_PLAN_COMMIT_REQUESTED, confirmActiveConstructionPlan);
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
    refreshIcons(els.soundBtn);
  });

  els.musicBtn.addEventListener('click', () => {
    toggleMusic();
    refreshAudioControls();
    refreshIcons(els.musicBtn);
  });

}

// 로딩 화면은 실제 3D 에셋 진척만 보여준다(문구를 쓰는 곳은 여기 하나뿐이다).
// 3D 씬이 로드를 시작하기 전에 구독해야 첫 진척 이벤트를 놓치지 않으므로 boot 맨 앞에서 부른다.
function trackLoadingProgress() {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    els.loadingBar.style.width = '100%';
    els.loadingText.textContent = 'CLIMATE CITY 준비 완료';
    setTimeout(() => els.loading.classList.add('done'), LOADING_SCREEN.DONE_DELAY_MS);
  };
  eventBus.on(Events.ASSETS_PROGRESS, ({ loaded, total }) => {
    if (finished || !total) return;
    els.loadingBar.style.width = `${Math.round((loaded / total) * 100)}%`;
    els.loadingText.textContent = `3D 도시 모델 ${loaded}/${total}`;
  });
  eventBus.on(Events.ASSETS_READY, finish);
  eventBus.on(Events.ASSETS_FAILED, finish);
  setTimeout(finish, LOADING_SCREEN.MAX_WAIT_MS);
}

function boot() {
  trackLoadingProgress();
  initModal(els.modal, els.modalCard);
  initThemeManager(els.themeBtn, refreshIcons);
  initToastView(els.toastStack);
  initGridView(els.cityGrid, els.boardSizeChip, onCellClick, {
    root: els.buildConfirm,
    text: els.buildConfirmText,
    metrics: els.buildConfirmMetrics,
    timeline: els.buildForecastTimeline,
    cost: els.buildPlanCost,
    balance: els.buildPlanBalance,
    error: els.buildPlanError,
    getForecast: constructionForecastForAssessment,
  }, { announcer: els.srAnnouncer });
  initWorldLightingManager(els.worldLightingControls, setVisualWorldHour, refreshIcons);
  initDockView(els.facilityDock, els.facilityDetail, els.buildPanel);
  initHudView(els, syncWorldHud);
  initQuestView({
    root: document.querySelector('.quest-panel-current'),
    level: els.questPanelLevel,
    title: els.questPanelTitle,
    goal: els.questPanelGoal,
    bar: els.questPanelProgressBar,
    reward: els.questPanelReward,
    emergency: els.questPanelEmergencyBtn,
    claim: els.questPanelClaimBtn,
    map: els.questPanelMapBtn,
    details: document.querySelector('#questPanelDetails'),
    expand: document.querySelector('#questPanelExpandBtn'),
  }, (change) => {
    refreshAll();
    if (change?.phase === 'claimed' && change.result?.campaignComplete) openReportModal();
  });
  initSimulationHudView({ root: $('#simulationHud'), time: els.simTime, net: els.simNet, carbonRate: els.simCarbonRate, power: els.simPower, battery: els.simBattery, water: els.simWater, labor: els.statusWorkforce, carbon: els.simCarbon, alert: els.simAlert, announcer: els.srAnnouncer });
  initForecastView(els.forecastStrip);
  initChartView(els.cityChart);
  initStageModals(refreshAll, { getUpgradeForecast: upgradeForecastForIndex });
  initFeedbackBridge();
  eventBus.on(Events.CITY_EVENT_FORECASTED, (cityEvent) => {
    const definition = CITY_EVENTS[cityEvent.type];
    eventBus.emit(Events.TOAST_SHOW, {
      kicker: `${EVENT_FORECAST_DAYS}일 기후 예보`,
      title: `${definition.label} 대비 시작`,
      text: `${definition.durationDays}일 지속 · ${definition.description}`,
      meta: '도시 시간은 계속 흐릅니다. 퀘스트 창에서 대비 조건을 확인하세요.',
      priority: true,
      kind: 'event-forecast-alert',
      duration: 7000,
    });
  });
  eventBus.on(Events.CITY_EVENT_STARTED, (cityEvent) => {
    const definition = CITY_EVENTS[cityEvent.type];
    eventBus.emit(Events.TOAST_SHOW, { title: `${definition.label} 시작`, text: definition.description, priority: true });
  });
  eventBus.on(Events.CITY_EVENT_ENDED, showEventResult);
  eventBus.on(Events.STRESS_TEST_START_REQUESTED, () => openStressTestModal(refreshAll));
  eventBus.on(Events.REPORT_OPEN_REQUESTED, openReportModal);
  eventBus.on(Events.HUD_METRIC_CAUSES_REQUESTED, ({ metric }) => openHudMetricCausesModal(metric));
  eventBus.on(Events.STRESS_PHASE_CHANGED, ({ phaseStarted }) => {
    if (!phaseStarted) return;
    eventBus.emit(Events.TOAST_SHOW, {
      kicker: `최종 테스트 ${gameState.stressTest.phaseIndex + 1}/${STRESS_PHASES.length}`,
      title: `${phaseStarted.label} 구간 시작`,
      text: `${phaseStarted.durationDays}일 동안 도시 운영을 조정하세요.`,
      priority: true,
    });
  });
  eventBus.on(Events.STRESS_TEST_FINISHED, (result) => openStressResultModal(result, {
    onReport: openReportModal,
    onClose: refreshAll,
  }));
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
  initQuestPanelController({
    panel: els.questPanel,
    dragSurface: els.questPanel,
    keyboardSurface: els.questPanel.querySelector('.quest-panel-header'),
    pinButton: els.questPanelPinBtn,
    topSafeElement: document.querySelector('.world-status'),
    rightSafeElement: els.hudRail,
  });
  [
    ['status', document.querySelector('#statusPanel'), FLOATING_PANEL_STORAGE.STATUS],
    ['settings', document.querySelector('#settingsPanel'), FLOATING_PANEL_STORAGE.SETTINGS],
  ].forEach(([panelName, panel, storageKey]) => createFloatingPanelController({
    panel,
    panelName,
    storageKey,
    dragSurface: panel,
    keyboardSurface: panel.querySelector('.panel-title'),
    topSafeElement: document.querySelector('.world-status'),
    rightSafeElement: els.hudRail,
  }));
  initThreeBackground(els.threeBg);

  loadSavedGame();
  resumeTimeScale = gameState.timeScale || TIME.DEFAULT_SCALE;

  simulationController = createSimulationController({ settle: settleSimulationDay, getIntervalMs: intervalForTimeScale });
  simulationController.setTimeScale(gameState.timeScale);
  continuousClockView = createContinuousClockView({
    timeElement: els.simTime,
    getElapsedDays: () => gameState.elapsedGameDays,
    getProgress: () => simulationController.getProgress(),
    onProgress: (tickProgress) => {
      refreshCityConstructionProgress(tickProgress);
      refreshStageConstructionProgress(tickProgress);
    },
    // 프레임 사이에 실제로 움직이는 것은 공사 진행 배지뿐이다. 시간이 멈춰 있거나
    // 진행 중인 공사가 없으면 한 번만 그리고 rAF 루프를 쉰다.
    shouldAnimate: () => !simulationController.getState().paused
      && gameState.timeScale > 0
      && gameState.grid.some((cell) => cell?.project),
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
  eventBus.on(Events.CARBON_WARNING, ({ days }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '탄소 위기 경보',
      text: `${days}/${CARBON_CRISIS.GAME_OVER_DAYS}일 · 일일 탄소를 ${CARBON_CRISIS.SAFE_DAILY} 이하로 낮추세요.`,
      priority: true,
    });
  });
  eventBus.on(Events.OPERATIONAL_RISK_WARNING, ({ warning, risk }) => {
    const credit = warning.startsWith('credit');
    eventBus.emit(Events.TOAST_SHOW, {
      title: credit ? '도시 재정 경고' : '필수시설 전력 경고',
      text: credit
        ? `연속 적자 ${risk.negativeCreditDays}/${CITY_FAILURE_RULES.CREDIT_GAME_OVER_DAYS}일`
        : `필수시설 공급 ${CITY_FAILURE_RULES.ESSENTIAL_BLACKOUT_PERCENT}% 이하 ${risk.essentialBlackoutDays}/${CITY_FAILURE_RULES.ESSENTIAL_GAME_OVER_DAYS}일`,
      meta: '안전한 일일 정산 1회마다 위험 기간이 1일씩 회복됩니다.',
      priority: true,
    });
  });
  eventBus.on(Events.OPERATIONAL_RISK_PAUSE, ({ reason }) => openOperationalRiskModal({ reason }));
  eventBus.on(Events.GAME_OVER, ({ summary }) => {
    openCarbonGameOverModal({ dailyCarbon: summary?.dailyCarbon, onReset: resetAfterGameOver });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // 탭을 숨기는 순간이 사실상 마지막 기회다 — 디바운스·스로틀 대기 중인 저장을 밀어낸다.
      flushSave();
      simulationController.pause('hidden');
    } else {
      simulationController.resume('hidden');
      // 탭이 숨은 동안 rAF가 멈춰 시계·공사 배지는 숨기 직전 프레임 그대로다.
      // 다음 rAF를 기다리지 말고 지금 한 번 그려서 되돌아온 순간의 시각을 보여 준다.
      continuousClockView?.renderNow();
    }
  });
  simulationController.start();
  continuousClockView.start();
  if (gameState.gameOver) {
    openCarbonGameOverModal({ dailyCarbon: gameState.lastTickSummary?.dailyCarbon, onReset: resetAfterGameOver });
  }

  bindEvents();
  refreshAll();
  // index.html에 정적으로 박혀 있는 <i data-lucide>를 한 번만 문서 전체로 치환한다.
  // 이후 부분 렌더는 각자 다시 그린 노드만 refreshIcons(node)로 넘긴다.
  refreshIcons();
  // 확장 선택 모달을 닫기 전에 새로고침한 저장은 확장 없이 7단계에 갇힌다. 부팅 때 다시 묻는다.
  // 아래 openStory()보다 먼저 열리므로, 스토리에 덮이지 않으려면 모달 우선순위 큐가 필요하다.
  if (expansionChoicePending(gameState)) eventBus.emit(Events.EXPANSION_CHOICE_REQUESTED, {});
  refreshTimeControls();
  syncTutorialHighlight();

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
window.__settleSimulationDay = () => settleSimulationDay();
window.__getSimulationState = () => simulationController?.getState();
window.__getModalState = () => getModalState();
window.__getAudioState = () => audioContextState();
window.__setTimeScale = (scale) => {
  const applied = setPlayerTimeScale(scale);
  refreshAll();
  return applied;
};
window.__renderCityConfigsForTest = (configs, size) => renderCityScene3D(configs, size);
window.__triggerBirdVisitForTest = (greenIndex, birdCount = 2) => triggerBirdVisit(greenIndex, birdCount);
window.__finishBirdVisitForTest = () => finishBirdVisit();
window.__triggerFacilityAmbientForTest = (type, cellIndex, durationMs) => triggerFacilityAmbient(type, cellIndex, durationMs);
window.__finishFacilityAmbientForTest = () => finishFacilityAmbientEffects();
window.__setBuildPreviewForTest = (preview) => setBuildPreviewMode(preview);
// 정상 플레이에서는 아무도 부르지 않는다 — 해제 경로 누수 회귀 테스트 전용 훅이다.
window.__disposeCitySceneForTest = () => {
  continuousClockView?.stop();
  simulationController?.pause('dispose-test');
  return disposeCityScene3D();
};

window.render_game_to_text = () => {
  const m = gameState.metrics;
  const coords = createHexCoordinates(gameState.boardRadius);
  const calendar = calendarAtElapsedDay(gameState.elapsedGameDays);
  const visualCalendar = calendarAtElapsedDay(gameState.elapsedGameDays + (simulationController?.getProgress() || 0));
  const tick = gameState.lastTickSummary;
  const payload = {
    coords: 'axial pointy-top hex grid; index 0 is center; radius 2=19 cells, radius 3=37 cells',
    mode: gameState.gameOver ? 'game_over' : 'playing',
    quest: gameState.questIndex,
    questStatus: gameState.questStatus,
    progression: {
      chapter: gameState.progression.chapter,
      tutorialQuestIndex: gameState.progression.tutorialQuestIndex,
      tutorialQuestStatus: gameState.progression.tutorialQuestStatus,
    },
    climateCampaign: {
      questIndex: gameState.questIndex,
      status: gameState.climateCampaign.status,
      eventType: gameState.climateCampaign.eventType,
      attempt: gameState.climateCampaign.attempt,
      progress: { ...gameState.climateCampaign.progress },
      lastResult: gameState.climateCampaign.lastResult
        ? { ...gameState.climateCampaign.lastResult }
        : null,
      completedEventTypes: [...gameState.climateCampaign.completedEventTypes],
    },
    expansion: {
      phase: gameState.expansion.phase,
      firstChoice: gameState.expansion.firstChoice,
      activeCellCount: gameState.expansion.activeCellIndices.length,
    },
    events: {
      activeId: gameState.events.activeId,
      next: gameState.events.schedule[0] || null,
      completedCount: gameState.events.completed.length,
    },
    stressTest: {
      status: gameState.stressTest.status,
      phaseIndex: gameState.stressTest.phaseIndex,
      phaseDay: gameState.stressTest.phaseDay,
    },
    gameTime: { ...calendar, label: formatCalendar(calendar), timeScale: gameState.timeScale },
    visualGameTime: { ...visualCalendar, label: formatCalendar(visualCalendar) },
    climateAlert: gameState.climateAlert,
    carbonCrisisDays: gameState.carbonCrisisDays,
    carbonCrisisLimit: CARBON_CRISIS.GAME_OVER_DAYS,
    credits: gameState.credits,
    devScore: m ? m.dev : 0,
    metrics: m,
    boardRadius: gameState.boardRadius,
    entities: gameState.grid
      .map((cell, index) => (cell ? {
        index,
        ...coords[index],
        type: cell.type,
        level: cell.level,
        priority: cell.priority || 'normal',
        operationMode: cell.operationMode || 'normal',
        project: cell.project ? { ...cell.project } : null,
      } : null))
      .filter(Boolean),
    constructionPlan: gameState.constructionPlan.map(({ index, type }) => ({ index, type })),
    selectedFacility: gameState.selectedFacility,
    selectedCell: gameState.selectedCell,
    research: {
      jobs: gameState.research.jobs,
      completedIds: [...gameState.research.completedIds],
      techLevels: gameState.research.techLevels,
    },
    island: getCityRendererStats().environment,
    // 마지막 정산 요약 전체(routes·facilityPower·modifiers)를 덤프하지 않고 핵심만 싣는다.
    simulation: tick ? {
      netCredits: tick.netCredits,
      deliveredPower: tick.deliveredPower,
      demand: tick.demand,
      lowCarbonPercent: tick.lowCarbonPercent,
      dailyCarbon: tick.dailyCarbon,
      dailyWater: tick.dailyWater,
      essentialSupplyPercent: tick.essentialSupplyPercent,
    } : null,
    netCreditsPerDay: tick?.netCredits ?? 0,
    deliveredPower: tick?.deliveredPower ?? 0,
    demand: tick?.demand ?? 0,
    lowCarbonPercent: tick?.lowCarbonPercent ?? 0,
    workforce: tick?.workforce ?? 0,
    jobs: tick?.jobs ?? 0,
    facilityPowerRatios: Object.fromEntries(Object.entries(tick?.facilityPower || {}).map(([index, item]) => [index, item.ratio])),
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
