import { QUEST_PANEL_LAYOUT } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { refreshIcons } from './Modal.js';

const INTERACTIVE_SELECTOR = 'button,a,input,select,textarea,[role="button"],[contenteditable="true"]';

let panelEl = null;
let dragSurfaceEl = null;
let keyboardSurfaceEl = null;
let pinButtonEl = null;
let topSafeEl = null;
let rightSafeEl = null;
let mobileQuery = null;
let preference = { pinned: false, x: null, y: null };
let drag = null;

function readPreference() {
  try {
    const stored = JSON.parse(localStorage.getItem(QUEST_PANEL_LAYOUT.STORAGE_KEY) || '{}');
    return {
      pinned: Boolean(stored.pinned),
      x: Number.isFinite(stored.x) ? stored.x : null,
      y: Number.isFinite(stored.y) ? stored.y : null,
    };
  } catch {
    return { pinned: false, x: null, y: null };
  }
}

function savePreference() {
  localStorage.setItem(QUEST_PANEL_LAYOUT.STORAGE_KEY, JSON.stringify(preference));
}

function safeBounds() {
  const panelRect = panelEl.getBoundingClientRect();
  const margin = QUEST_PANEL_LAYOUT.EDGE_MARGIN;
  const topRect = topSafeEl?.getBoundingClientRect();
  const railRect = rightSafeEl?.getBoundingClientRect();
  const minY = Math.max(margin, (topRect?.bottom || 0) + QUEST_PANEL_LAYOUT.SAFE_GAP);
  const rightEdge = railRect?.width > 0
    ? Math.min(window.innerWidth - margin, railRect.left - QUEST_PANEL_LAYOUT.SAFE_GAP)
    : window.innerWidth - margin;
  return {
    minX: margin,
    maxX: Math.max(margin, rightEdge - panelRect.width),
    minY,
    maxY: Math.max(minY, window.innerHeight - panelRect.height - margin),
  };
}

function clampPosition(x, y) {
  const bounds = safeBounds();
  return {
    x: Math.max(bounds.minX, Math.min(x, bounds.maxX)),
    y: Math.max(bounds.minY, Math.min(y, bounds.maxY)),
  };
}

function applyPosition() {
  if (mobileQuery.matches) {
    ['left', 'right', 'top', 'bottom'].forEach((property) => panelEl.style.removeProperty(property));
    return;
  }
  if (!Number.isFinite(preference.x) || !Number.isFinite(preference.y)) {
    const bounds = safeBounds();
    panelEl.style.removeProperty('left');
    panelEl.style.removeProperty('bottom');
    panelEl.style.removeProperty('right');
    panelEl.style.top = `${bounds.minY}px`;
    return;
  }
  const next = clampPosition(preference.x, preference.y);
  preference.x = next.x;
  preference.y = next.y;
  panelEl.style.left = `${next.x}px`;
  panelEl.style.top = `${next.y}px`;
  panelEl.style.right = 'auto';
  panelEl.style.bottom = 'auto';
}

function effectivePinned() {
  return preference.pinned && !mobileQuery.matches;
}

function renderPinned({ keepOpen = true } = {}) {
  const pinned = effectivePinned();
  panelEl.classList.toggle('quest-panel-pinned', pinned);
  pinButtonEl.setAttribute('aria-pressed', String(pinned));
  pinButtonEl.setAttribute('aria-label', pinned ? '퀘스트 창 고정 해제' : '퀘스트 창 고정');
  pinButtonEl.title = pinned ? '고정 해제' : '반투명하게 고정';
  pinButtonEl.innerHTML = `<i data-lucide="${pinned ? 'pin-off' : 'pin'}"></i>`;
  refreshIcons();
  eventBus.emit(Events.QUEST_PANEL_PIN_CHANGED, { pinned, keepOpen });
}

function setPinned(pinned, { keepOpen = true, persist = true } = {}) {
  preference.pinned = Boolean(pinned);
  if (persist) savePreference();
  renderPinned({ keepOpen });
}

function moveTo(x, y, persist = false) {
  if (mobileQuery.matches) return;
  const next = clampPosition(x, y);
  preference.x = next.x;
  preference.y = next.y;
  applyPosition();
  if (persist) savePreference();
}

function beginDrag(event) {
  if (mobileQuery.matches || event.button !== 0 || event.target.closest(INTERACTIVE_SELECTOR)) return;
  const rect = panelEl.getBoundingClientRect();
  drag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
  panelEl.classList.add('quest-panel-dragging');
  dragSurfaceEl.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function updateDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  moveTo(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
}

function endDrag(event) {
  if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
  dragSurfaceEl.releasePointerCapture?.(drag.pointerId);
  drag = null;
  panelEl.classList.remove('quest-panel-dragging');
  savePreference();
}

function moveWithKeyboard(event) {
  const direction = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[event.key];
  if (!direction || mobileQuery.matches) return;
  const rect = panelEl.getBoundingClientRect();
  moveTo(
    rect.left + direction[0] * QUEST_PANEL_LAYOUT.KEYBOARD_STEP,
    rect.top + direction[1] * QUEST_PANEL_LAYOUT.KEYBOARD_STEP,
    true,
  );
  event.preventDefault();
}

export function initQuestPanelController({
  panel,
  dragSurface = panel,
  keyboardSurface = panel,
  pinButton,
  topSafeElement = null,
  rightSafeElement = null,
}) {
  panelEl = panel;
  dragSurfaceEl = dragSurface;
  keyboardSurfaceEl = keyboardSurface;
  pinButtonEl = pinButton;
  topSafeEl = topSafeElement;
  rightSafeEl = rightSafeElement;
  mobileQuery = window.matchMedia(QUEST_PANEL_LAYOUT.MOBILE_QUERY);
  preference = readPreference();

  dragSurfaceEl.addEventListener('pointerdown', beginDrag);
  dragSurfaceEl.addEventListener('pointermove', updateDrag);
  dragSurfaceEl.addEventListener('pointerup', endDrag);
  dragSurfaceEl.addEventListener('pointercancel', endDrag);
  keyboardSurfaceEl.addEventListener('keydown', moveWithKeyboard);
  pinButtonEl.addEventListener('click', () => setPinned(!preference.pinned));
  eventBus.on(Events.QUEST_PANEL_PIN_REQUESTED, ({ pinned, keepOpen = false }) => setPinned(pinned, { keepOpen }));
  eventBus.on(Events.HUD_PANEL_CHANGED, ({ activePanel }) => {
    if (activePanel === 'quest') requestAnimationFrame(applyPosition);
  });
  mobileQuery.addEventListener('change', () => {
    applyPosition();
    renderPinned({ keepOpen: false });
  });
  window.addEventListener('resize', () => {
    applyPosition();
    if (!mobileQuery.matches && Number.isFinite(preference.x)) savePreference();
  });

  applyPosition();
  renderPinned({ keepOpen: false });
}
