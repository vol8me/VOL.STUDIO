import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import {
  applyGenerated,
  validateMotion,
  validateThemeSource,
} from '../../core/scripts/themeSource.mjs';
import { buildUiAssets } from '../../core/scripts/ui-assets/build.mjs';

/**
 * UI tema kapıları (UI-01.5), `contract` içinde koşar:
 *
 * 1. Tema kaynağı parite ve sapma: `theme.css` üretilen bölgeleri kaynaktan
 *    (`colors.ts`, `semanticColors.ts`, `ember.ts`, `motion/presets.ts`) ve UI varlık
 *    çıktısı (`core/public/assets/ui`) üreticiden sapmamış olmalı.
 * 2. Kontrast: metin ≥4.5, ikon/odak/bileşen kenarlığı ≥3, SON renk üzerinden (alfalı
 *    ön renk ve alfalı zemin opak bir tabanla birleştirilir; hex çiftine bakılmaz).
 *    Mevcut kusurlar sahip UI görevine bağlı kayıtlıdır: kayıtsız yeni kusur ve
 *    bayat (düzelmiş) kayıt ikisi de düşer.
 * 3. Ham hareket süresi: UI CSS'inde `transition`/`animation` içinde değişken dışı süre
 *    yazılırsa dosya başına sayaç artamaz (yeni bileşen ham süreyle düşer) ve ratchet
 *    gereği azalan sayı kayda düşürülene kadar düşer. Domain zaman aşımı, işlevsel
 *    zamanlayıcı ve genel `animateValue` sayısal API'si bu kapının konusu DEĞİLDİR.
 *
 * Kaynak okuma AST iledir (tür soyma/regex değil): sabit nesneler değerlendirilir.
 */
export const KNOWN_PATH = 'scripts/quality/uiThemeKnown.json';
const CSS_ROOT = 'core/src/ui';
const THEME_CSS = 'core/src/ui/theme.css';
const ASSET_DIR = 'core/public/assets/ui';

// ─── AST ile sabit nesne okuma ──────────────────────────────────────────────

function evaluate(node) {
  if (
    ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    return evaluate(node.expression);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken)
    return -evaluate(node.operand);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(evaluate);
  if (ts.isObjectLiteralExpression(node)) {
    const out = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property))
        throw new Error('yalnız düz property atamaları desteklenir');
      const key =
        ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)
          ? property.name.text
          : null;
      if (key === null) throw new Error('hesaplanan property adı desteklenmez');
      out[key] = evaluate(property.initializer);
    }
    return out;
  }
  throw new Error(`desteklenmeyen sabit ifade: ${ts.SyntaxKind[node.kind]}`);
}

/** `export const NAME = {...}` sabitinin değeri (AST'den; kodu çalıştırmaz). */
export function readExportedConstant(file, text, name) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer
      )
        return evaluate(declaration.initializer);
    }
  }
  throw new Error(`${file}: ${name} bulunamadı`);
}

// ─── Kontrast ───────────────────────────────────────────────────────────────

