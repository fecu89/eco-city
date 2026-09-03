import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 80,
    host: '0.0.0.0',
    strictPort: true,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        // 학교망 첫 로딩을 위해 벤더를 쪼갠다. three가 가장 큰 덩어리라 따로 빼고,
        // chart.js는 ChartView가 동적 import하므로 자기 청크로 떨어진다(도시 상태 패널을
        // 처음 열 때만 내려받는다). 나머지 의존성(animejs·lucide)은 vendor로 묶는다.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/chart.js') || id.includes('node_modules/@kurkle')) return 'chart';
          return 'vendor';
        },
      },
    },
  },
});
