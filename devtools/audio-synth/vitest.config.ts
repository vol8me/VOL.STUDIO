import { loadQualityConfig } from '../../scripts/quality/config.mjs';
import { defineConfig } from 'vitest/config';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Kapsam eşikleri kök `quality.json`dan okunur — kapı sözleşmesinin tek
 * doğruluk kaynağı (bkz. scripts/quality/cli/workspace-contract.mjs).
 */
const quality = loadQualityConfig(new URL('../../quality.json', import.meta.url)) as {
  packages: Record<string, Record<string, number>>;
};

export default defineConfig({
  test: {
    pool: 'forks',
    /*
     * Dosyalar birbirinden bağımsızdır: her biri kendi `mkdtemp` dizinini ve
     * kendi süreç ortamını kullanır, paylaşılan dosya ya da port yoktur. Seri koşu
     * takımın en pahalı kalemiydi. İşçi sayısı bilerek sınırlıdır: `budget.test.ts`
     * duvar saati bütçesi sınar ve işlemciyi boğan bir koşu onu kararsızlaştırır.
     */
    maxWorkers: Math.min(4, Math.max(2, Math.floor(availableParallelism() / 2))),
    fileParallelism: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/*.d.ts'],
      thresholds: quality.packages['@volstudio/audio-synth'],
    },
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
