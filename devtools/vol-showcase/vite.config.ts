import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { browserBoundary } from '../../scripts/vite/browserBoundary.mjs';
import { coreAliases } from '../../scripts/vite/coreAliases.mjs';

// Fontlar tek kaynaktan (core/public) çözümlenir — paketlere kopya yapılmaz.
// publicDir hem dev'te hem build'de aynı yolu koruyarak FontManager'a sunar.
const corePublicDir = resolve(import.meta.dirname, '../../core/public');

export default defineConfig({
  base: './',
  publicDir: corePublicDir,
  clearScreen: false,
  plugins: [browserBoundary()],
  server: {
    port: 5174,
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
    assetsInlineLimit: 4096,
  },
  // Alias listesi `vitest.config.ts` ile AYNI kaynaktan gelir; CORE'un
  // `exports` haritasından türer (bkz. scripts/vite/coreAliases.mjs).
  resolve: {
    alias: [...coreAliases(), { find: '@', replacement: resolve(import.meta.dirname, './src') }],
  },
});
