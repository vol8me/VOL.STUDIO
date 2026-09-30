import { readFileSync } from 'node:fs';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier/build/index.js';

// Frozen workspace ağaçları immutable'dır; rutin lint onları taramaz.
// Liste `workspace-lifecycle.json`dan türetilir — yeni bir frozen kayıt
// buraya elle yazılmayı beklemez.
const frozenIgnores = JSON.parse(
  readFileSync(new URL('./workspace-lifecycle.json', import.meta.url), 'utf8'),
)
  .workspaces.filter((w) => w.status === 'frozen')
  .map((w) => `${w.path}/**`);

export default tseslint.config(
  // Global ignore — node_modules, dist, target, build çıktıları
  {
    ignores: [
      '**/node_modules/**',
      // Git dışı yerel dizinler: Claude Code çalışma alanı ve graphify çıktısı.
      '.claude/**',
      'graphify-out/**',
      // Betikle kopyalanan üçüncü parti derlemesi (git dışı).
      'devtools/deck/web/vendor/**',
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

  // TypeScript dosyaları — uygulama kaynakları, sunucular, betikler ve testler.
  {
    files: [
      '**/src/**/*.ts',
      '**/server/**/*.ts',
      '**/shared/**/*.ts',
      '**/scripts/**/*.ts',
      '**/tests/**/*.ts',
    ],
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
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },

  // Kapı betikleri, araç sunucuları ve tarayıcı betikleri (tip bilgisi yok).
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended, prettierConfig],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['devtools/deck/web/**/*.js'],
    languageOptions: { globals: { ...globals.browser, Phaser: 'readonly' } },
  },
  {
    files: ['tauri-v2/src-tauri/src/**/*.js', 'tauri-v2/tests/**/*.mjs'],
    languageOptions: { globals: { ...globals.browser } },
  },

  // Deterministik çıktı üreten kod yerel ayara bağlı sıralama kullanamaz:
  // `localeCompare` aynı diziyi `tr` ve `en`'de farklı sıralar.
  {
    files: ['devtools/audio-synth/**/*.ts', '**/scripts/**/*.{ts,mjs,js}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='localeCompare']",
          message:
            'Yerel ayara bağlı sıralama; kod birimi karşılaştırması kullan (a < b ? -1 : a > b ? 1 : 0).',
        },
      ],
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
