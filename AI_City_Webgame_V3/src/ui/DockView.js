import { FACILITIES } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { selectFacility } from '../systems/BoardSystem.js';

let dockEl = null;

export function initDockView(el) {
  dockEl = el;
}

export function renderDock() {
  dockEl.innerHTML = '';
  Object.entries(FACILITIES).forEach(([key, f]) => {
    if (gameState.stage < f.unlockStage) return; // 해금 전에는 완전히 숨김
    const locked = !gameState.isEditable;
    const btn = document.createElement('button');
    btn.className = 'facility-btn' + (gameState.selectedFacility === key ? ' active' : '') + (locked ? ' locked' : '');
    btn.disabled = locked;
    btn.title = `${f.name} — 보드에서 선택하면 인접 보너스/갈등 구역이 표시됩니다.`;
    btn.innerHTML = `<div class="f-top"><span class="f-icon">${f.icon}</span><span class="cost">-${f.cost}C</span></div><strong>${f.name}</strong>`;
    btn.addEventListener('click', () => {
      selectFacility(key);
      renderDock();
    });
    dockEl.appendChild(btn);
  });
}
