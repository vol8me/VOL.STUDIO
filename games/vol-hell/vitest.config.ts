import { coreAliases } from '../../scripts/vite/coreAliases.mjs';
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
      // Tip-only ve barrel dosyalarında çalıştırılabilir satır yok; dahil
      // edilirse kapsam oranını yapay olarak seyreltirler.
      exclude: ['src/**/index.ts', 'src/**/*.d.ts', 'src/@types/**', 'src/vite-env.d.ts'],
      // Eşikler kök `quality.json`dan gelir — tek doğruluk kaynağı.
      // Burada sayı yazmak, bekçinin okuduğu değerle ayrışmaya davetiyedir.
      thresholds: quality.packages['@volstudio/vol-hell'],
    },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
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
        find: '@volstudio/audio-synth',
        replacement: resolve(import.meta.dirname, '../../devtools/audio-synth/src'),
      },
      { find: '@', replacement: resolve(import.meta.dirname, './src') },
    ],
  },
});
