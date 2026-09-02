import { CITY_EVENTS } from '../core/EventDefinitions.js';
import { eventBus, Events } from '../core/EventBus.js';
import { formatCredits } from './format.js';

export function showEventResult(result) {
  if (!result) return;
  const definition = CITY_EVENTS[result.type];
  const metrics = result.metrics;
  eventBus.emit(Events.TOAST_SHOW, {
    kicker: '기후 이벤트 종료',
    title: `${definition?.label || result.type} 운영 결과`,
    text: `정전 ${metrics.outageDays}일 · 배터리 ${metrics.batteryEnergyUsed.toFixed(1)}E · 순수익 ${formatCredits(metrics.netIncome)}`,
    meta: `CO₂ 평균 ${metrics.averageDailyCarbon.toFixed(1)}/일 · 최대 ${metrics.maxDailyCarbon.toFixed(1)}/일 · 물 초과 ${metrics.waterViolationDays}일 · 우선 개선: ${result.diagnosis.label}`,
    priority: true,
    kind: 'event-result-alert',
    action: 'status',
    actionLabel: '도시 상태 열기',
  });
}
