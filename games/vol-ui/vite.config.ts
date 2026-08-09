import { defineConfig, normalizePath } from 'vite';
import { resolve } from 'node:path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

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
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) {
            return 'phaser';
          }
          return undefined;
        },
      },
    },
    assetsInlineLimit: 4096,
  },
  resolve: {
    alias: {
      '@volstudio/core': resolve(import.meta.dirname, '../../core/src'),
      '@': resolve(import.meta.dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['phaser'],
  },
});
