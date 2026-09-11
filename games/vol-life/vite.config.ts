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
    port: 5180,
    strictPort: true,
    host: host || false,
    // HMR soketi vol-hell'in 1421'i ve vol-arachnid'in 1422'siyle çakışmaz.
    hmr: host ? { protocol: 'ws', host, port: 1423 } : undefined,
    /*
     * Dev sunucusunun okuyabileceği ağaç, gerçekten TÜKETİLEN paketlerle
     * sınırlıdır — repo kökü AÇILMAZ.
     */
    fs: {
      allow: [
        import.meta.dirname,
        resolve(import.meta.dirname, '../../core'),
        resolve(import.meta.dirname, '../../tauri-v2'),
        resolve(import.meta.dirname, '../../node_modules'),
      ],
    },
    // Android derlemesi `src-tauri/target` ve `gen/android` altına yazar; izlenirse
    // açık dev penceresi derleme boyunca defalarca yeniden yüklenir (ölçüldü).
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  /*
   * `vite preview` gerçek build'i sunar; E2E kapısı buradan geçer.
   * 5181 KULLANILAMAZ: `devtools/vol-ui` e2e varsayılanı o porttur ve bu
   * önizleme açıkken `pnpm high` düşer. Portlar elle tutulur, tekillik
   * hiçbir kapıda sınanmaz.
   */
  preview: {
    port: 5182,
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
      // CORE alias'ları `core/package.json` exports haritasından TÜRETİLİR;
      // liste burada elle tutulmaz (sözleşme: `scripts/vite/coreAliases.mjs`).
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
