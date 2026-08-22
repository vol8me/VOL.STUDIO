/**
 * Görsel sentez CLI'ı — §10.1.
 *
 * Agent'ın çekirdeği editörsüz sürdüğü arayüz. Editör (Tur 4) bir tüketici
 * olacak; çekirdek onsuz da tam işlevlidir (D8).
 *
 *   tsx core/scripts/forge.ts render <doc.json> <out.png> [--size 256x384] [--seed 42]
 *   tsx core/scripts/forge.ts validate <doc.json>
 *
 * `--size` ve `--seed` belgeyi EZMEK içindir: aynı belgeden farklı boyut ve
 * varyant üretmenin yolu budur (D2). Koordinat sözleşmesi merkez-köken +
 * kısa kenar normalizasyonu olduğu için en-boy oranı değişse de şekiller
 * bozulmaz.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectSpriteDocIssues, renderSprite } from '../src/visual/index';
import { formatQaReport, measureSprite } from '../src/visual/qa';
import { writePng } from '../src/visual/encode/png';

const USAGE = [
  'Kullanım:',
  '  tsx core/scripts/forge.ts render <doc.json> <out.png> [--size WxH] [--seed N]',
  '  tsx core/scripts/forge.ts validate <doc.json>',
].join('\n');

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readDoc(path: string): unknown {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf-8')) as unknown;
  } catch (error) {
    fail(`Belge okunamadı: ${path}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

/** `--size 256x384` ya da `--size 256`. Kare kısayolu tek sayıdır. */
function parseSize(raw: string): [number, number] {
  const match = /^(\d+)(?:x(\d+))?$/.exec(raw);
  if (!match) fail(`--size "WxH" ya da tek sayı olmalı (gelen: ${raw})`);
  const width = Number(match[1]);
  return [width, match[2] === undefined ? width : Number(match[2])];
}

function parseFlags(args: readonly string[]): { size?: [number, number]; seed?: number } {
  const flags: { size?: [number, number]; seed?: number } = {};
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (value === undefined) fail(`${args[i]} bir değer bekliyor`);
    if (args[i] === '--size') flags.size = parseSize(value);
    else if (args[i] === '--seed') flags.seed = Number(value);
    else fail(`Bilinmeyen bayrak: ${args[i]}\n${USAGE}`);
  }
  return flags;
}

function runValidate(docPath: string): void {
  const issues = collectSpriteDocIssues(readDoc(docPath));
  if (issues.length === 0) {
    console.log(`${docPath}: geçerli`);
    return;
  }
  console.error(`${docPath}: ${issues.length} sorun`);
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}

function runRender(docPath: string, outPath: string, args: readonly string[]): void {
  const flags = parseFlags(args);
  let result;
  try {
    result = renderSprite(readDoc(docPath), flags);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  writePng(resolve(outPath), result.width, result.height, result.rgba);

  const report = measureSprite(result);
  console.log(`${outPath} yazıldı`);
  console.log(formatQaReport(report));
  if (!report.pass) process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'render': {
    const [docPath, outPath, ...flags] = rest;
    if (!docPath || !outPath) fail(USAGE);
    runRender(docPath, outPath, flags);
    break;
  }
  case 'validate': {
    const [docPath] = rest;
    if (!docPath) fail(USAGE);
    runValidate(docPath);
    break;
  }
  default:
    fail(USAGE);
}
