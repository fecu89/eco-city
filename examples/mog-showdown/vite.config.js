import { defineConfig } from 'vite';

export default defineConfig({
  base: '/game-creator/mog-showdown/',
  server: {
    port: 3001,
  },
  build: {
    target: 'esnext',
  },
});
