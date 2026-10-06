/**
 * UI varlık üreticisi (`pnpm gen:ui-assets`): tema tokenlarından ikon sprite'ları,
 * çerçeve, doku ve imleç SVG'lerini `core/public/assets/ui/` altına yazar.
 * `--check` dosyaları yazmadan sapmayı (eksik, fazla, farklı) bildirir.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildUiAssets } from './build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = resolve(root, 'public/assets/ui');
const load = (path) => import(pathToFileURL(resolve(root, path)).href);

const [{ VOL_COLORS }, { VOL_SEMANTIC_COLORS }, { VOL_EMBER_OVERRIDES }] = await Promise.all([
  load('src/ui/colors.ts'),
  load('src/ui/themes/semanticColors.ts'),
  load('src/ui/themes/ember.ts'),
]);
const base = { ...VOL_COLORS, ...VOL_SEMANTIC_COLORS };
const files = buildUiAssets({
  tokens: { default: base, ember: { ...base, ...VOL_EMBER_OVERRIDES } },
});

function existing(directory, found = []) {
  if (!existsSync(directory)) return found;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) existing(path, found);
    else found.push(relative(outDir, path).split('\\').join('/'));
  }
  return found;
}

if (process.argv.includes('--check')) {
  const problems = [];
  for (const [path, content] of files) {
    const file = join(outDir, path);
    if (!existsSync(file)) problems.push(`eksik: ${path}`);
    else if (readFileSync(file, 'utf8') !== content) problems.push(`farklı: ${path}`);
  }
  for (const path of existing(outDir)) if (!files.has(path)) problems.push(`fazla: ${path}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`[gen-ui-assets] ${problem}`);
    console.error('[gen-ui-assets] sapma var; `pnpm gen:ui-assets` çalıştır.');
    process.exit(1);
  }
  console.log(`[gen-ui-assets] ${files.size} dosya kaynakla aynı.`);
} else {
  for (const path of existing(outDir)) if (!files.has(path)) rmSync(join(outDir, path));
  for (const [path, content] of files) {
    const file = join(outDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf8');
  }
  console.log(`[gen-ui-assets] ${files.size} dosya yazıldı: ${relative(root, outDir)}`);
}
