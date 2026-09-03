import { gameState } from '../core/GameState.js';
import { CARBON_CRISIS, CITY_FAILURE_RULES, HUD_RULES, WEATHER_RULES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { weatherAt, weatherForecast } from '../systems/WeatherSystem.js';
import { refreshIcons } from './Modal.js';
import { compactMetric, exactNumberLabel, formatCredits, round1 } from './format.js';

let els;
// 날씨 칩은 지표가 아니라 안내라서 위험 여부와 무관하게 언제나 오늘의 날씨 창을 연다.
const WEATHER_METRIC = 'weather';
// #simulationHud 전체를 aria-live로 두면 매 틱 정산 수치가 그대로 읽혀 스크린리더가 폭주한다.
// 기후 경보 단계가 실제로 바뀔 때만 전용 라이브 영역에 한 줄을 쓴다.
const CLIMATE_ALERT_LABELS = { normal: '평상시', heat_watch: '폭염 주의', extreme_heat: '극한 폭염' };
let announcedClimateAlert = 'normal';

export function initSimulationHudView(elements) {
  els = elements;
  if (els.root && !els.root.dataset.metricCausesBound) {
    els.root.dataset.metricCausesBound = 'true';
    els.root.addEventListener('click', (event) => {
      const metric = event.target.closest('[data-metric]');
      if (!metric) return;
      if (metric.dataset.metric !== WEATHER_METRIC && !metric.classList.contains('metric-danger')) return;
      eventBus.emit(Events.HUD_METRIC_CAUSES_REQUESTED, { metric: metric.dataset.metric });
    });
  }
}

function setMetricLabel(element, label, title) {
  const metric = element?.closest('[data-metric]');
  if (!metric) return;
  metric.setAttribute('aria-label', label);
  metric.title = title;
}

function signedMetric(value) {
  const numeric = Number(value) || 0;
  if (numeric === 0) return '±0';
  return `${numeric > 0 ? '+' : ''}${compactMetric(numeric)}`;
}

// 이미 SVG로 치환된 아이콘은 data-lucide만 바꿔도 그림이 그대로다 — 자리표시자 <i>로 되돌린 뒤
// 이 칩 안에서만 다시 그린다(종류가 바뀔 때만). ForecastView.setForecastIcon과 같은 방식이다.
function setWeatherIcon(chip, name) {
  const current = chip.querySelector('svg[data-lucide], i[data-lucide]');
  if (!current || !name || current.getAttribute('data-lucide') === name) return;
  const placeholder = document.createElement('i');
  placeholder.className = 'sim-metric-icon';
  placeholder.setAttribute('data-lucide', name);
  placeholder.setAttribute('aria-hidden', 'true');
  current.replaceWith(placeholder);
  refreshIcons(chip);
}

// 4배속에서는 매 틱 불리므로 값이 바뀔 때만 텍스트 노드를 갈아 끼운다.
function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function renderWeatherChip() {
  const chip = els.weather?.closest('[data-metric]');
  if (!chip) return;
  const weather = weatherAt(gameState);
  const [tomorrow] = weatherForecast(gameState, 1);
  setText(els.weather, WEATHER_RULES.CHIP_LABEL(weather));
  setWeatherIcon(chip, weather.icon);
  const tooltip = WEATHER_RULES.CHIP_TOOLTIP(weather, tomorrow);
  setMetricLabel(els.weather, tooltip, tooltip);
  chip.classList.toggle('is-forced', Boolean(weather.forcedBy));
}

function setMetricRisk(element, { danger = false, warning = false } = {}) {
  const metric = element?.closest('[data-metric]');
  if (!metric) return;
  metric.classList.toggle('metric-danger', danger);
  metric.classList.toggle('metric-warning', !danger && warning);
  metric.setAttribute('aria-haspopup', danger ? 'dialog' : 'false');
}

export function renderSimulationHud() {
  if (!els) return;
  const summary = gameState.lastTickSummary;
  const net = gameState.lastSettlementDelta;
  const creditPrefix = net > 0 ? '+' : net < 0 ? '-' : '±';
  const dailyCarbon = summary?.dailyCarbon ?? 0;
  const deliveredPower = summary?.deliveredPower ?? 0;
  const demand = summary?.demand ?? 0;
  // 실제 공급량은 수요를 넘지 못하므로 칩에는 "최대 공급 가능량(총 발전 가능량)/수요"를 보여준다.
  const generationAvailable = summary?.generationAvailable ?? deliveredPower;
  const powerMargin = round1(deliveredPower - demand);
  const batteryStored = summary?.batteryStored ?? 0;
  const dailyWater = summary?.dailyWater ?? 0;
  const capacity = summary?.capacity ?? summary?.workforce ?? 0;
  const used = summary?.used ?? summary?.jobs ?? 0;
  els.net.textContent = `${creditPrefix}${formatCredits(Math.abs(net), { suffix: false, compact: true })}/일`;
  els.carbonRate.textContent = `${compactMetric(dailyCarbon)}/일`;
  // 칩에는 공급 가능량/수요를, 실제 공급과 여유는 색·툴팁으로 알린다(모바일에는 툴팁이 없다).
  els.power.textContent = `${compactMetric(generationAvailable)}/${compactMetric(demand)}`;
  els.battery.textContent = compactMetric(batteryStored);
  els.water.textContent = `${compactMetric(dailyWater)}/일`;
  const laborText = els.labor.querySelector('span') || els.labor;
  laborText.textContent = `사용 인력 ${compactMetric(used)} / 전체 인구 ${compactMetric(capacity)}`;
  const creditsTitle = `보유 ${exactNumberLabel(gameState.credits, 2)} · 일일 ${net >= 0 ? '+' : ''}${exactNumberLabel(net, 2)}`;
  setMetricLabel(els.net, `크레딧 ${creditsTitle}`, creditsTitle);
  setMetricLabel(
    els.power,
    `전력 공급 가능 ${exactNumberLabel(generationAvailable, 1)}, 실제 공급 ${exactNumberLabel(deliveredPower, 1)}, 수요 ${exactNumberLabel(demand, 1)}, 여유 ${exactNumberLabel(powerMargin, 1)}`,
    `공급 가능 ${exactNumberLabel(generationAvailable, 1)} / 수요 ${exactNumberLabel(demand, 1)} · 실제 공급 ${exactNumberLabel(deliveredPower, 1)} · 여유 ${powerMargin >= 0 ? '+' : ''}${exactNumberLabel(powerMargin, 1)}`,
  );
  setMetricLabel(els.battery, `배터리 저장량 ${exactNumberLabel(batteryStored, 1)}`, `배터리 저장량 ${exactNumberLabel(batteryStored, 1)} E`);
  setMetricLabel(els.carbonRate, `이산화탄소 일일 ${exactNumberLabel(dailyCarbon, 1)}`, `일일 CO₂ ${exactNumberLabel(dailyCarbon, 1)}`);
  setMetricLabel(els.water, `물 일일 ${exactNumberLabel(dailyWater, 1)}`, `일일 물 ${exactNumberLabel(dailyWater, 1)}`);
  els.labor.setAttribute('aria-label', `사용 인력 ${exactNumberLabel(used, 0)}, 전체 인구 ${exactNumberLabel(capacity, 0)}`);
  renderWeatherChip();
  const hasBattery = gameState.grid.some((cell) => cell?.type === 'battery');
  const hasWaterLimit = summary?.waterLimit != null && Number.isFinite(Number(summary.waterLimit));
  const waterLimit = hasWaterLimit ? Number(summary.waterLimit) : null;
  setMetricRisk(els.net, { danger: net < 0 });
  setMetricRisk(els.power, { danger: powerMargin < 0 });
  setMetricRisk(els.battery, { danger: hasBattery && batteryStored <= HUD_RULES.BATTERY_DANGER_E, warning: hasBattery && batteryStored < HUD_RULES.BATTERY_WARN_E });
  setMetricRisk(els.carbonRate, { danger: dailyCarbon > CARBON_CRISIS.SAFE_DAILY });
  setMetricRisk(els.water, { danger: waterLimit != null && dailyWater > waterLimit });
  els.carbon.textContent = `${summary?.lowCarbonPercent ?? 0}%`;
  const labels = CLIMATE_ALERT_LABELS;
  const carbonActive = gameState.carbonCrisisDays > 0;
  const risk = gameState.operationalRisk;
  const operationalAlert = risk.negativeCreditDays > 0 || risk.essentialBlackoutDays > 0;
  els.alert.querySelector('b').textContent = carbonActive
    ? `탄소 위험 ${gameState.carbonCrisisDays}/${CARBON_CRISIS.GAME_OVER_DAYS}일`
    : operationalAlert
      ? risk.negativeCreditDays >= risk.essentialBlackoutDays
        ? `적자 위험 ${risk.negativeCreditDays}/${CITY_FAILURE_RULES.CREDIT_GAME_OVER_DAYS}일`
        : `필수전력 위험 ${risk.essentialBlackoutDays}/${CITY_FAILURE_RULES.ESSENTIAL_GAME_OVER_DAYS}일`
    : labels[gameState.climateAlert] || labels.normal;
  els.alert.className = `sr-only ${carbonActive || operationalAlert ? 'climate-carbon_crisis' : `climate-${gameState.climateAlert}`}`;
  announceClimateAlert();
}

function announceClimateAlert() {
  if (!els.announcer || gameState.climateAlert === announcedClimateAlert) return;
  announcedClimateAlert = gameState.climateAlert;
  els.announcer.textContent = `기후 경보: ${CLIMATE_ALERT_LABELS[announcedClimateAlert] || CLIMATE_ALERT_LABELS.normal}`;
}
