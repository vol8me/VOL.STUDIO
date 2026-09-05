import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { browserBoundary } from '../../scripts/vite/browserBoundary.mjs';
import { coreAliases } from '../../scripts/vite/coreAliases.mjs';

export default defineConfig({
  base: '/',
  clearScreen: false,
  plugins: [browserBoundary()],
  publicDir: resolve(import.meta.dirname, '../../core/public'),
  server: {
    port: 5175,
    strictPort: true,
    fs: {
      allow: [resolve(import.meta.dirname, '../..')],
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  // Alias listesi `vitest.config.ts` ile AYNI kaynaktan gelir; CORE'un
  // `exports` haritasından türer (bkz. scripts/vite/coreAliases.mjs).
  resolve: {
    alias: [
      ...coreAliases(),
      { find: '@shared', replacement: resolve(import.meta.dirname, './shared') },
      { find: '@', replacement: resolve(import.meta.dirname, './src') },
    ],
  },
});
