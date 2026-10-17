#!/usr/bin/env node
/**
 * İkon kürasyonu: Phosphor Fill setinden seçilmiş dolu, minimal ikonlar + aynı dilde çizilmiş
 * özgün oyun ikonları; iki sprite ve kayıt olarak `core/public/assets/icons/` altına yazılır.
 *
 *   node core/scripts/icons/curate.mjs --source <@phosphor-icons/core paket kökü> [--check]
 *
 * Kaynak: https://github.com/phosphor-icons/core (MIT). Paket depoda DEĞİL, yerelde indirilir
 * (`npm pack @phosphor-icons/core`); seçim `icons.curation.json`dadır, çıktı deterministiktir.
 * `--check` yazmadan, mevcut çıktının üretilenle aynı olduğunu bildirir. Her ikon 256
 * ızgarasında ve `currentColor` ile boyanır; özgün ikonlar `authored.mjs`dedir.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { roundPath } from '../svgPath.mjs';
import { AUTHORED_ICONS } from './authored.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const OUT = join(root, 'public/assets/icons');
const NAMES_TS = join(root, 'src/ui/icons/iconNames.ts');
export const SPRITE_PREFIX = 'vol-icon-';
export const ICON_GRID = 256;
const PHOSPHOR_VERSION = '2.1.1';

export { roundPath };

/** Phosphor SVG'sinden şekil yollarını çıkarır; yalnız dolu yol kabul edilir. */
export function parsePhosphorIcon(svg, label = 'ikon') {
  if (!svg.includes('viewBox="0 0 256 256"')) throw new Error(`${label}: 256 ızgarası değil`);
  if (/<(g|rect|circle|ellipse|polygon|polyline|line|mask|clipPath)[\s>]/.test(svg))
    throw new Error(`${label}: yalnız path içeren ikon desteklenir`);
  if (/transform=|opacity=|stroke=/.test(svg))
    throw new Error(`${label}: dönüşüm/saydamlık/çizgi var`);
  const shapes = [...svg.matchAll(/<path\b[^>]*?\bd="([^"]+)"[^>]*\/>/g)].map((match) => match[1]);
  if (shapes.length === 0) throw new Error(`${label}: şekil yok`);
  return shapes;
}

function symbol(id, body) {
  return `<symbol id="${SPRITE_PREFIX}${id}" viewBox="0 0 ${ICON_GRID} ${ICON_GRID}" fill="currentColor">${body}</symbol>`;
}

function sprite(symbols) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" ' +
    `aria-hidden="true" focusable="false">${symbols.join('')}</svg>\n`
  );
}

/** Kod birimi karşılaştırması: yerel ayardan bağımsız, deterministik sıra. */
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const sha = (text) => createHash('sha256').update(text).digest('hex');

/**
 * @param {{ curation: {id:string,category:string,source:string}[], readSource: (source:string)=>string }} input
 * @returns {Map<string,string>} yol (OUT'a göreli) → içerik
 */
