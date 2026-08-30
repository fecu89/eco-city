import { gameState } from '../core/GameState.js';

let els;
export function initSimulationHudView(elements) { els = elements; }

export function renderSimulationHud() {
  if (!els) return;
  const summary = gameState.lastTickSummary;
  els.time.textContent = `${String(gameState.simulationHour).padStart(2, '0')}:00`;
  const net = summary?.netCredits ?? 0;
  els.net.textContent = `${net > 0 ? '+' : net < 0 ? '' : '±'}${net}C/h`;
  els.power.textContent = `${summary?.deliveredPower ?? 0}/${summary?.demand ?? 0}E`;
  els.carbon.textContent = `${summary?.lowCarbonPercent ?? 0}%`;
  const labels = { normal: '평상시', heat_watch: '폭염 주의', extreme_heat: '극한 폭염' };
  els.alert.querySelector('b').textContent = labels[gameState.climateAlert] || labels.normal;
  els.alert.className = `climate-${gameState.climateAlert}`;
}
