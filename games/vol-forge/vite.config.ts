import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { forgeOutputPlugin } from './server/forgePlugin.ts';

/**
 * Editör paketi — Vite + DOM, **Phaser yok** (§8.1).
 *
 * `core/src/ui` tamamen DOM'dur ve Phaser'a hiç bağlı değildir; editör bir
 * oyun olmadığı için oyun kabuğunu (`createVolGame`) da kurmaz.
 */
export default defineConfig({
  base: './',
  clearScreen: false,
  // Forge Phaser kabuğunu kullanmadığı için `createVolGame` fontları onun
  // adına taşımaz. Aynı CORE font klasörünü doğrudan public yüzey yaparak
  // geliştirme sunucusu ve üretim paketi aynı `/assets/fonts` yollarını taşır.
  publicDir: resolve(import.meta.dirname, '../../core/public'),
  plugins: [forgeOutputPlugin()],
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
  resolve: {
    alias: {
      '@volstudio/core': resolve(import.meta.dirname, '../../core/src'),
      '@': resolve(import.meta.dirname, './src'),
    },
  },
});
