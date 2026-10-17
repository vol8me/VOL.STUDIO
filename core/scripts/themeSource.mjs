/**
 * Tema kaynağı → `theme.css` üretiminin SAF çekirdeği. Dosya sistemine dokunmaz;
 * `gen-theme.mjs` yükler, burası doğrular ve üretir, testler aynı işlevleri
 * çağırır. Ayrıştırma regex'le kaynak metin okumak değil, gerçek nesne
 * değerleri üzerindendir (yapısal ve deterministik).
 */

export const TOKENS_BEGIN = '/* @generated:tokens:begin */';
export const TOKENS_END = '/* @generated:tokens:end */';
export const THEMES_BEGIN = '/* @generated:themes:begin */';
export const THEMES_END = '/* @generated:themes:end */';
export const MOTION_BEGIN = '/* @generated:motion:begin */';
export const MOTION_END = '/* @generated:motion:end */';

const COLOR_VALUE = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/;
const THEME_ID = /^[a-z][a-z0-9-]*$/;

/** `uiSurface1` → `surface-1`, `plateTopLight` → `plate-top-light`. */
export function kebab(name) {
  return name
    .replace(/^ui(?=[A-Z])/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
}

/**
 * Varsayılan token listesi: önce genel renkler, sonra anlamsal roller; her grup
 * kaynaktaki sırayla (deterministik). Her kayıt `{ key, cssVar, value }`.
 * @param {Record<string, string>} colors
 * @param {Record<string, string>} semantic
 */
export function defaultTokens(colors, semantic) {
  return [...Object.entries(colors), ...Object.entries(semantic)].map(([key, value]) => ({
    key,
    cssVar: `--vol-ui-${kebab(key)}`,
    value,
  }));
}

/**
 * Kaynak sapmaları: biçim, çift ad, kebab çakışması, bilinmeyen/eksik token.
 * @param {{ colors: Record<string,string>, semantic: Record<string,string>, themes: Record<string, Record<string,string>> }} source
 * @returns {string[]}
 */
export function validateThemeSource({ colors, semantic, themes }) {
  const problems = [];
  const tokens = defaultTokens(colors, semantic);
  if (tokens.length === 0) problems.push('hiç renk tokenı yok');

  const keys = new Set();
  const vars = new Map();
  for (const { key, cssVar, value } of tokens) {
    if (keys.has(key)) problems.push(`yinelenen token anahtarı: ${key} (genel ve anlamsal kümede)`);
    keys.add(key);
    const owner = vars.get(cssVar);
    if (owner !== undefined && owner !== key)
      problems.push(`CSS değişkeni çakışıyor: ${cssVar} ← ${owner} ve ${key}`);
    vars.set(cssVar, key);
    if (!COLOR_VALUE.test(value))
      problems.push(`${key}: değer #rrggbb ya da #rrggbbaa (küçük harf) olmalı: ${value}`);
  }

  for (const [id, overrides] of Object.entries(themes)) {
    if (!THEME_ID.test(id)) problems.push(`tema kimliği geçersiz: ${id}`);
    const names = Object.keys(overrides);
    if (names.length === 0) problems.push(`${id}: tema hiçbir token geçersiz kılmıyor`);
    for (const name of names) {
      if (!keys.has(name)) problems.push(`${id}: desteklenmeyen token: ${name}`);
      else if (!COLOR_VALUE.test(overrides[name]))
        problems.push(`${id}.${name}: değer #rrggbb ya da #rrggbbaa (küçük harf) olmalı`);
    }
  }
  return problems;
}

/** Varsayılan `:root` token satırları (iki boşluk girintili). */
export function renderTokens(colors, semantic) {
  return defaultTokens(colors, semantic)
    .map(({ cssVar, value }) => `  ${cssVar}: ${value};`)
    .join('\n');
}

/**
 * Tema blokları. `default` bloğu (tüm varsayılan değerler) kapsamlı önizleme için
 * vardır: aurum bir kökün içindeki varsayılan önizleme, tokenları varsayılana
 * geri alabilmelidir. Her seçici `:root[...]` ve yalın `[...]` biçimini birlikte
 * taşır: kökte `:root` varsayılanını özgüllükle yener, alt ağaçta kapsamlı çalışır.
 * Satır sırası geçersiz kılma anahtarı sırasından değil varsayılan token sırasındandır.
 */
export function renderThemes(colors, semantic, themes) {
  const order = defaultTokens(colors, semantic);
  const block = (id, picked) => {
    const selector = [`:root[data-vol-theme='${id}']`, `[data-vol-theme='${id}']`].join(',\n');
    const lines = picked.map(({ cssVar, value }) => `  ${cssVar}: ${value};`);
    return [`${selector} {`, ...lines, '}'].join('\n');
  };
  const blocks = [block('default', order)];
  for (const [id, overrides] of Object.entries(themes)) {
    blocks.push(
      block(
        id,
        order
          .filter(({ key }) => key in overrides)
          .map(({ cssVar, key }) => ({ cssVar, value: overrides[key] })),
      ),
    );
  }
  return blocks.join('\n\n');
}

const PRESET_KEY = /^[a-z][A-Za-z0-9]*$/;

/**
 * Hareket tokenları (`motion/presets.ts`) → `--vol-motion-*` CSS değişkenleri.
 * Bütçe sınırları CSS'e girmez; yalnız süre, eğri, ölçek ve preset değerleri.
 * @param {{ durations: Record<string,number>, easings: Record<string,string>, presets: Record<string, {ms:number,easing:string,offsetPx?:number}>, interaction: Record<string,number>, loadingMinVisibleMs: number }} motion
 */
export function validateMotion(motion) {
  const problems = [];
  const positive = (label, value) => {
    if (!Number.isInteger(value) || value <= 0)
      problems.push(`hareket: ${label} pozitif tam sayı (ms) olmalı: ${value}`);
  };
  for (const [name, ms] of Object.entries(motion.durations)) positive(`süre ${name}`, ms);
  for (const [name, curve] of Object.entries(motion.easings))
    if (!/^cubic-bezier\(\s*[0-9.]+,\s*[0-9.]+,\s*[0-9.]+,\s*[0-9.]+\s*\)$/.test(curve))
      problems.push(`hareket: eğri ${name} cubic-bezier(a, b, c, d) olmalı: ${curve}`);
  for (const [name, preset] of Object.entries(motion.presets)) {
    if (!PRESET_KEY.test(name)) problems.push(`hareket: preset adı camelCase olmalı: ${name}`);
    positive(`preset ${name}`, preset.ms);
    if (!(preset.easing in motion.easings))
      problems.push(`hareket: preset ${name} bilinmeyen eğri kullanıyor: ${preset.easing}`);
    if (preset.offsetPx !== undefined && !Number.isInteger(preset.offsetPx))
      problems.push(`hareket: preset ${name} offsetPx tam sayı olmalı`);
  }
  for (const [name, scale] of Object.entries(motion.interaction))
    if (!(typeof scale === 'number' && scale > 0 && scale < 2))
      problems.push(`hareket: ölçek ${name} 0 ile 2 arasında olmalı: ${scale}`);
  positive('loading asgari süre', motion.loadingMinVisibleMs);
  for (const [name, value] of Object.entries(motion.juice ?? {})) {
    if (!PRESET_KEY.test(name)) problems.push(`hareket: juice adı camelCase olmalı: ${name}`);
    if (!(typeof value === 'number' && value > 0 && Number.isFinite(value)))
      problems.push(`hareket: juice ${name} pozitif sayı olmalı: ${value}`);
    if (/(Ms|Px)$/.test(name) && !Number.isInteger(value))
      problems.push(`hareket: juice ${name} tam sayı olmalı`);
  }
  return problems;
}

/** `scrimIn` → `scrim-in` (kebab, `ui` öneki yok). */
function presetCss(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function renderMotion(motion) {
  const lines = [];
  for (const [name, ms] of Object.entries(motion.durations))
    lines.push(`  --vol-motion-duration-${presetCss(name)}: ${ms}ms;`);
  for (const [name, curve] of Object.entries(motion.easings))
    lines.push(`  --vol-motion-ease-${presetCss(name)}: ${curve};`);
  for (const [name, preset] of Object.entries(motion.presets)) {
    lines.push(`  --vol-motion-preset-${presetCss(name)}: ${preset.ms}ms;`);
    if (preset.offsetPx !== undefined)
      lines.push(`  --vol-motion-preset-${presetCss(name)}-offset: ${preset.offsetPx}px;`);
  }
  for (const [name, scale] of Object.entries(motion.interaction))
    lines.push(`  --vol-motion-${presetCss(name)}: ${scale};`);
  lines.push(`  --vol-motion-loading-min-visible: ${motion.loadingMinVisibleMs}ms;`);
  for (const [name, value] of Object.entries(motion.juice ?? {})) {
    const unit = name.endsWith('Ms') ? 'ms' : name.endsWith('Px') ? 'px' : '';
    const stem = name.replace(/(Ms|Px)$/, '');
    lines.push(`  --vol-motion-juice-${presetCss(stem)}: ${value}${unit};`);
  }
  return lines.join('\n');
}

function replaceRegion(css, begin, end, body, indent) {
  const start = css.indexOf(begin);
  const stop = css.indexOf(end);
  if (start === -1 || stop === -1 || stop < start)
    throw new Error(`theme.css'te ${begin} ... ${end} işaretleri yok ya da ters`);
  return `${css.slice(0, start + begin.length)}\n${body}\n${indent}${css.slice(stop)}`;
}

/**
 * Üretilen bölgeleri `css` içinde yeniden yazar; elle yazılan kısımlara dokunmaz.
 * Aynı kaynakla tekrar çalıştırmak çıktıyı değiştirmez (idempotent).
 */
export function applyGenerated(css, { colors, semantic, themes, motion }) {
  let next = replaceRegion(css, TOKENS_BEGIN, TOKENS_END, renderTokens(colors, semantic), '  ');
  if (motion) next = replaceRegion(next, MOTION_BEGIN, MOTION_END, renderMotion(motion), '  ');
  next = replaceRegion(next, THEMES_BEGIN, THEMES_END, renderThemes(colors, semantic, themes), '');
  return next;
}

/** `region` işaretleri arasındaki metin (işaretler hariç, kenar boşlukları kırpılmış). */
export function extractRegion(css, begin, end) {
  const start = css.indexOf(begin);
  const stop = css.indexOf(end);
  if (start === -1 || stop === -1 || stop < start) return null;
  return css.slice(start + begin.length, stop).trim();
}
