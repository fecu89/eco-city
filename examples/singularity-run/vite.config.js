import { defineConfig } from 'vite';

export default defineConfig({
  base: '/game-creator/singularity-run/',
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
});
