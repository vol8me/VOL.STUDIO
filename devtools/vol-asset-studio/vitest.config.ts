import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { coreAliases } from '../../scripts/build/coreAliases.mjs';
import { loadQualityConfig } from '../../scripts/quality/config.mjs';

const quality = loadQualityConfig(new URL('../../quality.json', import.meta.url)) as {
  packages: Record<string, Record<string, number>>;
};

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'dist-server'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts', 'server/**/*.ts', 'shared/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/vite-env.d.ts', 'server/index.ts', 'shared/index.ts'],
      thresholds: quality.packages['@volstudio/vol-asset-studio'],
    },
  },
  // Alias listesi `vite.config.ts` ile AYNI kaynaktan gelir
  // (bkz. scripts/build/coreAliases.mjs).
  resolve: {
    alias: [
      ...coreAliases(),
      { find: '@shared', replacement: resolve(import.meta.dirname, './shared') },
      { find: '@', replacement: resolve(import.meta.dirname, './src') },
    ],
  },
});
