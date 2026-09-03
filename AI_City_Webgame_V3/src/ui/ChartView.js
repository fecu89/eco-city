import { gameState } from '../core/GameState.js';
import { CHART_MOTION, CHART_RULES, TIME } from '../core/Constants.js';
import { prefersReducedMotion } from './motionPreference.js';
// 레이더 차트 선 굵기·점 크기·색(Chart.js에 그대로 넘기는 CSS 색 문자열)·글자 크기는 settings.json VISUAL.CHART_STYLE.
import { VISUAL } from '../core/Constants.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

let Chart = null;
let chartLoad = null;
let chart = null;
let canvasEl = null;

export function initChartView(canvas) {
  canvasEl = canvas;
}

function isPanelVisible() {
  return canvasEl
    ?.closest('[data-hud-panel]')
    ?.getAttribute('aria-hidden') === 'false';
}

// chart.js는 별도 청크로 빌드된다(vite.config.js). 도시 상태 패널을 처음 열 때만
// 내려받으므로 첫 로딩에서 학교망이 받는 바이트가 줄어든다. 로드가 끝나기 전의
// updateChart() 호출은 그냥 반환해도 안전하다 — 로드가 끝나면 여기서 updateChart()를
// 다시 불러 gameState의 "그 시점 최신" 값으로 첫 렌더를 한다.
function ensureChartLibrary() {
  if (Chart || chartLoad) return;
  chartLoad = import('chart.js/auto').then((module) => {
    Chart = module.default;
    if (canvasEl) updateChart();
  }).catch(() => {
    // 청크를 못 받아도 게임은 계속 돌아야 한다. 다음에 패널을 열면 다시 시도한다.
    chartLoad = null;
  });
}

export function chartValues(state = gameState) {
  const m = state.metrics;
  if (!m) return [];
  const live = state.lastTickSummary;
  const reliability = live?.demand > 0
    ? live.deliveredPower / live.demand * 100
    : m.reliability;
  const carbon = live?.dailyCarbon ?? m.carbon;
  const water = live?.dailyWater ?? m.water;
  return [
    clamp(m.dev, 0, 100),
    clamp(reliability, 0, 100),
    // 탄소·물·시너지 링크를 0~100 축으로 환산하는 계수는 settings.json CHART_RULES.AXIS_SCALES.
    clamp(100 - carbon * CHART_RULES.AXIS_SCALES.CARBON, 0, 100),
    clamp(100 - water * CHART_RULES.AXIS_SCALES.WATER, 0, 100),
    clamp(m.synergyLinks * CHART_RULES.AXIS_SCALES.SYNERGY_LINK, 0, 100),
  ];
}

export function chartAnimationOptions({ panelVisible, reducedMotion, timeScale }) {
  const duration = panelVisible && !reducedMotion && timeScale > 0
    ? Math.round((TIME.BASE_DAY_MS / timeScale) * CHART_MOTION.ACTIVE_INTERVAL_FRACTION)
    : 0;
  return { duration, easing: CHART_MOTION.EASING };
}

function currentAnimationOptions() {
  return chartAnimationOptions({ panelVisible: isPanelVisible(), reducedMotion: prefersReducedMotion(), timeScale: gameState.timeScale });
}

export function updateChart() {
  const m = gameState.metrics;
  if (!m) return;
  // 패널을 한 번도 열지 않았으면 차트를 만들지 않는다(청크도 받지 않는다).
  // 한 번 열린 뒤에는 닫혀 있어도 계속 갱신한다 — 애니메이션 시간이 0이라 프레임을 쓰지 않는다.
  if (!chart && !isPanelVisible()) return;
  if (!Chart) {
    ensureChartLibrary();
    return;
  }
  const values = chartValues(gameState);
  const labels = ['발전', '전력안정', '저탄소', '물관리', '공간연결'];

  if (!chart) {
    const style = VISUAL.CHART_STYLE;
    chart = new Chart(canvasEl, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            data: values,
            borderWidth: style.BORDER_WIDTH,
            pointRadius: style.POINT_RADIUS,
            backgroundColor: style.BACKGROUND_COLOR,
            borderColor: style.BORDER_COLOR,
            pointBackgroundColor: style.POINT_COLOR,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: currentAnimationOptions(),
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false },
            grid: { color: style.GRID_COLOR },
            angleLines: { color: style.ANGLE_LINE_COLOR },
            pointLabels: { color: style.LABEL_COLOR, font: { size: style.LABEL_FONT_SIZE } },
          },
        },
        plugins: { legend: { display: false } },
      },
    });
  } else {
    chart.data.datasets[0].data = values;
    chart.options.animation = currentAnimationOptions();
    chart.update();
  }
}

export function requestChartResize() {
  // 도시 상태 패널이 열리는 순간의 유일한 호출 지점이다. 아직 차트가 없으면 여기가
  // chart.js 청크를 내려받는 첫 계기가 된다(시계가 멈춘 상태에서도 차트가 뜬다).
  if (!chart) {
    updateChart();
    return;
  }
  requestAnimationFrame(() => chart.resize());
}
