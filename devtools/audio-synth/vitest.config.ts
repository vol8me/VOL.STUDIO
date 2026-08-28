import { loadQualityConfig } from '../../scripts/quality/config.mjs';
import { defineConfig } from 'vitest/config';

/**
 * Kapsam eşikleri kök `quality.json`dan okunur — kapı sözleşmesinin tek
 * doğruluk kaynağı (bkz. scripts/workspace-contract.mjs).
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
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