/** @type {(hex: string) => [number, number, number]} */
const rgbOf = (hex) =>
  /** @type {[number, number, number]} */ (
    [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
  );
const alphaOf = (hex) => (hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1);

/**
 * `foreground` (alfalı olabilir) rengini opak `base` RGB'si üstüne bindirir.
 * @param {string} foreground
 * @param {[number, number, number]} base
 * @returns {[number, number, number]}
 */
function composite(foreground, base) {
  const alpha = alphaOf(foreground);
  const [red, green, blue] = rgbOf(foreground);
  const mix = (channel, under) => Math.round(channel * alpha + under * (1 - alpha));
  return [mix(red, base[0]), mix(green, base[1]), mix(blue, base[2])];
}

function luminance([red, green, blue]) {
  const linear = (value) => {
    const unit = value / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/**
 * `foreground` ve `background` token değerleri arasındaki WCAG oranı. Alfalı zemin
 * sayfa tabanı (`uiBg`) üstüne, alfalı ön renk bulunduğu zeminin SON rengi üstüne
 * bindirilir.
 */
/**
 * @param {string} foreground
 * @param {string} background
 * @param {[number, number, number]} pageBase
 */
export function contrastRatio(foreground, background, pageBase) {
  const back = background.length === 9 ? composite(background, pageBase) : rgbOf(background);
  const front = composite(foreground, back);
  const [light, dark] = [luminance(front), luminance(back)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const SURFACES = [
  'uiBg',
  'uiBgSubtle',
  'uiSurface1',
  'uiSurface2',
  'uiSurface3',
  'selectedFill',
  'hoverFill',
  'pressedFill',
  'page',
  'well',
  'panel',
  'plate',
  'overlayPanel',
];
const cap = (word) => word[0].toUpperCase() + word.slice(1);

/**
 * Kapının sınadığı çiftler: `[ön renk, zemin, en düşük oran]`.
 * @returns {[string, string, number][]}
 */
export function contrastPairs() {
  /** @type {[string, string, number][]} */
  const pairs = [];
  for (const surface of SURFACES)
    for (const text of ['uiText', 'uiTextSecondary', 'uiTextMuted'])
      pairs.push([text, surface, 4.5]);
  for (const family of ['brand', 'support', 'accent'])
    for (const state of ['Solid', 'Hover', 'Pressed'])
      pairs.push([`on${cap(family)}`, `${family}${state}`, 4.5]);
  for (const family of ['success', 'warning', 'danger', 'info'])
    pairs.push([`on${cap(family)}`, `${family}Solid`, 4.5]);
  for (const surface of ['uiBg', 'uiSurface1', 'uiSurface2', 'uiSurface3', 'selectedFill']) {
    pairs.push(['uiIcon', surface, 3]);
    pairs.push(['focusRing', surface, 3]);
  }
  for (const surface of ['uiBg', 'uiSurface1', 'uiSurface2'])
    pairs.push(['uiBorderStrong', surface, 3]);
  return pairs;
}

/** Her tema için başarısız çiftler: `{ theme, fg, bg, ratio, min }`, deterministik sırada. */
export function contrastFailures(themes) {
  const failures = [];
  for (const [theme, tokens] of Object.entries(themes)) {
    const base = rgbOf(tokens.uiBg);
    for (const [fg, bg, min] of contrastPairs()) {
      const ratio = contrastRatio(tokens[fg], tokens[bg], base);
      if (ratio < min) failures.push({ theme, fg, bg, ratio: Number(ratio.toFixed(2)), min });
    }
  }
  return failures;
}

// ─── Ham hareket süresi ─────────────────────────────────────────────────────

const MOTION_PROPERTY =
  /(?:^|[;{\s])(transition|transition-duration|transition-delay|animation|animation-duration|animation-delay)\s*:\s*([^;}]+)/g;

/** Yorumları atar; `var(...)` dışındaki sıfırdan büyük süre sayısını döndürür. */
export function rawDurationCount(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let count = 0;
  for (const match of text.matchAll(MOTION_PROPERTY)) {
    const value = match[2].replace(/var\([^)]*\)/g, '');
    for (const time of value.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g))
      if (Number(time[1]) > 0) count += 1;
  }
  return count;
}

function walk(directory, pattern, found = []) {
  if (!existsSync(directory)) return found;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, pattern, found);
    else if (pattern.test(entry.name)) found.push(path);
  }
  return found;
}

// ─── Doğrulama ──────────────────────────────────────────────────────────────

function openTasks(text) {
  return new Set([...text.matchAll(/^- \[ \] \*\*(UI-\d\d\.\d) /gm)].map((match) => match[1]));
}

const failureKey = (failure) => `${failure.theme}: ${failure.fg} / ${failure.bg}`;

/** Kayıtlı kusurlar ↔ ölçülen kusurlar: kayıtsız yeni, bayat ve sahipsiz kayıt düşer. */
export function validateContrastKnown(records, failures, tasks) {
  const problems = [];
  const known = new Map();
  for (const record of records) {
    const key = `${record.theme}: ${record.fg} / ${record.bg}`;
    if (known.has(key)) problems.push(`kontrast: yinelenen kayıt: ${key}`);
    known.set(key, record);
    if (!tasks.has(record.owner))
      problems.push(`kontrast: sahip görev açık bir UI görevi olmalı (${record.owner}): ${key}`);
    if (typeof record.reason !== 'string' || record.reason.trim() === '')
      problems.push(`kontrast: gerekçe boş: ${key}`);
  }
  const seen = new Set();
  for (const failure of failures) {
    const key = failureKey(failure);
    seen.add(key);
    if (!known.has(key))
      problems.push(
        `kontrast: kayıtsız kusur ${key} = ${failure.ratio} (<${failure.min}); düzelt ya da sahip görevli kayıt aç.`,
      );
  }
  for (const key of known.keys())
    if (!seen.has(key)) problems.push(`kontrast: bayat kayıt (kusur düzelmiş, kaydı sil): ${key}`);
  return problems;
}

/** Ham süre sayacı: artış yasak, azalış kayda yansıtılmalı (ratchet). */
export function validateRawDurations(counts, baseline) {
  const problems = [];
  for (const [file, count] of Object.entries(counts)) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed)
      problems.push(
        `hareket: ${file} ham süre ${count} (kayıt ${allowed}); süreyi var(--vol-motion-*) ile ver.`,
      );
    else if (count < allowed)
      problems.push(
        `hareket: ${file} ham süre ${count} < kayıt ${allowed}; kaydı ${count}'e indir.`,
      );
  }
  for (const file of Object.keys(baseline))
    if (!(file in counts)) problems.push(`hareket: kayıtlı dosya yok ya da ham süresiz: ${file}`);
  return problems;
}

