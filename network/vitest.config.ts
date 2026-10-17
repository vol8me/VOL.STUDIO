import { defineConfig } from 'vitest/config';
import { loadQualityConfig } from '../scripts/quality/config.mjs';

const quality = loadQualityConfig(new URL('../quality.json', import.meta.url)) as {
  packages: Record<string, Record<string, number>>;
};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
      thresholds: quality.packages['@volstudio/network'],
    },
  },
});
