import { eventBus, Events } from '../core/EventBus.js';

const VALID_PANELS = new Set(['build', 'quest', 'status', 'settings']);

let activePanel = null;
let modalOpen = false;
let openerEl = null;
let els = null;
let mobileQuery = null;
let resumeBuildAfterModal = false;
let resumeBuildOpener = null;
const notifications = new Set();

function triggers() {
  return els ? [...els.controls.querySelectorAll('[data-hud-target]')] : [];
}

function renderHudState() {
  if (!els) return;
  const hasOpenPanel = Boolean(activePanel) && !modalOpen;

  els.controls.setAttribute('aria-hidden', modalOpen ? 'true' : 'false');
  els.panelHost.classList.toggle('hud-open', hasOpenPanel);
  els.panelHost.dataset.activePanel = hasOpenPanel ? activePanel : '';

  els.panels.forEach((panel) => {
    const isActive = hasOpenPanel && panel.dataset.hudPanel === activePanel;
    panel.classList.toggle('hud-panel-active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });

  triggers().forEach((trigger) => {
    const isActive = hasOpenPanel && trigger.dataset.hudTarget === activePanel;
    trigger.classList.toggle('active', isActive);
    trigger.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    trigger.disabled = modalOpen;
    const target = trigger.dataset.hudTarget;
    const notification = target === 'quest'
      ? notifications.has('ready') ? 'ready' : notifications.has('new') ? 'new' : ''
      : '';
    if (notification) trigger.dataset.notification = notification;
    else delete trigger.dataset.notification;
  });
}

export function openHudPanel(name, opener) {
  if (modalOpen || !VALID_PANELS.has(name)) return false;
  activePanel = name;
  openerEl = opener || null;
  if (name === 'quest') {
    notifications.delete('ready');
    notifications.delete('new');
  }
  renderHudState();
  eventBus.emit(Events.HUD_PANEL_CHANGED, { activePanel });

  if (name === 'status') els?.onStatusOpened?.();

  requestAnimationFrame(() => {
    const closeButton = els?.panels
      .find((panel) => panel.dataset.hudPanel === name)
      ?.querySelector('[data-hud-close]');
    closeButton?.focus();
  });
  return true;
}

export function closeHudPanel({ restoreFocus = true } = {}) {
  const focusTarget = openerEl;
  const wasOpen = activePanel;
  activePanel = null;
  openerEl = null;
  renderHudState();
  if (wasOpen) eventBus.emit(Events.HUD_PANEL_CHANGED, { activePanel: null });
  if (restoreFocus && focusTarget?.isConnected) focusTarget.focus();
}

export function toggleHudPanel(name, opener) {
  if (activePanel === name) closeHudPanel();
  else openHudPanel(name, opener);
}

export function syncWorldHud() {
  renderHudState();
}

export function getWorldHudState() {
  return {
    activePanel,
    modalOpen,
    mobile: mobileQuery?.matches ?? false,
  };
}

export function initWorldHud(elements) {
  els = elements;
  mobileQuery = window.matchMedia('(max-width: 760px)');

  els.controls.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-hud-target]');
    if (trigger && els.controls.contains(trigger)) {
      toggleHudPanel(trigger.dataset.hudTarget, trigger);
      return;
    }

    const closeButton = event.target.closest('[data-hud-close]');
    if (closeButton && els.controls.contains(closeButton)) closeHudPanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && activePanel && !modalOpen) closeHudPanel();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!activePanel || modalOpen) return;
    // 건설 팔레트는 월드를 반복 클릭하는 동안 유지되는 명시적 입력 모드다.
    // 닫기/Escape/다른 HUD 버튼은 별도 경로로 계속 동작한다.
    if (activePanel === 'build') return;
    const active = els.panels.find((panel) => panel.dataset.hudPanel === activePanel);
    if (active?.contains(event.target) || event.target.closest('[data-hud-target]')) return;
    closeHudPanel({ restoreFocus: false });
  });

  eventBus.on(Events.MODAL_OPEN, () => {
    resumeBuildAfterModal = activePanel === 'build';
    resumeBuildOpener = resumeBuildAfterModal ? openerEl : null;
    modalOpen = true;
    closeHudPanel({ restoreFocus: false });
  });
  eventBus.on(Events.MODAL_CLOSE, () => {
    modalOpen = false;
    if (resumeBuildAfterModal) {
      const opener = resumeBuildOpener;
      resumeBuildAfterModal = false;
      resumeBuildOpener = null;
      openHudPanel('build', opener);
    } else {
      renderHudState();
    }
  });
  eventBus.on(Events.QUEST_READY, () => {
    notifications.add('ready');
    renderHudState();
  });
  eventBus.on(Events.QUEST_CLAIMED, () => {
    notifications.delete('ready');
    syncWorldHud();
  });
  eventBus.on(Events.QUEST_STARTED, () => {
    notifications.add('new');
    syncWorldHud();
  });
  eventBus.on(Events.GAME_RESET, () => {
    notifications.clear();
    syncWorldHud();
  });

  mobileQuery.addEventListener('change', () => {
    closeHudPanel({ restoreFocus: false });
    renderHudState();
  });

  renderHudState();
}
