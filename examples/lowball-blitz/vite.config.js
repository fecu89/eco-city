import { defineConfig } from 'vite';

export default defineConfig({
  base: '/lowball/',
  server: {
    port: 3008,
  },
  build: {
    target: 'esnext',
  },
});
