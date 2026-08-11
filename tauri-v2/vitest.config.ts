import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
      thresholds: {
        lines: 86,
        functions: 100,
        branches: 74,
        statements: 86,
      },
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
