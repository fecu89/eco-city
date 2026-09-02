import { CITY_EVENTS, STRESS_PHASES } from '../core/EventDefinitions.js';
import { gameState } from '../core/GameState.js';
import { refreshIcons } from './Modal.js';

let root = null;

const UNKNOWN_EVENT = Object.freeze({
  label: '기후 이벤트',
  description: '이전 저장에서 불러온 기후 일정입니다.',
  durationDays: 0,
  icon: 'cloud',
});

function eventDefinition(type) {
  return CITY_EVENTS[type] || UNKNOWN_EVENT;
}

export function initForecastView(element) {
  root = element;
}

// 이미 SVG로 치환된 아이콘은 data-lucide만 바꿔도 그림이 그대로다 — 자리표시자 <i>로
// 되돌린 뒤 이 스트립 안에서만 다시 그린다(이름이 바뀔 때만).
function setForecastIcon(name) {
  const current = root.querySelector('svg[data-lucide], i[data-lucide]');
  if (!current || !name || current.getAttribute('data-lucide') === name) return;
  const placeholder = document.createElement('i');
  placeholder.setAttribute('data-lucide', name);
  placeholder.setAttribute('aria-hidden', 'true');
  current.replaceWith(placeholder);
  refreshIcons(root);
}

export function renderForecast() {
  if (!root) return;
  const active = gameState.events.schedule.find(({ id }) => id === gameState.events.activeId);
  const stressRunning = gameState.stressTest?.status === 'running';
  root.hidden = !active && !stressRunning;
  root.classList.toggle('active', Boolean(active));
  root.classList.remove('forecasting');
  if (root.hidden) return;
  const small = root.querySelector('small');
  const label = root.querySelector('b');
  if (stressRunning) {
    const phase = STRESS_PHASES[gameState.stressTest.phaseIndex];
    const remaining = Math.max(0, phase.durationDays - gameState.stressTest.phaseDay);
    root.classList.add('active');
    root.classList.remove('forecasting');
    small.textContent = `최종 테스트 · ${gameState.stressTest.phaseIndex + 1}/${STRESS_PHASES.length}`;
    label.textContent = `${phase.label} · ${remaining}일 남음`;
    root.title = '운영 모드·우선순위·배터리 정책을 조정할 수 있습니다.';
    setForecastIcon(phase.icon);
    return;
  }
  if (active) {
    const definition = eventDefinition(active.type);
    const remaining = Math.max(0, active.endAt - gameState.elapsedGameDays);
    small.textContent = '현재 이벤트';
    label.textContent = `${definition.label} · ${remaining}일 남음`;
    root.title = definition.description;
    setForecastIcon(definition.icon);
    return;
  }
}
