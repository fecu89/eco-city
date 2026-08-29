import { FACILITIES } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { selectFacility } from '../systems/BoardSystem.js';

let dockEl = null;
let summaryEl = null;

export function initDockView(el, selectedSummaryEl) {
  dockEl = el;
  summaryEl = selectedSummaryEl;
}

export function renderDock() {
  const selected = FACILITIES[gameState.selectedFacility];
  if (summaryEl && selected) {
    summaryEl.textContent = `${selected.icon} ${selected.name} 선택 · ${selected.cost}C · 빈 대지를 눌러 건설`;
  }
  dockEl.innerHTML = '';
  Object.entries(FACILITIES).forEach(([key, f]) => {
    if (gameState.stage < f.unlockStage) return; // 해금 전에는 완전히 숨김
    const locked = !gameState.isEditable;
    const unaffordable = gameState.credits < f.cost;
    const btn = document.createElement('button');
    btn.className = 'facility-btn'
      + (gameState.selectedFacility === key ? ' active' : '')
      + (locked ? ' locked' : '')
      + (unaffordable ? ' unaffordable' : '');
    btn.disabled = locked || unaffordable;
    btn.title = locked
      ? `${f.name} — 현재 단계에서는 건설할 수 없습니다.`
      : unaffordable
        ? `${f.name} — ${f.cost - gameState.credits}C 부족`
        : `${f.name} — 보드에서 선택하면 인접 보너스/갈등 구역이 표시됩니다.`;
    btn.innerHTML = `<div class="f-top"><span class="f-icon">${f.icon}</span><span class="cost">-${f.cost}C</span></div><strong>${f.name}</strong>`;
    btn.addEventListener('click', () => {
      selectFacility(key);
      renderDock();
    });
    dockEl.appendChild(btn);
  });
}
