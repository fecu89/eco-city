import Chart from 'chart.js/auto';
import { gameState } from '../core/GameState.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

let chart = null;
let canvasEl = null;

export function initChartView(canvas) {
  canvasEl = canvas;
}

export function updateChart() {
  const m = gameState.metrics;
  if (!m) return;
  const values = [
    clamp(m.dev, 0, 100),
    clamp(m.reliability, 0, 100),
    clamp(100 - m.carbon * 4, 0, 100),
    clamp(100 - m.water * 4, 0, 100),
    clamp(m.synergyLinks * 20, 0, 100),
  ];
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
        animation: { duration: 320 },
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
    chart.update();
  }
}
