/**
 * colors.ts → theme.css :root bloğunu generate eder.
 * Renk değişikliği: colors.ts'i düzenle, `pnpm gen:theme` çalıştır.
 * Font, space, radius, transition değişkenleri theme.css'te manuel kalır.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const colorsPath = resolve(root, 'src/ui/colors.ts');
const themePath = resolve(root, 'src/ui/theme.css');

const colorsSource = readFileSync(colorsPath, 'utf-8');

const entries = [];
const regex = /^(\s*)([A-Za-z][A-Za-z0-9]*):\s*'([^']+)'/gm;
let match;
while ((match = regex.exec(colorsSource)) !== null) {
  const indent = match[1];
  const key = match[2];
  const value = match[3];
  const cssVar = `--vol-ui-${camelToKebab(key)}`;
  entries.push(`${indent}${cssVar}: ${value};`);
}

if (entries.length === 0) {
  console.error('[gen-theme] colors.ts\'ten renk token bulunamadı');
  process.exit(1);
}

let themeSource = readFileSync(themePath, 'utf-8');

const rootBlockRegex = /(:root\s*\{)([\s\S]*?)(\})/;
const rootMatch = themeSource.match(rootBlockRegex);
if (!rootMatch) {
  console.error('[gen-theme] theme.css\'te :root bloğu bulunamadı');
  process.exit(1);
}

const rootContent = rootMatch[2];

const colorLines = entries.join('\n');

const nonColorLines = rootContent
  .split('\n')
  .filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (trimmed.startsWith('--vol-ui-')) return false;
    return true;
  })
  .join('\n');

const newRootContent = `${colorLines}\n${nonColorLines}`;
const newRootBlock = `:root {${newRootContent}}`;

themeSource = themeSource.replace(rootBlockRegex[0], newRootBlock);

const generatedTag = '/* RENKLER — colors.ts\'ten generate edilir (pnpm gen:theme). Manuel düzenleme yapma. */\n';
if (!themeSource.includes(generatedTag)) {
  themeSource = themeSource.replace(':root {', `${generatedTag}:root {`);
}

writeFileSync(themePath, themeSource, 'utf-8');
console.log(`[gen-theme] ${entries.length} renk token theme.css'e yazıldı`);

function camelToKebab(str) {
  return str
    .replace(/^ui/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
}
