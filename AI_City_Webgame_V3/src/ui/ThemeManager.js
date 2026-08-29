import { THEME_SCHEMAS, THEME_STORAGE_KEY } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

let currentTheme = 'dark';
let themeButton = null;
let refresh = () => {};

function renderThemeControl() {
  if (!themeButton) return;
  const nextIsLight = currentTheme === 'dark';
  themeButton.title = nextIsLight ? '라이트 모드' : '다크 모드';
  themeButton.setAttribute('aria-label', themeButton.title);
  themeButton.innerHTML = `<i data-lucide="${nextIsLight ? 'sun' : 'moon'}"></i>`;
  refresh();
}

export function setTheme(theme, { persist = true } = {}) {
  const next = THEME_SCHEMAS[theme] ? theme : 'dark';
  currentTheme = next;
  document.documentElement.dataset.theme = next;
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, next);
  renderThemeControl();
  eventBus.emit(Events.THEME_CHANGED, { theme: next, schema: THEME_SCHEMAS[next] });
  return next;
}

export function toggleTheme() {
  return setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

export function getTheme() {
  return currentTheme;
}

export function initThemeManager(button, refreshIcons) {
  themeButton = button;
  refresh = refreshIcons || (() => {});
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  setTheme(THEME_SCHEMAS[saved] ? saved : 'dark', { persist: Boolean(THEME_SCHEMAS[saved]) });
  themeButton?.addEventListener('click', toggleTheme);
}
