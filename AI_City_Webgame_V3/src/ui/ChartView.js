import { gameState } from '../core/GameState.js';
import { CHART_MOTION, TIME } from '../core/Constants.js';
import { prefersReducedMotion } from './motionPreference.js';

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
    clamp(100 - carbon * 4, 0, 100),
    clamp(100 - water * 4, 0, 100),
    clamp(m.synergyLinks * 20, 0, 100),
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
    chart = new Chart(canvasEl, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            data: values,
            borderWidth: 2,
            pointRadius: 2,
            backgroundColor: 'rgba(84,228,255,.10)',
            borderColor: 'rgba(84,228,255,.85)',
            pointBackgroundColor: 'rgba(113,245,180,1)',
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
            grid: { color: 'rgba(255,255,255,.08)' },
            angleLines: { color: 'rgba(255,255,255,.08)' },
            pointLabels: { color: '#a8bdd0', font: { size: 11 } },
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
