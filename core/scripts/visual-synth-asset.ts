/**
 * Görsel varlık CLI'ı — §10.1.
 *
 * Çekirdeği herhangi bir editör olmadan süren arayüz. Editörler bu hattın
 * tüketicisidir; çekirdek onlarsız da tam işlevlidir (D8).
 *
 *   tsx core/scripts/visual-synth-asset.ts render <doc.json> <out.png> [--size 256x384] [--seed 42]
 *   tsx core/scripts/visual-synth-asset.ts validate <doc.json>
 *   tsx core/scripts/visual-synth-asset.ts qa <out.png> --doc <doc.json> [--size 256x384] [--json]
 *
 * `--size` ve `--seed` belgeyi EZMEK içindir: aynı belgeden farklı boyut ve
 * varyant üretmenin yolu budur (D2). Koordinat sözleşmesi merkez-köken +
 * kısa kenar normalizasyonu olduğu için en-boy oranı değişse de şekiller
 * bozulmaz.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { collectSpriteDocIssues, generatePalette } from '../src/visualSynth/index';
import type { RampRequest } from '../src/visualSynth/color/generate';
import { formatQaReport } from '../src/visualSynth/qa';
import { createVisualArtifact, decodePng } from '../src/visualSynth/encode/index';

const USAGE = [
  'Kullanım:',
  '  tsx core/scripts/visual-synth-asset.ts render <doc.json> <out.png> [--size WxH] [--seed N]',
  '  tsx core/scripts/visual-synth-asset.ts validate <doc.json>',
  '  tsx core/scripts/visual-synth-asset.ts qa <out.png> --doc <doc.json> [--size WxH] [--seed N] [--json]',
  '  tsx core/scripts/visual-synth-asset.ts palette <istek.json>',
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
  let artifact;
  try {
    artifact = createVisualArtifact(readDoc(docPath), flags);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const absolute = resolve(outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, artifact.png);

  console.log(`${outPath} yazıldı`);
  console.log(formatQaReport(artifact.report));
  if (!artifact.report.pass) process.exit(1);
}

function runQa(pngPath: string, args: readonly string[]): void {
  let docPath: string | undefined;
  let json = false;
  const overrides: { size?: [number, number]; seed?: number } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') {
      json = true;
      continue;
    }
    if (args[i] === '--doc') {
      docPath = args[++i];
      if (!docPath) fail('--doc bir belge yolu bekliyor');
      continue;
    }
    // `render` ile AYNI ezmeleri kabul eder. Bir dönem etmiyordu: `render
    // --size 256` ile üretilen PNG belgeyle karşılaştırılamıyor, doğrulayıcı
    // belgeyi kendi doğal boyutunda render edip bütün pikselleri uyumsuz
    // sayıyordu. Üretimde kullanılan bayraklar doğrulamada da geçerli olmalı.
    if (args[i] === '--size') {
      const value = args[++i];
      if (value === undefined) fail('--size bir değer bekliyor');
      overrides.size = parseSize(value);
      continue;
    }
    if (args[i] === '--seed') {
      const value = args[++i];
      if (value === undefined) fail('--seed bir değer bekliyor');
      overrides.seed = Number(value);
      continue;
    }
    fail(`Bilinmeyen bayrak: ${args[i]}\n${USAGE}`);
  }
  if (!docPath) fail(`qa için --doc zorunlu\n${USAGE}`);

  let artifact;
  try {
    artifact = createVisualArtifact(readDoc(docPath), overrides);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  let decoded;
  try {
    decoded = decodePng(readFileSync(resolve(pngPath)));
  } catch (error) {
    fail(`PNG okunamadı: ${pngPath}\n${error instanceof Error ? error.message : String(error)}`);
  }

  // Boyut uyuşmazlığı "her piksel farklı" DEĞİLDİR; ayrı ve anlaşılır bir
  // sonuçtur. Ham piksel sayısı raporlamak kullanıcıya belgenin bozulduğunu
  // düşündürüyordu, oysa tek sorun eksik bir `--size` bayrağıydı.
  const dimensionMismatch =
    decoded.width !== artifact.result.width || decoded.height !== artifact.result.height;
  let pixelMismatch = 0;
  if (dimensionMismatch) {
    pixelMismatch = Math.max(
      decoded.width * decoded.height,
      artifact.result.width * artifact.result.height,
    );
  } else {
    for (let i = 0; i < artifact.result.rgba.length; i += 4) {
      if (
        decoded.rgba[i] !== artifact.result.rgba[i] ||
        decoded.rgba[i + 1] !== artifact.result.rgba[i + 1] ||
        decoded.rgba[i + 2] !== artifact.result.rgba[i + 2] ||
        decoded.rgba[i + 3] !== artifact.result.rgba[i + 3]
      ) {
        pixelMismatch++;
      }
    }
  }

  const pass = artifact.report.pass && pixelMismatch === 0;
  if (json) {
    console.log(
      JSON.stringify(
        {
          source: pngPath,
          document: docPath,
          pixelMismatch,
          ...(dimensionMismatch
            ? {
                dimensionMismatch: {
                  png: [decoded.width, decoded.height],
                  document: [artifact.result.width, artifact.result.height],
                },
              }
            : {}),
          ...artifact.report,
          pass,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `${pngPath}: ${
        pixelMismatch === 0 ? 'belgeyle piksel özdeş' : `${pixelMismatch} piksel farklı`
      }`,
    );
    console.log(formatQaReport(artifact.report));
  }
  if (!pass) process.exit(1);
}

function runPalette(requestPath: string): void {
  const raw = readDoc(requestPath);
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const palette =
    record?.palette && typeof record.palette === 'object'
      ? (record.palette as Record<string, unknown>)
      : null;
  const requests = Array.isArray(raw)
    ? raw
    : Array.isArray(record?.generate)
    ? record.generate
    : Array.isArray(palette?.generate)
    ? palette.generate
    : null;
  if (!requests) fail('Palet isteği bir dizi ya da { "generate": [...] } olmalı');

  for (const [index, request] of requests.entries()) {
    if (
      !request ||
      typeof request !== 'object' ||
      typeof (request as { base?: unknown }).base !== 'string' ||
      typeof (request as { steps?: unknown }).steps !== 'number'
    ) {
      fail(`Palet isteği [${index}] base:string ve steps:number taşımalı`);
    }
  }

  try {
    console.log(JSON.stringify(generatePalette(requests as RampRequest[]), null, 2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
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
  case 'qa': {
    const [pngPath, ...flags] = rest;
    if (!pngPath) fail(USAGE);
    runQa(pngPath, flags);
    break;
  }
  case 'palette': {
    const [requestPath] = rest;
    if (!requestPath) fail(USAGE);
    runPalette(requestPath);
    break;
  }
  default:
    fail(USAGE);
}
