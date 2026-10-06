#!/usr/bin/env node
/**
 * İkon kürasyonu: game-icons.net arşivinden seçilmiş oyun ikonları + özgün kabuk ikonları,
 * iki sprite ve kayıt olarak `core/public/assets/icons/` altına yazılır.
 *
 *   node core/scripts/icons/curate.mjs --source <game-icons depo kökü> [--check]
 *
 * Kaynak: https://github.com/game-icons/icons (Creative Commons BY 3.0; iki yazar CC0).
 * Arşiv depoda DEĞİL, yerelde indirilir; seçim `game-icons.curation.json`dadır, çıktı
 * deterministiktir. `--check` yazmadan, mevcut çıktının üretilenle aynı olduğunu bildirir.
 * Her ikon `currentColor` ile boyanır; siyah arka plan dikdörtgeni atılır, sayılar 1
 * ondalığa yuvarlanır. Atıf (yazar adı) `CREDITS.md` ve manifestte tutulur.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { roundPath } from '../svgPath.mjs';
import { CHROME_ICONS, CHROME_STROKE } from './chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const OUT = join(root, 'public/assets/icons');
const NAMES_TS = join(root, 'src/ui/icons/iconNames.ts');
export const SPRITE_PREFIX = 'vol-icon-';

/** Klasör adı → görünen yazar ve lisans (arşivin `license.txt` kaydından). */
const CC0_AUTHORS = new Set(['viscious-speed', 'zeromancer']);
const DISPLAY = {
  lorc: 'Lorc',
  delapouite: 'Delapouite',
  'john-colburn': 'John Colburn',
  felbrigg: 'Felbrigg',
  'john-redman': 'John Redman',
  'carl-olsen': 'Carl Olsen',
  sbed: 'Sbed',
  priorblue: 'PriorBlue',
  willdabeast: 'Willdabeast',
  'viscious-speed': 'Viscious Speed',
  'lord-berandas': 'Lord Berandas',
  irongamer: 'Irongamer',
  'heavenly-dog': 'HeavenlyDog',
  lucasms: 'Lucas',
  faithtoken: 'Faithtoken',
  skoll: 'Skoll',
  'andy-meneely': 'Andy Meneely',
  andymeneely: 'Andy Meneely',
  cathelineau: 'Cathelineau',
  'kier-heyl': 'Kier Heyl',
  aussiesim: 'Aussiesim',
  sparker: 'Sparker',
  zeromancer: 'Zeromancer',
  rihlsul: 'Rihlsul',
  quoting: 'Quoting',
  guard13007: 'Guard13007',
  darkzaitzev: 'DarkZaitzev',
  spencerdub: 'SpencerDub',
  generalace135: 'GeneralAce135',
  zajkonur: 'Zajkonur',
  catsu: 'Catsu',
  starseeker: 'Starseeker',
  'pepijn-poolman': 'Pepijn Poolman',
  'pierre-leducq': 'Pierre Leducq',
  'caro-asercion': 'Caro Asercion',
  seregacthtuf: 'SeregaCthtuf',
};

export { roundPath };

export function authorOf(folder) {
  return {
    folder,
    name: DISPLAY[folder] ?? folder,
    license: CC0_AUTHORS.has(folder) ? 'CC0 1.0' : 'CC BY 3.0',
  };
}

/** game-icons SVG'sinden gerçek şekil yollarını çıkarır; siyah zemin atılır. */
export function parseGameIcon(svg, label = 'ikon') {
  if (/<g[\s>]/.test(svg) || /transform=/.test(svg))
    throw new Error(`${label}: grup/dönüşüm içeren ikon desteklenmiyor`);
  const paths = [...svg.matchAll(/<path\b([^>]*?)\/>/g)].map((match) => match[1]);
  const shapes = [];
  for (const attributes of paths) {
    const d = /\bd="([^"]+)"/.exec(attributes)?.[1];
    if (!d) throw new Error(`${label}: yolsuz path`);
    if (d.replace(/\s+/g, '') === 'M0 0h512v512H0z'.replace(/\s+/g, '')) continue;
    const fill = /\bfill="([^"]+)"/.exec(attributes)?.[1];
    if (fill !== undefined && fill.toLowerCase() !== '#fff')
      throw new Error(`${label}: beyaz olmayan dolgu (${fill})`);
    if (/opacity=|stroke=/.test(attributes)) throw new Error(`${label}: saydamlık/çizgi var`);
    shapes.push(roundPath(d));
  }
  if (shapes.length === 0) throw new Error(`${label}: şekil yok`);
  return shapes;
}

function gameSymbol(id, shapes) {
  const body = shapes.map((d) => `<path d="${d}"/>`).join('');
  return `<symbol id="${SPRITE_PREFIX}${id}" viewBox="0 0 512 512">${body}</symbol>`;
}

