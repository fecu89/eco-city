import { QUEST_PANEL_LAYOUT } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { createFloatingPanelController } from './FloatingPanelController.js';
import { refreshIcons } from './Modal.js';

function readPinned() {
  try {
    return Boolean(JSON.parse(localStorage.getItem(QUEST_PANEL_LAYOUT.STORAGE_KEY) || '{}').pinned);
  } catch {
    return false;
  }
}

function savePinned(pinned) {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(QUEST_PANEL_LAYOUT.STORAGE_KEY) || '{}');
  } catch {
    stored = {};
  }
  localStorage.setItem(QUEST_PANEL_LAYOUT.STORAGE_KEY, JSON.stringify({ ...stored, pinned }));
}

export function initQuestPanelController({
  panel,
  dragSurface = panel,
  keyboardSurface = panel,
  pinButton,
  topSafeElement = null,
  rightSafeElement = null,
}) {
  const mobileQuery = window.matchMedia(QUEST_PANEL_LAYOUT.MOBILE_QUERY);
  let pinnedPreference = readPinned();

  const floating = createFloatingPanelController({
    panel,
    panelName: 'quest',
    storageKey: QUEST_PANEL_LAYOUT.STORAGE_KEY,
    dragSurface,
    keyboardSurface,
    topSafeElement,
    rightSafeElement,
  });

  function effectivePinned() {
    return pinnedPreference && !mobileQuery.matches;
  }

  function renderPinned({ keepOpen = true } = {}) {
    const pinned = effectivePinned();
    panel.classList.toggle('quest-panel-pinned', pinned);
    pinButton.setAttribute('aria-pressed', String(pinned));
    pinButton.setAttribute('aria-label', pinned ? '퀘스트 창 고정 해제' : '퀘스트 창 고정');
    pinButton.title = pinned ? '고정 해제' : '반투명하게 고정';
    pinButton.innerHTML = `<i data-lucide="${pinned ? 'pin-off' : 'pin'}"></i>`;
    refreshIcons();
    eventBus.emit(Events.QUEST_PANEL_PIN_CHANGED, { pinned, keepOpen });
  }

  function setPinned(pinned, { keepOpen = true, persist = true } = {}) {
    pinnedPreference = Boolean(pinned);
    if (persist) savePinned(pinnedPreference);
    renderPinned({ keepOpen });
  }

  pinButton.addEventListener('click', () => setPinned(!pinnedPreference));
  eventBus.on(Events.QUEST_PANEL_PIN_REQUESTED, ({ pinned, keepOpen = false }) => setPinned(pinned, { keepOpen }));
  mobileQuery.addEventListener('change', () => renderPinned({ keepOpen: false }));

  renderPinned({ keepOpen: false });
  return floating;
}
