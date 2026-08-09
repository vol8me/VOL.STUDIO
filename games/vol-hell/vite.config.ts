import { defineConfig, normalizePath } from 'vite';
import { resolve } from 'node:path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const host = process.env.TAURI_DEV_HOST;

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
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    fs: {
      allow: [resolve(import.meta.dirname, '../..')],
    },
    watch: {
      ignored: ['**/tauri-v2/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM ? 'chrome105' : 'es2022',
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
      '@volstudio/tauri-v2': resolve(import.meta.dirname, '../../tauri-v2/src'),
      '@': resolve(import.meta.dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['phaser'],
  },
});