function chromeSymbol(id, body) {
  return (
    `<symbol id="${SPRITE_PREFIX}${id}" viewBox="0 0 512 512" fill="none" stroke="currentColor" ` +
    `stroke-width="${CHROME_STROKE}" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`
  );
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
  const gameSymbols = [];
  const icons = [];
  const authors = new Map();
  for (const entry of [...curation].sort((a, b) => compare(a.id, b.id))) {
    if (seen.has(entry.id)) throw new Error(`yinelenen ikon kimliği: ${entry.id}`);
    if (!/^[a-z][a-zA-Z0-9]*$/.test(entry.id))
      throw new Error(`ikon kimliği camelCase değil: ${entry.id}`);
    seen.add(entry.id);
    const folder = entry.source.split('/')[0];
    const author = authorOf(folder);
    authors.set(folder, author);
    gameSymbols.push(gameSymbol(entry.id, parseGameIcon(readSource(entry.source), entry.id)));
    icons.push({
      id: entry.id,
      sprite: 'game',
      category: entry.category,
      author: author.name,
      license: author.license,
      source: `game-icons.net/${entry.source}`,
    });
  }
  const chromeSymbols = [];
  for (const [id, body] of Object.entries(CHROME_ICONS)) {
    if (seen.has(id)) throw new Error(`kabuk ikonu oyun ikonuyla çakışıyor: ${id}`);
    seen.add(id);
    chromeSymbols.push(chromeSymbol(id, Array.isArray(body) ? body.join('') : body));
    icons.push({
      id,
      sprite: 'chrome',
      category: 'chrome',
      author: 'VOL.STUDIO',
      license: 'proje',
    });
  }
  const game = sprite(gameSymbols);
  const chrome = sprite(chromeSymbols);
  const manifest = {
    schema: 'VolIconsV1',
    note: 'Üretilmiştir (core/scripts/icons/curate.mjs); elle düzenlenmez.',
    prefix: SPRITE_PREFIX,
    grid: 512,
    sprites: {
      chrome: {
        file: 'chrome.svg',
        count: chromeSymbols.length,
        bytes: chrome.length,
        sha256: sha(chrome),
      },
      game: { file: 'game.svg', count: gameSymbols.length, bytes: game.length, sha256: sha(game) },
    },
    icons,
  };
  const credits = [
    '# İkon atıfları',
    '',
    'Oyun ikonları [game-icons.net](https://game-icons.net) kaynağındandır ve aşağıdaki yazarlara aittir.',
    'Lisans: Creative Commons BY 3.0 (belirtilen iki yazar CC0). "Icons made by {yazar}".',
    'Kabuk ikonları (yön, kapat, onay vb.) bu projeye aittir.',
    '',
    '| Yazar | Lisans | İkon |',
    '| ----- | ------ | ---- |',
    ...[...authors.values()]
      .sort((a, b) => compare(a.name, b.name))
      .map((author) => {
        const mine = icons.filter((icon) => icon.author === author.name).map((icon) => icon.id);
        return `| ${author.name} | ${author.license} | ${mine.join(', ')} |`;
      }),
    '',
  ].join('\n');
  const sources = [
    '# İkon varlıkları — kaynak kaydı',
    '',
    'Bu dizindeki dosyalar **üretilir**; elle düzenlenmez. Üretici: `core/scripts/icons/curate.mjs`;',
    'seçim: `core/scripts/icons/game-icons.curation.json`; kabuk ikonları: `core/scripts/icons/chrome.mjs`.',
    '',
    '- Oyun ikonları: [game-icons.net](https://game-icons.net) (depo: github.com/game-icons/icons), CC BY 3.0',
    '  (iki yazar CC0). Atıf: `CREDITS.md`, `manifest.json` ve uygulama içi krediler.',
    '- Kabuk ikonları: özgün (yön, kapat, onay, uyarı vb.).',
    `- Sprite: \`chrome.svg\` (${chromeSymbols.length} ikon) ve \`game.svg\` (${gameSymbols.length} ikon); simge kimliği \`${SPRITE_PREFIX}<ad>\`.`,
    '- Boya: hepsi `currentColor`; oyun ikonları dolu siluet, kabuk ikonları kalın yuvarlak çizgi.',
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
    console.error('Kullanım: curate.mjs --source <game-icons depo kökü> [--check]');
    process.exit(2);
  }
  const curation = JSON.parse(readFileSync(join(here, 'game-icons.curation.json'), 'utf8'));
  const files = buildIcons({
    curation,
    readSource: (entry) => readFileSync(join(source, `${entry}.svg`), 'utf8'),
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
