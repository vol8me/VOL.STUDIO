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
      include: ['src/**/*.ts'],
      // Tip-only dosyalarda çalıştırılabilir satır yok; dahil edilmeleri kapsam
      // oranını yapay olarak seyreltir.
      /*
       * TİP-ONLY modüller kapsam dışıdır: çalıştırılabilir tek satırları yoktur
       * ve dahil edildiklerinde oranı YAPAY olarak seyreltirler — v8 onları
       * %0 sayar. `locomotionSignals.ts` yalnız sözleşme arayüzleri,
       * `i18next-augment.ts` ise bir modül genişletmesi taşır.
       */
      exclude: [
        'src/**/*.d.ts',
        'src/vite-env.d.ts',
        'src/i18next-augment.ts',
        'src/runtime/entity/locomotionSignals.ts',
      ],
      // Burada sayı yazmak, bekçinin okuduğu değerle ayrışmaya davetiyedir.
      thresholds: quality.packages['@volstudio/vol-arachnid'],
    },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
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
});
