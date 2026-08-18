import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Kapsam eşikleri kök `quality.json`dan okunur — kapı sözleşmesinin tek
 * doğruluk kaynağı (bkz. scripts/workspace-contract.mjs).
 *
 * `import ... with { type: 'json' }` KULLANILMIYOR: Prettier 3.0 import
 * attribute sözdizimini parse edemiyor ve `format-check` kapısı düşüyor.
 */
const quality = JSON.parse(readFileSync(new URL('../quality.json', import.meta.url), 'utf-8')) as {
  packages: Record<string, Record<string, number>>;
};

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      // Tip-only ve barrel dosyalarında çalıştırılabilir satır yok; dahil
      // edilirse kapsam oranını yapay olarak seyreltirler.
      exclude: ['src/**/index.ts', 'src/**/*.d.ts', 'src/@types/**', 'src/vite-env.d.ts'],
      // Eşikler kök `quality.json`dan gelir — tek doğruluk kaynağı.
      // Burada sayı yazmak, bekçinin okuduğu değerle ayrışmaya davetiyedir.
      thresholds: quality.packages['@volstudio/tauri-v2'],
    },
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@volstudio/core': resolve(__dirname, '../core/src'),
      '@': resolve(__dirname, './src'),
    },
  },
});
