import { defineConfig, normalizePath } from 'vite';
import { resolve } from 'node:path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { coreAliases } from '../../scripts/build/coreAliases.mjs';

// Fontlar tek kaynaktan (core/public) çözümlenir — paketlere kopya yapılmaz.
// normalizePath: Windows'ta \ yerine / gerekli (tinyglobby \ escape olarak yorumlar).
// stripBase: true: dizin yapısını korumaz, sadece dosya adlarını hedefe koyar.
const coreFontsDir = normalizePath(resolve(import.meta.dirname, '../../core/public/assets/fonts'));

export default defineConfig({
  base: './',
  clearScreen: false,
  plugins: [
    viteStaticCopy({
      targets: [{ src: `${coreFontsDir}/*`, dest: 'assets/fonts', rename: { stripBase: true } }],
    }),
  ],
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
  // `exports` haritasından türer (bkz. scripts/build/coreAliases.mjs).
  resolve: {
    alias: [...coreAliases(), { find: '@', replacement: resolve(import.meta.dirname, './src') }],
  },
});
