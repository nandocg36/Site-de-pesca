import { defineConfig } from 'vite';

/** Serve a PWA vanilla legada (index.html na raiz). Porta 5174 para não colidir com apps/web (5173). */
export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5174,
    strictPort: false,
  },
  appType: 'spa',
});
