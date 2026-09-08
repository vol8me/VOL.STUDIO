import { coreAliases } from '../../scripts/vite/coreAliases.mjs';
import { loadQualityConfig } from '../../scripts/quality/config.mjs';
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

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
      exclude: ['src/**/*.d.ts', 'src/vite-env.d.ts', 'src/i18next-augment.ts'],
      thresholds: quality.packages['@volstudio/vol-life'],
    },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: [...coreAliases(), { find: '@', replacement: resolve(import.meta.dirname, './src') }],
  },
});