/** Depo düzeyi kapı. Eksik girdi açık ihlaldir (sessizce yeşile dönmez). */
export function validateRepoUiTheme(root) {
  const read = (path) =>
    existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : null;
  const sources = {
    colors: ['core/src/ui/colors.ts', 'VOL_COLORS'],
    semantic: ['core/src/ui/themes/semanticColors.ts', 'VOL_SEMANTIC_COLORS'],
    ember: ['core/src/ui/themes/ember.ts', 'VOL_EMBER_OVERRIDES'],
  };
  const values = {};
  for (const [name, [path, exportName]] of Object.entries(sources)) {
    const text = read(path);
    if (text === null) return [`UI tema: ${path} eksik.`];
    values[name] = readExportedConstant(path, text, exportName);
  }
  const presetsText = read('core/src/ui/motion/presets.ts');
  const css = read(THEME_CSS);
  const known = read(KNOWN_PATH);
  const todo = read('docs/ui/TODO.md');
  if (presetsText === null || css === null || known === null || todo === null)
    return ['UI tema: presets.ts, theme.css, uiThemeKnown.json ya da TODO eksik.'];
  const preset = (name) => readExportedConstant('core/src/ui/motion/presets.ts', presetsText, name);
  const motion = {
    durations: preset('MOTION_DURATIONS'),
    easings: preset('MOTION_EASINGS'),
    presets: preset('MOTION_PRESETS'),
    interaction: preset('MOTION_INTERACTION'),
    loadingMinVisibleMs: preset('LOADING_MIN_VISIBLE_MS'),
  };
  const source = {
    colors: values.colors,
    semantic: values.semantic,
    themes: { ember: values.ember },
    motion,
  };

  const problems = [...validateThemeSource(source), ...validateMotion(motion)];
  if (problems.length > 0) return problems.map((problem) => `UI tema: ${problem}`);

  // 1. Üretilen bölgeler ve varlıklar kaynaktan sapmamış.
  if (applyGenerated(css, source) !== css)
    problems.push('UI tema: theme.css kaynaktan sapmış; `pnpm gen:theme` çalıştır.');
  const base = { ...values.colors, ...values.semantic };
  const assets = buildUiAssets({ tokens: { default: base, ember: { ...base, ...values.ember } } });
  const assetRoot = resolve(root, ASSET_DIR);
  for (const [path, content] of assets) {
    const file = join(assetRoot, path);
    if (!existsSync(file))
      problems.push(`UI varlık: eksik ${path}; \`pnpm gen:ui-assets\` çalıştır.`);
    else if (readFileSync(file, 'utf8') !== content)
      problems.push(`UI varlık: ${path} üreticiden sapmış.`);
  }
  for (const file of walk(assetRoot, /./)) {
    const path = relative(assetRoot, file).split(sep).join('/');
    if (!assets.has(path)) problems.push(`UI varlık: fazla dosya ${path}.`);
  }

  // 2. Kontrast.
  const records = JSON.parse(known);
  const themes = { default: base, ember: { ...base, ...values.ember } };
  problems.push(
    ...validateContrastKnown(records.contrast ?? [], contrastFailures(themes), openTasks(todo)),
  );

  // 3. Ham hareket süresi.
  const counts = {};
  for (const file of walk(resolve(root, CSS_ROOT), /\.css$/)) {
    const count = rawDurationCount(readFileSync(file, 'utf8'));
    if (count > 0) counts[relative(root, file).split(sep).join('/')] = count;
  }
  problems.push(...validateRawDurations(counts, records.rawDurations ?? {}));
  return problems;
}
