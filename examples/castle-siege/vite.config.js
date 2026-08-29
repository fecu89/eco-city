import { defineConfig } from 'vite';

export default defineConfig({
  base: '/game-creator/castle-siege/',
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
});
