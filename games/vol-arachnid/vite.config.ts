import { coreAliases } from '../../scripts/vite/coreAliases.mjs';
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
  // `vite preview` gerçek build'i sunar; E2E kapısı buradan geçer.
  preview: {
    port: 5179,
    strictPort: true,
    host: '127.0.0.1',
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
    alias: [
      /*
       * CORE alias'ları `core/package.json` exports haritasından TÜRETİLİR.
       *
       * Buradaki liste bir dönem elle yazılıyordu ve tek bir önek girdisi
       * (`'@volstudio/core' -> core/src`) taşıyordu. Vite öneki dizine eşler:
       * `@volstudio/core/random` -> `core/src/random` (bir DİZİN) çözülemez,
       * ama `@volstudio/core/systems/SaveManager` gibi haritada HİÇ OLMAYAN
       * bir yol çözülür. Yani testler CORE'un iç yapısına uzanabiliyor,
       * yayınlanmış yüzeyi ise kısmen görünmez kalıyordu — sözleşme fiilen
       * uygulanmıyordu.
       */
      ...coreAliases(),
      {
        find: '@volstudio/tauri-v2',
        replacement: resolve(import.meta.dirname, '../../tauri-v2/src'),
      },
      { find: '@', replacement: resolve(import.meta.dirname, './src') },
    ],
  },
  optimizeDeps: {
    include: ['phaser'],
  },
});
