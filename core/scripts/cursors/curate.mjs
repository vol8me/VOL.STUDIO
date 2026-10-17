#!/usr/bin/env node
/**
 * İmleç kürasyonu: Kenney Cursor Pack (oyun imleçleri) ve Crosshair Pack (nişangâhlar) paketlerinden
 * seçilen vektörler, tek bir kayıt dosyasına (`core/public/assets/cursors/cursors.json`) yazılır.
 *
 *   node core/scripts/cursors/curate.mjs --cursor-pack <dizin> --crosshair-pack <dizin> [--check]
 *
 * Kaynak: https://kenney.nl/assets/cursor-pack ve https://kenney.nl/assets/crosshair-pack (CC0).
 * Paketler depoda DEĞİL, yerelde indirilir; seçim `cursors.curation.json`dadır. İmleç iki katmandır
 * (siyah dış çizgi + gövde): gövde rengi çalışma zamanında verilir (bağlama göre dost/düşman renk,
 * skin vurgusu). Etkin nokta (hotspot) yoldan çıkarılır: ok uçları sol-üst, el parmak ucu üst,
 * diğerleri merkez.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { pathPoints, roundPath } from '../svgPath.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const OUT = join(root, 'public/assets/cursors');
const NAMES_TS = join(root, 'src/ui/cursors/cursorNames.ts');
export const CURSOR_SIZE = 32;
export const RETICLE_SIZE = 64;

/** `<path>` öğelerinin yol verileri; dolgu rengi atılır (çalışma zamanında verilir). */
export function pathsOf(svg, label) {
  if (/<g[^>]*transform=|transform=/.test(svg)) throw new Error(`${label}: dönüşüm desteklenmiyor`);
  const paths = [...svg.matchAll(/<path\b[^>]*?\bd="([^"]+)"[^>]*\/>/g)].map((match) => match[1]);
  if (paths.length === 0) throw new Error(`${label}: yol yok`);
  return paths.map((d) => roundPath(d));
}

