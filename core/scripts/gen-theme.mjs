/**
 * Tema kaynağı → `theme.css` üretici (`pnpm gen:theme`).
 *
 * Kaynaklar (düz sabit modüller, Node tür soyma ile doğrudan yüklenir):
 *   core/src/ui/colors.ts                 genel 60 renk tokenı (public VOL_COLORS)
 *   core/src/ui/themes/semanticColors.ts  anlamsal roller (yüzey/çerçeve/ışıma/nadirlik)
 *   core/src/ui/themes/ember.ts           ember teması geçersiz kılmaları
 *
 * `theme.css` içindeki `@generated` işaretli iki bölge yeniden yazılır; font,
 * boşluk, katman ve diğer elle yazılan bölümlere dokunulmaz. `--check` dosyayı
 * yazmadan sapmayı bildirir (çıkış kodu 1). Doğrulama ve üretim mantığı
 * `themeSource.mjs`tedir ve testlenir.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyGenerated, validateThemeSource } from './themeSource.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const themePath = resolve(root, 'src/ui/theme.css');
const load = (path) => import(pathToFileURL(resolve(root, path)).href);

const [{ VOL_COLORS }, { VOL_SEMANTIC_COLORS }, { VOL_EMBER_OVERRIDES }] = await Promise.all([
  load('src/ui/colors.ts'),
  load('src/ui/themes/semanticColors.ts'),
  load('src/ui/themes/ember.ts'),
]);

const source = {
  colors: VOL_COLORS,
  semantic: VOL_SEMANTIC_COLORS,
  themes: { ember: VOL_EMBER_OVERRIDES },
};

const problems = validateThemeSource(source);
if (problems.length > 0) {
  for (const problem of problems) console.error(`[gen-theme] ${problem}`);
  process.exit(1);
}

const current = readFileSync(themePath, 'utf-8');
const next = applyGenerated(current, source);

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('[gen-theme] theme.css kaynaktan sapmış; `pnpm gen:theme` çalıştır.');
    process.exit(1);
  }
  console.log('[gen-theme] theme.css kaynakla aynı.');
} else {
  writeFileSync(themePath, next, 'utf-8');
  const count = Object.keys(VOL_COLORS).length + Object.keys(VOL_SEMANTIC_COLORS).length;
  console.log(`[gen-theme] ${count} token, ${Object.keys(source.themes).length} tema yazıldı`);
}
