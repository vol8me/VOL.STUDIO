import { defineConfig } from 'vitest/config';

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
        lines: 82,
        functions: 80,
        branches: 77,
        statements: 82,
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
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
