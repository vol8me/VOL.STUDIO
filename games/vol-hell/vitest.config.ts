import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

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
        lines: 68,
        functions: 85,
        branches: 79,
        statements: 68,
      },
    },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: {
      '@volstudio/core': resolve(import.meta.dirname, '../../core/src'),
      '@': resolve(import.meta.dirname, './src'),
    },
  },
});
