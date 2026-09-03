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
    /*
     * Dev sunucusunun okuyabileceği ağaç, gerçekten TÜKETİLEN paketlerle
     * sınırlıdır. Bir dönem repo kökü açıktı çünkü rig asset'leri devtools
     * ağacından import ediliyordu; asset'ler bu paketin sahipliğine taşındıktan
     * sonra o genişliğin gerekçesi kalmadı.
     */
    fs: {
      allow: [
        import.meta.dirname,
        resolve(import.meta.dirname, '../../core'),
        resolve(import.meta.dirname, '../../tauri-v2'),
        resolve(import.meta.dirname, '../../node_modules'),
      ],
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
      '@volstudio/core/random': resolve(import.meta.dirname, '../../core/src/random/random.ts'),
      '@volstudio/core/math/interpolation': resolve(
        import.meta.dirname,
        '../../core/src/math/interpolation.ts',
      ),
      '@volstudio/core': resolve(import.meta.dirname, '../../core/src'),
      '@volstudio/tauri-v2': resolve(import.meta.dirname, '../../tauri-v2/src'),
      '@': resolve(import.meta.dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['phaser'],
  },
});
