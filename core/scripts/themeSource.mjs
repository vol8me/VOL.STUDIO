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
 * vardır: ember bir kökün içindeki varsayılan önizleme, tokenları varsayılana
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
export function applyGenerated(css, { colors, semantic, themes }) {
  let next = replaceRegion(css, TOKENS_BEGIN, TOKENS_END, renderTokens(colors, semantic), '  ');
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
