import { CITY_EVENTS, EVENT_FORECAST_HOURS, STRESS_PHASES } from '../core/EventDefinitions.js';
import { gameState } from '../core/GameState.js';

let root = null;

export function initForecastView(element) {
  root = element;
}

function nextEvent() {
  const completed = new Set((gameState.events.completed || []).map((item) => typeof item === 'string' ? item : item.id));
  return gameState.events.schedule.find((item) => !completed.has(item.id) && item.endAt > gameState.elapsedGameHours) || null;
}

export function renderForecast() {
  if (!root) return;
  const active = gameState.events.schedule.find(({ id }) => id === gameState.events.activeId);
  const next = nextEvent();
  root.classList.toggle('active', Boolean(active));
  root.classList.toggle('forecasting', !active && Boolean(next));
  const icon = root.querySelector('svg, i');
  const small = root.querySelector('small');
  const label = root.querySelector('b');
  if (gameState.stressTest?.status === 'running') {
    const phase = STRESS_PHASES[gameState.stressTest.phaseIndex];
    const remaining = Math.max(0, phase.durationHours - gameState.stressTest.phaseHour);
    root.classList.add('active');
    root.classList.remove('forecasting');
    small.textContent = `최종 테스트 · ${gameState.stressTest.phaseIndex + 1}/${STRESS_PHASES.length}`;
    label.textContent = `${phase.label} · ${remaining}시간 남음`;
    root.title = '운영 모드·우선순위·배터리 정책을 조정할 수 있습니다.';
    icon?.setAttribute?.('data-lucide', phase.icon);
    return;
  }
  if ((gameState.progression?.chapter || 1) < 3) {
    small.textContent = '도시 기후 예보';
    label.textContent = 'CH.3에서 활성화';
    root.title = '도시 전문화 목표 완료 후 기후 이벤트가 시작됩니다.';
    return;
  }
  if (active) {
    const definition = CITY_EVENTS[active.type];
    const remaining = Math.max(0, active.endAt - gameState.elapsedGameHours);
    small.textContent = '현재 이벤트';
    label.textContent = `${definition.label} · ${remaining}시간 남음`;
    root.title = definition.description;
    icon?.setAttribute?.('data-lucide', definition.icon);
    return;
  }
  if (next) {
    const definition = CITY_EVENTS[next.type];
    const until = Math.max(0, next.startAt - gameState.elapsedGameHours);
    small.textContent = until <= EVENT_FORECAST_HOURS ? `${EVENT_FORECAST_HOURS}시간 기후 예보` : '다음 이벤트';
    label.textContent = `${until}시간 후 ${definition.label}`;
    root.title = `${definition.description} · ${definition.durationHours}시간 지속`;
    icon?.setAttribute?.('data-lucide', definition.icon);
    return;
  }
  small.textContent = '도시 기후 예보';
  label.textContent = '새 예보 계산 중';
}
