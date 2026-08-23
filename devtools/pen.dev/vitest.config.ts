import { loadQualityConfig } from '../../scripts/quality/config.mjs';
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Kapsam eşikleri kök `quality.json`dan okunur — kapı sözleşmesinin tek
 * doğruluk kaynağı (bkz. scripts/workspace-contract.mjs).
 *
 * `import ... with { type: 'json' }` KULLANILMIYOR: Prettier 3.0 import
 * attribute sözdizimini parse edemiyor ve `format-check` kapısı düşüyor.
 */
const quality = loadQualityConfig(new URL('../../quality.json', import.meta.url)) as {
  packages: Record<string, Record<string, number>>;
};

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Yalnızca çalışma zamanı kaynağı ölçülür; build-time script'ler
      // (scripts/) testle değil, çalıştırılarak doğrulanır.
      include: ['src/**/*.ts'],
      // Tip-only ve barrel dosyalarında çalıştırılabilir satır yok; dahil
      // edilirse kapsam oranını yapay olarak seyreltirler.
      exclude: ['src/**/index.ts', 'src/**/*.d.ts'],
      // Eşikler kök `quality.json`dan gelir — tek doğruluk kaynağı.
      // Burada sayı yazmak, bekçinin okuduğu değerle ayrışmaya davetiyedir.
      thresholds: quality.packages['@volstudio/pen.dev'],
    },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
});
