import { STAGE_INFO, STAGES, GAME } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { refreshIcons } from './Modal.js';

let els = null;
let onStageUiChanged = () => {};
let trackedStage = null;
let previousAdvanceReady = false;

export function initHudView(elements, stageUiChanged) {
  els = elements;
  onStageUiChanged = stageUiChanged || (() => {});
}

export function renderHud() {
  const m = gameState.metrics;
  const info = STAGE_INFO[gameState.stage];

  els.credits.textContent = gameState.credits;
  els.devScore.textContent = m ? m.dev : 0;
  els.turnCount.textContent = gameState.turn;

  const revealed = gameState.stage >= STAGES.CRISIS;
  [els.energyCard, els.carbonCard, els.waterCard].forEach((e) => e.classList.toggle('locked', !revealed));
  if (revealed && m) {
    els.energyScore.textContent = `${m.reliableSupply} / ${m.demand}`;
    els.carbonScore.textContent = m.carbon;
    els.waterScore.textContent = m.water;
  } else {
    els.energyScore.textContent = els.carbonScore.textContent = els.waterScore.textContent = '???';
  }

  els.phaseText.textContent = info.label;
  els.missionTitle.textContent = info.mission;
  els.teacherNote.innerHTML = `<i data-lucide="${info.note.icon}"></i><p>${info.note.text}</p>`;
  els.advanceBtn.innerHTML = `${info.advanceLabel} <i data-lucide="${info.advanceIcon}"></i>`;
  els.advanceBtn.disabled =
    gameState.stage === STAGES.EXECUTION && gameState.grid.filter(Boolean).length < GAME.MIN_CELLS_TO_COMPLETE_STAGE1;
  els.advanceBtn.title = els.advanceBtn.disabled ? `최소 ${GAME.MIN_CELLS_TO_COMPLETE_STAGE1}칸을 채워야 진행할 수 있습니다.` : '';

  const advanceReady = !els.advanceBtn.disabled;
  if (trackedStage !== gameState.stage) {
    trackedStage = gameState.stage;
    previousAdvanceReady = advanceReady;
  } else if (!previousAdvanceReady && advanceReady) {
    eventBus.emit(Events.STAGE_READY, { stage: gameState.stage, label: info.advanceLabel });
    eventBus.emit(Events.TOAST_SHOW, {
      title: '다음 단계 준비 완료',
      text: `메뉴에서 “${info.advanceLabel}”을 확인하세요.`,
      priority: true,
    });
    previousAdvanceReady = true;
  } else {
    previousAdvanceReady = advanceReady;
  }

  els.blindBuildBtn?.classList.toggle('hidden', gameState.stage !== STAGES.EXECUTION);

  const evidenceUnlocked = gameState.stage >= STAGES.REDESIGN;
  els.rightPanel.classList.toggle('has-evidence', evidenceUnlocked);

  refreshIcons();
  onStageUiChanged();
}
