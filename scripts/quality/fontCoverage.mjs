import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * YAZI TİPİ KAPSAMI. Arayüz metinlerindeki her karakter, gönderilen yazı tiplerinden en az birinde
 * (başlık: Jura, gövde: Exo 2) glif olarak bulunmalıdır; aksi hâlde tarayıcı sistem yedek fontuna düşer ve
 * platforma göre farklı çizim, taban çizgisi ve satır yüksekliği kayması oluşur. Eksik karakter yerine
 * CSS/ikon kullanılır.
 */
export const FONT_FILES = ['Jura[wght].ttf', 'Exo2[wght].ttf'];
export const LOCALE_FILES = [
  'core/src/i18n/en.json',
  'core/src/i18n/tr.json',
  'devtools/vol-showcase/src/i18n/en.json',
  'devtools/vol-showcase/src/i18n/tr.json',
  'games/vol-test/src/i18n/en.json',
  'games/vol-test/src/i18n/tr.json',
];

/** TTF `cmap` tablosundaki kod noktaları (biçim 4 ve 12). */
export function glyphSet(path) {
  const buffer = readFileSync(path);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const tables = view.getUint16(4);
  let cmap = 0;
  for (let i = 0; i < tables; i += 1) {
    const at = 12 + i * 16;
    if (buffer.toString('ascii', at, at + 4) === 'cmap') cmap = view.getUint32(at + 8);
  }
  const codes = new Set();
  const subtables = view.getUint16(cmap + 2);
  for (let i = 0; i < subtables; i += 1) {
    const platform = view.getUint16(cmap + 4 + i * 8);
    const encoding = view.getUint16(cmap + 6 + i * 8);
    const offset = cmap + view.getUint32(cmap + 8 + i * 8);
    if (!((platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0)) continue;
    const format = view.getUint16(offset);
    if (format === 4) {
      const segments = view.getUint16(offset + 6) / 2;
      const ends = offset + 14;
      const starts = ends + segments * 2 + 2;
      for (let s = 0; s < segments; s += 1) {
        const end = view.getUint16(ends + s * 2);
        const start = view.getUint16(starts + s * 2);
        if (end === 0xffff) continue;
        for (let code = start; code <= end; code += 1) codes.add(code);
      }
    } else if (format === 12) {
      const groups = view.getUint32(offset + 12);
      for (let g = 0; g < groups; g += 1) {
        const start = view.getUint32(offset + 16 + g * 12);
        const end = view.getUint32(offset + 20 + g * 12);
        for (let code = start; code <= end; code += 1) codes.add(code);
      }
    }
  }
  return codes;
}

function strings(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (node && typeof node === 'object')
    for (const value of Object.values(node)) strings(value, out);
  return out;
}

/** Her yerel dosyadaki, hiçbir yazı tipinde olmayan karakterler: `{ dosya: ['→', ...] }`. */
export function missingGlyphs(root, fonts = FONT_FILES, locales = LOCALE_FILES, fontRoot = root) {
  const available = fonts.map((name) => glyphSet(join(fontRoot, 'core/public/assets/fonts', name)));
  const result = {};
  for (const file of locales) {
    const text = strings(JSON.parse(readFileSync(join(root, file), 'utf8'))).join('');
    const missing = new Set();
    for (const character of text) {
      const code = character.codePointAt(0);
      if (code === undefined || code < 32 || character === ' ') continue;
      if (!available.some((set) => set.has(code))) missing.add(character);
    }
    if (missing.size > 0) result[file] = [...missing];
  }
  return result;
}