/** Etkin nokta türü (ya da açık [x, y]) → [x, y] (CURSOR_SIZE ızgarasında, 1 ondalık). */
export function hotspotOf(kind, outlinePaths, label) {
  if (Array.isArray(kind)) return kind;
  if (kind === 'center') return [CURSOR_SIZE / 2, CURSOR_SIZE / 2];
  const points = outlinePaths.flatMap((d) => pathPoints(d));
  if (points.length === 0) throw new Error(`${label}: nokta yok`);
  if (kind === 'tipTL') {
    const tip = points.reduce((best, point) =>
      point[0] + point[1] < best[0] + best[1] ? point : best,
    );
    return [Math.round(tip[0]), Math.round(tip[1])];
  }
  if (kind === 'top') {
    const top = points.reduce((best, point) => (point[1] < best[1] ? point : best));
    const row = points.filter((point) => Math.abs(point[1] - top[1]) < 1.5);
    const x = row.reduce((sum, point) => sum + point[0], 0) / row.length;
    return [Math.round(x), Math.round(top[1])];
  }
  throw new Error(`${label}: bilinmeyen etkin nokta türü ${kind}`);
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {{ curation: {cursors:{id:string,set:string,source:string,hotspot:string}[], reticles:{id:string,source:string}[]}, readCursor: (variant:'Basic'|'Outline', name:string)=>string, readReticle: (name:string)=>string }} input
 */
export function buildCursors({ curation, readCursor, readReticle }) {
  const seen = new Set();
  const cursors = {};
  for (const entry of curation.cursors) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(entry.id))
      throw new Error(`imleç kimliği camelCase değil: ${entry.id}`);
    if (seen.has(entry.id)) throw new Error(`yinelenen imleç kimliği: ${entry.id}`);
    seen.add(entry.id);
    const outline = pathsOf(readCursor('Outline', entry.source), `${entry.id}/çizgi`);
    const body = pathsOf(readCursor('Basic', entry.source), `${entry.id}/gövde`);
    cursors[entry.id] = {
      set: entry.set,
      hotspot: hotspotOf(entry.hotspot, outline, entry.id),
      outline,
      body,
      source: `kenney/cursor-pack/${entry.source}`,
    };
  }
  const reticles = {};
  for (const entry of curation.reticles) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(entry.id))
      throw new Error(`nişangâh kimliği camelCase değil: ${entry.id}`);
    if (seen.has(entry.id)) throw new Error(`yinelenen kimlik: ${entry.id}`);
    seen.add(entry.id);
    reticles[entry.id] = {
      paths: pathsOf(readReticle(entry.source), entry.id),
      source: `kenney/crosshair-pack/${entry.source}`,
    };
  }
  const data = {
    schema: 'VolCursorsV1',
    note: 'Üretilmiştir (core/scripts/cursors/curate.mjs); elle düzenlenmez.',
    license: 'CC0 1.0 (Kenney)',
    cursorSize: CURSOR_SIZE,
    reticleSize: RETICLE_SIZE,
    cursors,
    reticles,
  };
  const sources = [
    '# İmleç varlıkları — kaynak kaydı',
    '',
    'Bu dizindeki dosya **üretilir**; elle düzenlenmez. Üretici: `core/scripts/cursors/curate.mjs`;',
    'seçim: `core/scripts/cursors/cursors.curation.json`.',
    '',
    '- İmleçler: [Kenney Cursor Pack 1.1](https://kenney.nl/assets/cursor-pack), CC0 1.0 (vektör, 32×32,',
    '  dış çizgi + gövde katmanı).',
    '- Nişangâhlar: [Kenney Crosshair Pack](https://kenney.nl/assets/crosshair-pack), CC0 1.0 (vektör, 64×64).',
    `- Seçim: ${Object.keys(cursors).length} imleç (ui, rts) ve ${Object.keys(reticles).length} nişangâh. Atıf istenmez; kaynak burada kayıtlıdır.`,
    '',
  ].join('\n');

  const bySet = (set) =>
    Object.entries(cursors)
      .filter(([, value]) => value.set === set)
      .map(([id]) => id);
  const list = (name, ids) =>
    `export const ${name} = [${ids.map((id) => `'${id}'`).join(', ')}] as const;`;
  const ts = [
    '// Üretilmiştir: core/scripts/cursors/curate.mjs. Elle düzenlenmez.',
    '',
    list('UI_CURSORS', bySet('ui')),
    list('RTS_CURSORS', bySet('rts')),
    list('RETICLES', Object.keys(reticles).sort(compare)),
    '',
    'export type UiCursorId = (typeof UI_CURSORS)[number];',
    'export type RtsCursorId = (typeof RTS_CURSORS)[number];',
    'export type CursorId = UiCursorId | RtsCursorId;',
    'export type ReticleId = (typeof RETICLES)[number];',
    '',
  ].join('\n');

  return new Map([
    ['cursors.json', `${JSON.stringify(data)}\n`],
    ['SOURCES.md', sources],
    ['@names.ts', ts],
  ]);
}

async function main() {
  const argv = process.argv.slice(2);
  const option = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? resolve(argv[index + 1]) : null;
  };
  const cursorPack = option('--cursor-pack');
  const crosshairPack = option('--crosshair-pack');
  if (!cursorPack || !crosshairPack || !existsSync(cursorPack) || !existsSync(crosshairPack)) {
    console.error('Kullanım: curate.mjs --cursor-pack <dizin> --crosshair-pack <dizin> [--check]');
    process.exit(2);
  }
  const curation = JSON.parse(readFileSync(join(here, 'cursors.curation.json'), 'utf8'));
  const files = buildCursors({
    curation,
    readCursor: (variant, name) =>
      readFileSync(join(cursorPack, 'Vector', variant, `${name}.svg`), 'utf8'),
    readReticle: (name) =>
      readFileSync(join(crosshairPack, 'Vector', 'Light', `${name}.svg`), 'utf8'),
  });
  files.set(
    '@names.ts',
    await format(files.get('@names.ts'), {
      ...(await resolveConfig(NAMES_TS)),
      filepath: NAMES_TS,
    }),
  );
  const target = (name) => (name === '@names.ts' ? NAMES_TS : join(OUT, name));
  if (argv.includes('--check')) {
    const stale = [...files].filter(
      ([name, content]) =>
        !existsSync(target(name)) || readFileSync(target(name), 'utf8') !== content,
    );
    if (stale.length > 0) {
      for (const [name] of stale) console.error(`[cursors] sapma: ${name}`);
      process.exit(1);
    }
    console.log(`[cursors] ${files.size} dosya kaynakla aynı.`);
    return;
  }
  mkdirSync(OUT, { recursive: true });
  mkdirSync(dirname(NAMES_TS), { recursive: true });
  for (const [name, content] of files) writeFileSync(target(name), content);
  console.log(`[cursors] ${files.size} dosya yazıldı.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
