import { STAGE_INFO, STAGES, GAME } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { refreshIcons } from './Modal.js';

let els = null;

export function initHudView(elements) {
  els = elements;
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

  els.blindBuildBtn?.classList.toggle('hidden', gameState.stage !== STAGES.EXECUTION);

  const evidenceUnlocked = gameState.stage >= STAGES.REDESIGN;
  els.rightPanel.classList.toggle('has-evidence', evidenceUnlocked);
  els.evidenceBox.classList.toggle('hidden', !evidenceUnlocked);

  refreshIcons();
}
