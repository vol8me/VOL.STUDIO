import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier/build/index.js';

export default tseslint.config(
  // Global ignore — node_modules, dist, target, build çıktıları
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/target/**',
      '**/build/**',
      '**/*.config.{js,ts}',
      '**/vite-env.d.ts',
    ],
  },

  // TypeScript dosyaları — core, games, tauri-v2 src ve tests
  {
    files: ['**/src/**/*.ts', '**/tests/**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      prettierConfig,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // explicit any yasak — unknown ve tip güvenliği öncelik
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          // _prefix ile başlayan parametreler bilinçli kullanılmıyor
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Phaser pattern: event listener'lar bind ile geçirilir
      '@typescript-eslint/unbound-method': 'off',
      // Consistent type imports — verbatimModuleSyntax zaten var
      '@typescript-eslint/consistent-type-imports': 'error',
      // no-floating-promises — Phaser async pattern'leri için warning
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },

  // Test dosyaları — daha gevşek kurallar
  {
    files: ['**/tests/**/*.ts'],
    rules: {
      // Test'lerde non-null assertion yaygın (mock setup)
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Test'lerde floating promises olabilir (vi.mock, beforeEach)
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
);
