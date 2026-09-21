import { readFileSync } from 'node:fs';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier/build/index.js';

// Frozen workspace ağaçları immutable'dır; rutin lint onları taramaz.
// Liste `workspace-lifecycle.json`dan türetilir — yeni bir frozen kayıt
// buraya elle yazılmayı beklemez.
const frozenIgnores = JSON.parse(
  readFileSync(new URL('./workspace-lifecycle.json', import.meta.url), 'utf8'),
).workspaces.filter((w) => w.status === 'frozen').map((w) => `${w.path}/**`);

export default tseslint.config(
  // Global ignore — node_modules, dist, target, build çıktıları
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/target/**',
      '**/build/**',
      // vitest v8 coverage raporu — üretilen HTML/JS, repoya girmez
      '**/coverage/**',
      '**/*.config.{js,ts}',
      '**/vite-env.d.ts',
      ...frozenIgnores,
    ],
  },

  // TypeScript dosyaları — uygulama kaynakları, repo-host sunucuları ve testler.
  {
    files: ['**/src/**/*.ts', '**/server/**/*.ts', '**/shared/**/*.ts', '**/tests/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked, prettierConfig],
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
