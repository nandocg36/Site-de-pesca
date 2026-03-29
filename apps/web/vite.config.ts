import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@pesca/fishing-core': path.resolve(__dirname, '../../packages/fishing-core/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
});
