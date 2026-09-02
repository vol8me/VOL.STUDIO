import { defineConfig, normalizePath } from 'vite';
import { resolve } from 'node:path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Tauri, bağlı bir Android cihazında dev sunucusunu LAN üzerinden açar ve
// host'u bu değişkenle bildirir. Verilmediğinde sunucu localhost'ta kalır.
const host = process.env.TAURI_DEV_HOST;

// Fontlar CORE'daki tek kaynaktan hem dev sunucusuna hem build'e taşınır.
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
    port: 5178,
    strictPort: true,
    host: host || false,
    // HMR soketi vol-hell'in 1421'iyle çakışmaz; iki oyun aynı anda cihaza
    // bağlanabilir.
    hmr: host ? { protocol: 'ws', host, port: 1422 } : undefined,
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
      '@volstudio/pen.dev': resolve(import.meta.dirname, '../../devtools/pen.dev/src'),
      '@': resolve(import.meta.dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['phaser'],
  },
});
