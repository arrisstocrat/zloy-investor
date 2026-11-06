import { defineConfig } from 'vite';

export default defineConfig({
  base: '/prototype/',
  publicDir: false,
  build: { outDir: 'public/prototype', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
});