export function buildIcons({ curation, readSource }) {
  const seen = new Set();
  const sprites = { chrome: [], game: [] };
  const icons = [];
  for (const entry of [...curation].sort((a, b) => compare(a.id, b.id))) {
    if (seen.has(entry.id)) throw new Error(`yinelenen ikon kimliği: ${entry.id}`);
    if (!/^[a-z][a-zA-Z0-9]*$/.test(entry.id))
      throw new Error(`ikon kimliği camelCase değil: ${entry.id}`);
    seen.add(entry.id);
    let body;
    let author;
    let license;
    let source;
    if (entry.source === 'authored') {
      body = AUTHORED_ICONS[entry.id];
      if (!body) throw new Error(`özgün ikon çizimi yok: ${entry.id}`);
      author = 'VOL.STUDIO';
      license = 'proje';
      source = 'authored';
    } else if (entry.source.startsWith('phosphor/')) {
      body = parsePhosphorIcon(readSource(entry.source), entry.id)
        .map((d) => `<path d="${d}"/>`)
        .join('');
      author = 'Phosphor Icons';
      license = 'MIT';
      source = `phosphor-icons/core@${PHOSPHOR_VERSION}/${entry.source.slice('phosphor/'.length)}`;
    } else {
      throw new Error(`bilinmeyen kaynak: ${entry.source}`);
    }
    const kind = entry.category === 'chrome' ? 'chrome' : 'game';
    sprites[kind].push(symbol(entry.id, body));
    icons.push({ id: entry.id, sprite: kind, category: entry.category, author, license, source });
  }
  const chrome = sprite(sprites.chrome);
  const game = sprite(sprites.game);
  const manifest = {
    schema: 'VolIconsV1',
    note: 'Üretilmiştir (core/scripts/icons/curate.mjs); elle düzenlenmez.',
    prefix: SPRITE_PREFIX,
    grid: ICON_GRID,
    sprites: {
      chrome: {
        file: 'chrome.svg',
        count: sprites.chrome.length,
        bytes: chrome.length,
        sha256: sha(chrome),
      },
      game: {
        file: 'game.svg',
        count: sprites.game.length,
        bytes: game.length,
        sha256: sha(game),
      },
    },
    icons,
  };
  const phosphor = icons.filter((icon) => icon.author === 'Phosphor Icons').map((icon) => icon.id);
  const authored = icons.filter((icon) => icon.author === 'VOL.STUDIO').map((icon) => icon.id);
  const credits = [
    '# İkon atıfları',
    '',
    `İkonların çoğu [Phosphor Icons](https://phosphoricons.com) (Fill ağırlığı, sürüm ${PHOSPHOR_VERSION}) setindendir.`,
    'Telif: Copyright (c) 2023 Phosphor Icons. Lisans: MIT. Lisans metni paketle birlikte gelir:',
    'https://github.com/phosphor-icons/core/blob/main/LICENSE',
    '',
    'Phosphor setinde karşılığı olmayan oyun nesneleri bu projeye aittir (aynı ızgara ve dilde çizildi).',
    '',
    '| Kaynak | Lisans | Sayı | İkon |',
    '| ------ | ------ | ---- | ---- |',
    `| Phosphor Icons | MIT | ${phosphor.length} | ${phosphor.join(', ')} |`,
    `| VOL.STUDIO | proje | ${authored.length} | ${authored.join(', ')} |`,
    '',
  ].join('\n');
  const sources = [
    '# İkon varlıkları — kaynak kaydı',
    '',
    'Bu dizindeki dosyalar **üretilir**; elle düzenlenmez. Üretici: `core/scripts/icons/curate.mjs`;',
    'seçim: `core/scripts/icons/icons.curation.json`; özgün ikonlar: `core/scripts/icons/authored.mjs`.',
    '',
    `- Phosphor Icons Fill (sürüm ${PHOSPHOR_VERSION}, github.com/phosphor-icons/core), MIT. Atıf: \`CREDITS.md\` ve \`manifest.json\`.`,
    '- Özgün ikonlar: Phosphor setinde karşılığı olmayan RTS ve bullet hell nesneleri; aynı 256 ızgarada.',
    `- Sprite: \`chrome.svg\` (${sprites.chrome.length} ikon) ve \`game.svg\` (${sprites.game.length} ikon); simge kimliği \`${SPRITE_PREFIX}<ad>\`.`,
    '- Boya: hepsi `currentColor`; dolu, yuvarlak, minimal siluet.',
    '',
  ].join('\n');

  const names = {};
  for (const icon of icons) (names[icon.category] ??= []).push(icon.id);
  const tsLines = ['// Üretilmiştir: core/scripts/icons/curate.mjs. Elle düzenlenmez.', ''];
  for (const [category, ids] of Object.entries(names)) {
    const constant = `${category.toUpperCase()}_ICONS`;
    tsLines.push(
      `export const ${constant} = [${ids.map((id) => `'${id}'`).join(', ')}] as const;`,
      `export type ${category[0].toUpperCase()}${category.slice(1)}IconName = (typeof ${constant})[number];`,
      '',
    );
  }
  const union = Object.keys(names)
    .map((category) => `${category[0].toUpperCase()}${category.slice(1)}IconName`)
    .join(' | ');
  tsLines.push(`export type IconName = ${union};`, '');
  tsLines.push(
    'export const ICON_CATEGORIES = {',
    ...Object.entries(names).map(([category]) => `  ${category}: ${category.toUpperCase()}_ICONS,`),
    '} as const;',
    '',
  );

  return new Map([
    ['chrome.svg', chrome],
    ['game.svg', game],
    ['manifest.json', `${JSON.stringify(manifest, null, 2)}\n`],
    ['CREDITS.md', credits],
    ['SOURCES.md', sources],
    ['@names.ts', tsLines.join('\n')],
  ]);
}

async function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const sourceIndex = argv.indexOf('--source');
  const source = sourceIndex >= 0 ? resolve(argv[sourceIndex + 1]) : null;
  if (!source || !existsSync(source)) {
    console.error('Kullanım: curate.mjs --source <@phosphor-icons/core paket kökü> [--check]');
    process.exit(2);
  }
  const curation = JSON.parse(readFileSync(join(here, 'icons.curation.json'), 'utf8'));
  const files = buildIcons({
    curation,
    readSource: (entry) =>
      readFileSync(
        join(source, 'assets/fill', `${entry.slice('phosphor/'.length)}-fill.svg`),
        'utf8',
      ),
  });
  // Üretilen TypeScript deponun biçimleyicisiyle yazılır: elle biçimleme sapması `--check`i kırmasın.
  const namesPath = NAMES_TS;
  files.set(
    '@names.ts',
    await format(files.get('@names.ts'), {
      ...(await resolveConfig(namesPath)),
      filepath: namesPath,
    }),
  );
  const target = (name) => (name === '@names.ts' ? NAMES_TS : join(OUT, name));
  if (check) {
    const stale = [...files].filter(
      ([name, content]) =>
        !existsSync(target(name)) || readFileSync(target(name), 'utf8') !== content,
    );
    if (stale.length > 0) {
      for (const [name] of stale) console.error(`[icons] sapma: ${name}`);
      process.exit(1);
    }
    console.log(`[icons] ${files.size} dosya kaynakla aynı.`);
    return;
  }
  mkdirSync(OUT, { recursive: true });
  mkdirSync(dirname(NAMES_TS), { recursive: true });
  for (const [name, content] of files) writeFileSync(target(name), content);
  console.log(`[icons] ${files.size} dosya yazıldı.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
