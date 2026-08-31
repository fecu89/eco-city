import { QUEST_PANEL_LAYOUT } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

const INTERACTIVE_SELECTOR = 'button,a,input,select,textarea,[role="button"],[contenteditable="true"]';

function readPosition(storageKey) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return {
      x: Number.isFinite(stored.x) ? stored.x : null,
      y: Number.isFinite(stored.y) ? stored.y : null,
    };
  } catch {
    return { x: null, y: null };
  }
}

function writePosition(storageKey, position) {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch {
    stored = {};
  }
  localStorage.setItem(storageKey, JSON.stringify({ ...stored, ...position }));
}

export function createFloatingPanelController({
  panel,
  panelName,
  storageKey,
  dragSurface = panel,
  keyboardSurface = panel,
  topSafeElement = null,
  rightSafeElement = null,
  mobileQuery = QUEST_PANEL_LAYOUT.MOBILE_QUERY,
}) {
  const media = window.matchMedia(mobileQuery);
  let position = readPosition(storageKey);
  let drag = null;

  function safeBounds() {
    const panelRect = panel.getBoundingClientRect();
    const margin = QUEST_PANEL_LAYOUT.EDGE_MARGIN;
    const topRect = topSafeElement?.getBoundingClientRect();
    const railRect = rightSafeElement?.getBoundingClientRect();
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
    if (media.matches) {
      ['left', 'right', 'top', 'bottom'].forEach((property) => panel.style.removeProperty(property));
      return;
    }
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      const bounds = safeBounds();
      panel.style.removeProperty('left');
      panel.style.removeProperty('bottom');
      panel.style.removeProperty('right');
      panel.style.top = `${bounds.minY}px`;
      return;
    }
    position = clampPosition(position.x, position.y);
    panel.style.left = `${position.x}px`;
    panel.style.top = `${position.y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function moveTo(x, y, persist = false) {
    if (media.matches) return;
    position = clampPosition(x, y);
    applyPosition();
    if (persist) writePosition(storageKey, position);
  }

  function beginDrag(event) {
    if (media.matches || event.button !== 0 || event.target.closest(INTERACTIVE_SELECTOR)) return;
    const rect = panel.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    panel.classList.add('floating-panel-dragging');
    dragSurface.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function updateDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    moveTo(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  }

  function endDrag(event) {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
    dragSurface.releasePointerCapture?.(drag.pointerId);
    drag = null;
    panel.classList.remove('floating-panel-dragging');
    writePosition(storageKey, position);
  }

  function moveWithKeyboard(event) {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction || media.matches) return;
    const rect = panel.getBoundingClientRect();
    moveTo(
      rect.left + direction[0] * QUEST_PANEL_LAYOUT.KEYBOARD_STEP,
      rect.top + direction[1] * QUEST_PANEL_LAYOUT.KEYBOARD_STEP,
      true,
    );
    event.preventDefault();
  }

  const handlePanelChange = ({ activePanel }) => {
    if (activePanel === panelName) requestAnimationFrame(applyPosition);
  };
  const handleMediaChange = () => applyPosition();
  const handleResize = () => {
    applyPosition();
    if (!media.matches && Number.isFinite(position.x)) writePosition(storageKey, position);
  };

  dragSurface.addEventListener('pointerdown', beginDrag);
  dragSurface.addEventListener('pointermove', updateDrag);
  dragSurface.addEventListener('pointerup', endDrag);
  dragSurface.addEventListener('pointercancel', endDrag);
  keyboardSurface.addEventListener('keydown', moveWithKeyboard);
  eventBus.on(Events.HUD_PANEL_CHANGED, handlePanelChange);
  media.addEventListener('change', handleMediaChange);
  window.addEventListener('resize', handleResize);
  applyPosition();

  return {
    applyPosition,
    destroy() {
      dragSurface.removeEventListener('pointerdown', beginDrag);
      dragSurface.removeEventListener('pointermove', updateDrag);
      dragSurface.removeEventListener('pointerup', endDrag);
      dragSurface.removeEventListener('pointercancel', endDrag);
      keyboardSurface.removeEventListener('keydown', moveWithKeyboard);
      eventBus.off(Events.HUD_PANEL_CHANGED, handlePanelChange);
      media.removeEventListener('change', handleMediaChange);
      window.removeEventListener('resize', handleResize);
    },
  };
}
