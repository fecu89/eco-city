import { WORLD_LIGHTING_MODES, WORLD_LIGHTING_STORAGE_KEY } from '../core/Constants.js';
import { readStorage, writeStorage } from '../core/safeStorage.js';

let currentMode = 'day';
let controlsEl = null;
let applyHour = () => {};
let refresh = () => {};

function renderControl() {
  controlsEl?.querySelectorAll('[data-world-lighting]').forEach((button) => {
    const active = button.dataset.worldLighting === currentMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  refresh(controlsEl);
}

export function setWorldLightingMode(mode, { persist = true } = {}) {
  const next = WORLD_LIGHTING_MODES[mode] ? mode : 'day';
  currentMode = next;
  applyHour(WORLD_LIGHTING_MODES[next].visualHour);
  if (persist) writeStorage(WORLD_LIGHTING_STORAGE_KEY, next);
  renderControl();
  return currentMode;
}

export function getWorldLightingMode() {
  return currentMode;
}

export function initWorldLightingManager(root, applyWorldHour, refreshIcons) {
  controlsEl = root;
  applyHour = applyWorldHour || (() => {});
  refresh = refreshIcons || (() => {});
  controlsEl?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-world-lighting]');
    if (button) setWorldLightingMode(button.dataset.worldLighting);
  });
  const saved = readStorage(WORLD_LIGHTING_STORAGE_KEY);
  setWorldLightingMode(WORLD_LIGHTING_MODES[saved] ? saved : 'day', {
    persist: Boolean(WORLD_LIGHTING_MODES[saved]),
  });
}
