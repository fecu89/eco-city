import { gameState } from '../core/GameState.js';
import { CARBON_CRISIS } from '../core/Constants.js';
import { exactNumberLabel, formatCompactNumber, formatCredits, round1 } from './format.js';

let els;
export function initSimulationHudView(elements) { els = elements; }

function compactMetric(value) {
  const numeric = Number(value) || 0;
  return Math.abs(numeric) >= 1_000 ? formatCompactNumber(numeric) : String(round1(numeric));
}

function setMetricLabel(element, label, title) {
  const metric = element?.closest('[data-metric]');
  if (!metric) return;
  metric.setAttribute('aria-label', label);
  metric.title = title;
}

export function renderSimulationHud() {
  if (!els) return;
  const summary = gameState.lastTickSummary;
  const net = gameState.lastSettlementDelta;
  const creditPrefix = net > 0 ? '+' : net < 0 ? '-' : '±';
  const hourlyCarbon = summary?.hourlyCarbon ?? 0;
  const deliveredPower = summary?.deliveredPower ?? 0;
  const demand = summary?.demand ?? 0;
  const hourlyWater = summary?.hourlyWater ?? 0;
  const workforce = summary?.workforce ?? 0;
  const jobs = summary?.jobs ?? 0;
  els.net.textContent = `${creditPrefix}${formatCredits(Math.abs(net), { suffix: false, compact: true })}/h`;
  els.carbonRate.textContent = `${compactMetric(hourlyCarbon)}/h`;
  els.power.textContent = `${compactMetric(deliveredPower)}/${compactMetric(demand)} E`;
  els.water.textContent = `${compactMetric(hourlyWater)}/h`;
  els.labor.textContent = `${compactMetric(workforce)}/${compactMetric(jobs)}`;
  const creditsTitle = `보유 ${exactNumberLabel(gameState.credits, 2)} · 시간당 ${net >= 0 ? '+' : ''}${exactNumberLabel(net, 2)}`;
  setMetricLabel(els.net, `크레딧 ${creditsTitle}`, creditsTitle);
  setMetricLabel(
    els.power,
    `전력 공급 ${exactNumberLabel(deliveredPower, 1)}, 수요 ${exactNumberLabel(demand, 1)}`,
    `전력 공급 ${exactNumberLabel(deliveredPower, 1)} / 수요 ${exactNumberLabel(demand, 1)}`,
  );
  setMetricLabel(els.carbonRate, `이산화탄소 시간당 ${exactNumberLabel(hourlyCarbon, 1)}`, `시간당 CO₂ ${exactNumberLabel(hourlyCarbon, 1)}`);
  setMetricLabel(els.water, `물 시간당 ${exactNumberLabel(hourlyWater, 1)}`, `시간당 물 ${exactNumberLabel(hourlyWater, 1)}`);
  setMetricLabel(els.labor, `인력 ${exactNumberLabel(workforce, 0)}, 일자리 ${exactNumberLabel(jobs, 0)}`, `인력 ${exactNumberLabel(workforce, 0)} / 일자리 ${exactNumberLabel(jobs, 0)}`);
  els.carbon.textContent = `${summary?.lowCarbonPercent ?? 0}%`;
  const labels = { normal: '평상시', heat_watch: '폭염 주의', extreme_heat: '극한 폭염' };
  const carbonActive = gameState.carbonCrisisHours > 0;
  els.alert.querySelector('b').textContent = carbonActive
    ? `탄소 위험 ${gameState.carbonCrisisHours}/${CARBON_CRISIS.GAME_OVER_HOURS}h`
    : labels[gameState.climateAlert] || labels.normal;
  els.alert.className = `sr-only ${carbonActive ? 'climate-carbon_crisis' : `climate-${gameState.climateAlert}`}`;
}
