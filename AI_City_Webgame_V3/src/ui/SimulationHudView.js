import { gameState } from '../core/GameState.js';
import { CARBON_CRISIS } from '../core/Constants.js';
import { formatCredits, round1 } from './format.js';

let els;
export function initSimulationHudView(elements) { els = elements; }

export function renderSimulationHud() {
  if (!els) return;
  const summary = gameState.lastTickSummary;
  const net = gameState.lastSettlementDelta;
  const creditPrefix = net > 0 ? '+' : net < 0 ? '-' : '±';
  els.net.textContent = `${creditPrefix}${formatCredits(Math.abs(net), { suffix: false })}/h`;
  els.carbonRate.textContent = `${round1(summary?.hourlyCarbon ?? 0)}/h`;
  els.power.textContent = `${summary?.deliveredPower ?? 0}/${summary?.demand ?? 0}E`;
  els.water.textContent = `${round1(summary?.hourlyWater ?? 0)}/h`;
  els.labor.textContent = `${summary?.workforce ?? 0}/${summary?.jobs ?? 0}`;
  els.carbon.textContent = `${summary?.lowCarbonPercent ?? 0}%`;
  const labels = { normal: '평상시', heat_watch: '폭염 주의', extreme_heat: '극한 폭염' };
  const carbonActive = gameState.carbonCrisisHours > 0;
  els.alert.querySelector('b').textContent = carbonActive
    ? `탄소 위험 ${gameState.carbonCrisisHours}/${CARBON_CRISIS.GAME_OVER_HOURS}h`
    : labels[gameState.climateAlert] || labels.normal;
  els.alert.className = `sr-only ${carbonActive ? 'climate-carbon_crisis' : `climate-${gameState.climateAlert}`}`;
}
