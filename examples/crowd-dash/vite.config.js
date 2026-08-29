import { defineConfig } from 'vite';

export default defineConfig({
  base: '/game-creator/crowd-dash/',
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
});
