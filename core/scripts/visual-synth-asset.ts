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
import {
  collectSpriteDocIssues,
  generatePalette,
  getVisualSynthCapabilities,
  measureSprite,
  renderSprite,
} from '../src/visualSynth/index';
import type { RampRequest } from '../src/visualSynth/color/generate';
import { formatQaReport } from '../src/visualSynth/qa';
import { createVisualArtifact, decodePng } from '../src/visualSynth/encode/index';

const USAGE = [
  'Kullanım:',
  '  tsx core/scripts/visual-synth-asset.ts render <doc.json> <out.png> [--size WxH] [--seed N]',
  '  tsx core/scripts/visual-synth-asset.ts validate <doc.json>',
  '  tsx core/scripts/visual-synth-asset.ts qa <out.png> --doc <doc.json> [--size WxH] [--seed N] [--json]',
  '  tsx core/scripts/visual-synth-asset.ts palette <istek.json>',
  '  tsx core/scripts/visual-synth-asset.ts capabilities [--json]',
  '  tsx core/scripts/visual-synth-asset.ts benchmark <doc.json> [--sizes 32,64,128] [--iterations N] [--json]',
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

function runCapabilities(args: readonly string[]): void {
  if (args.some((arg) => arg !== '--json')) fail(`Bilinmeyen bayrak: ${args[0]}\n${USAGE}`);
  const capabilities = getVisualSynthCapabilities();
  if (args.includes('--json')) {
    console.log(JSON.stringify(capabilities, null, 2));
    return;
  }
  console.log(`VisualSynth schema ${capabilities.schemaVersion}`);
  console.log(`Alan düğümü: ${capabilities.fieldKinds.length}`);
  for (const [category, kinds] of Object.entries(capabilities.kindsByCategory)) {
    console.log(`  ${category}: ${kinds.join(', ')}`);
  }
  console.log(`Gölgeleme: ${capabilities.shading.join(', ')}`);
  console.log(`Desteklenmiyor: ${capabilities.unsupported.join(', ')}`);
}

interface BenchmarkFlags {
  readonly sizes: readonly number[];
  readonly iterations: number;
  readonly json: boolean;
}

function parseBenchmarkFlags(args: readonly string[]): BenchmarkFlags {
  const sizes: number[] = [];
  let iterations = 1;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--json') {
      json = true;
      continue;
    }
    const value = args[++i];
    if (value === undefined) fail(`${flag} bir değer bekliyor`);
    if (flag === '--sizes') {
      for (const raw of value.split(',')) {
        const size = Number(raw);
        if (!Number.isInteger(size) || size < 8 || size > 2048) {
          fail(`--sizes 8..2048 aralığında tam sayılar bekler (gelen: ${raw})`);
        }
        sizes.push(size);
      }
    } else if (flag === '--iterations') {
      iterations = Number(value);
      if (!Number.isInteger(iterations) || iterations < 1 || iterations > 20) {
        fail('--iterations 1..20 aralığında tam sayı olmalı');
      }
    } else {
      fail(`Bilinmeyen bayrak: ${flag}\n${USAGE}`);
    }
  }
  return { sizes: sizes.length > 0 ? [...new Set(sizes)] : [32, 64, 128, 256], iterations, json };
}

function runBenchmark(docPath: string, args: readonly string[]): void {
  const flags = parseBenchmarkFlags(args);
  const doc = readDoc(docPath);
  const rows = flags.sizes.map((size) => {
    // JIT ve ilk palette çözümleme maliyetini ölçümden ayırmak için tek ısınma.
    renderSprite(doc, { size: [size, size] });
    let renderMs = 0;
    let qaMs = 0;
    const rssBeforeBytes = process.memoryUsage().rss;
    for (let iteration = 0; iteration < flags.iterations; iteration++) {
      const renderStart = performance.now();
      const result = renderSprite(doc, { size: [size, size] });
      renderMs += performance.now() - renderStart;

      const qaStart = performance.now();
      measureSprite(result);
      qaMs += performance.now() - qaStart;
    }
    return {
      size: [size, size],
      pixels: size * size,
      iterations: flags.iterations,
      renderMs: renderMs / flags.iterations,
      qaMs: qaMs / flags.iterations,
      rssBeforeBytes,
      rssAfterBytes: process.memoryUsage().rss,
    };
  });

  if (flags.json) {
    console.log(JSON.stringify({ document: docPath, rows }, null, 2));
    return;
  }
  console.log(`Benchmark: ${docPath}`);
  for (const row of rows) {
    console.log(
      `  ${row.size[0]}² | render ${row.renderMs.toFixed(2)} ms | ` +
        `QA ${row.qaMs.toFixed(2)} ms | RSS ${Math.round(row.rssAfterBytes / 1024 / 1024)} MB`,
    );
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
  case 'capabilities':
    runCapabilities(rest);
    break;
  case 'benchmark': {
    const [docPath, ...flags] = rest;
    if (!docPath) fail(USAGE);
    runBenchmark(docPath, flags);
    break;
  }
  default:
    fail(USAGE);
}
