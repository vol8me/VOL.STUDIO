import { coreAliases } from '../../scripts/vite/coreAliases.mjs';
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * UZUN koşular (K6): tam seed korpusları ve simüle dakikalar. Birim kapısına ve
 * `pnpm high`a GİRMEZ — dosya deseni `tests/long/**\/*.long.ts`tir, çünkü
 * varsayılan `tests/**\/*.test.ts` deseni `.test.ts` adlı bir uzun testi
 * sessizce birim koşusuna sızdırır. Kapsam ölçülmez; iddia süre değil davranıştır.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/long/**/*.long.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30 * 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    reporters: ['verbose'],
  },
  resolve: {
    alias: [...coreAliases(), { find: '@', replacement: resolve(import.meta.dirname, './src') }],
  },
});
