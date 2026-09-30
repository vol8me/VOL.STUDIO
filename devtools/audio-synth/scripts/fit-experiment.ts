/**
 * R6 — Ters sentez deneyi: gizli hedeflerden parametre kurtarma.
 *
 * Her hedef için gerçek parametreler bilinir ama optimize ediciye YALNIZ
 * hedef PCM'den ölçülen betimleyici vektörü (ya da manifest) verilir —
 * program parametreleri asla görünmez. Her hedef birden çok tohumla koşar;
 * kurtarma hatası parametre aralığına normalize edilir (log boyutlarda
 * oktav payı, doğrusalda aralık payı, seçeneklerde 0/1 eşleşme).
 *
 * `hidden-muted` dürüst tanımlanamazlık vakasıdır: `ghost` katmanı
 * `gainDb: -120` ile suskun olduğundan `ghost-freq` hiçbir hedef
 * betimleyicisini etkilemez; eniyileme onu rastgele bırakır.
 *
 * Çıktı: `export/audio-fits/` altında fit dizinleri + `results.json`
 * (git dışı kanıt) ve stdout'a markdown tablo — DESIGN.md'ye işlenir.
 *
 * Çalıştırma: `pnpm audio:fit-experiment` (paket kökünden).
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeAudio } from '../src/analysis/report';
import { summarizeAudio, type DescriptorSummaryV1 } from '../src/analysis/summary';
import { renderProgram } from '../src/program/render';
import { materialize, type DimensionV1, type DimensionTarget } from '../src/program/dimensions';
import type { AcousticProgramV1 } from '../src/program/schema';
import { runFit } from '../src/protocol/fit';
import { prettyCanonicalJson } from '../src/kernel/canonical';
import { FIT_MANIFEST_FIELDS, type AcousticFitSpecV1 } from '../src/search/fit';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(PKG_ROOT, '..', '..');
const FITS_ROOT = 'devtools/audio-synth/export/audio-fits';
const EVIDENCE = join(PKG_ROOT, 'export/fit-experiment/results.json');

const SEEDS = [23, 5001, 90210] as const;
const SEARCH = { candidates: 12, rounds: 5, shrink: 0.4 };
const TOLERANCE = 0.2;
/** Boyut başına kurtarma başarı eşiği (normalize birim küp payı). */
const DIM_OK = 0.15;

const ENVELOPE = {
  primitive: 'articulation.envelope',
  version: 1,
  params: { attack: 0.01, decay: 0.08, sustainLevel: 0.7, sustain: 0.15, release: 0.1 },
};

function toneBase(): Record<string, unknown> {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 1,
    durationSeconds: 0.5,
    seed: 11,
    layers: [
      {
        name: 'tone',
        source: {
          primitive: 'source.oscillator',
          version: 2,
          params: { waveform: 'sine', frequency: 440 },
        },
        articulation: ENVELOPE,
      },
    ],
    master: { normalize: 'peak', peakDbfs: -6 },
  };
}

function noiseBase(): Record<string, unknown> {
  const doc = toneBase() as { layers: { source: object }[] };
  doc.layers[0].source = {
    primitive: 'source.noise',
    version: 1,
    params: { color: 'white' },
  };
  return doc;
}

function drumBase(): Record<string, unknown> {
  const doc = toneBase() as { layers: { source: object }[] };
  doc.layers[0].source = {
    primitive: 'source.drum',
    version: 2,
    params: { model: 'kick', velocity: 0.8 },
  };
  return doc;
}

function mutedBase(): Record<string, unknown> {
  const doc = toneBase() as { layers: object[] };
  doc.layers.push({
    name: 'ghost',
    gainDb: -120,
    source: {
      primitive: 'source.oscillator',
      version: 2,
      params: { waveform: 'sawtooth', frequency: 300 },
    },
    articulation: ENVELOPE,
  });
  return doc;
}

const nodeParam = (
  name: string,
  layer: string,
  param: string,
  primitive: string,
  slot: 'source' | 'articulation' | 'resonator' | 'effect' = 'source',
) => ({
  name,
  target: { kind: 'node-param', layer, slot, primitive, param } as DimensionTarget,
});

interface HiddenTarget {
  readonly id: string;
  readonly base: Record<string, unknown>;
  readonly dimensions: readonly DimensionV1[];
  /** Gizli gerçek değerler — optimize ediciye ASLA gösterilmez. */
  readonly truth: Readonly<Record<string, number | string>>;
  /** Hedef vektörüne giren betimleyici adları. */
  readonly descriptors: readonly (keyof DescriptorSummaryV1)[];
  /** Tanımlanamaz olduğu BİLİNEN boyutlar (kanıt için raporlanır). */
  readonly unidentifiable?: readonly string[];
}

const TARGETS: readonly HiddenTarget[] = [
  {
    id: 'hidden-tone',
    base: toneBase(),
    dimensions: [
      {
        ...nodeParam('frequency', 'tone', 'frequency', 'source.oscillator'),
        range: { min: 80, max: 2000, scale: 'log', unit: 'Hz' },
      },
      {
        ...nodeParam('waveform', 'tone', 'waveform', 'source.oscillator'),
        options: ['sine', 'triangle', 'sawtooth', 'square'],
      },
      {
        ...nodeParam('attack', 'tone', 'attack', 'articulation.envelope', 'articulation'),
        range: { min: 0.001, max: 0.2, scale: 'log', unit: 's' },
      },
      {
        ...nodeParam('decay', 'tone', 'decay', 'articulation.envelope', 'articulation'),
        range: { min: 0.02, max: 0.6, scale: 'log', unit: 's' },
      },
    ],
    truth: { frequency: 660, waveform: 'sawtooth', attack: 0.015, decay: 0.18 },
    descriptors: [
      'pitchHz',
      'centroidHz',
      'spectralPeakHz',
      'attackSeconds',
      'decay40Seconds',
      'integratedLufs',
    ],
  },
  {
    id: 'hidden-noise',
    base: noiseBase(),
    dimensions: [
      {
        ...nodeParam('color', 'tone', 'color', 'source.noise'),
        options: ['white', 'pink', 'brown'],
      },
      {
        ...nodeParam('attack', 'tone', 'attack', 'articulation.envelope', 'articulation'),
        range: { min: 0.001, max: 0.2, scale: 'log', unit: 's' },
      },
      {
        ...nodeParam('decay', 'tone', 'decay', 'articulation.envelope', 'articulation'),
        range: { min: 0.02, max: 0.6, scale: 'log', unit: 's' },
      },
    ],
    truth: { color: 'pink', attack: 0.04, decay: 0.3 },
    descriptors: ['flatness', 'centroidHz', 'attackSeconds', 'decay40Seconds', 'integratedLufs'],
  },
  {
    id: 'hidden-drum',
    base: drumBase(),
    dimensions: [
      {
        ...nodeParam('tune', 'tone', 'tune', 'source.drum'),
        range: { min: -12, max: 12, scale: 'linear', unit: 'semitones' },
      },
      {
        ...nodeParam('decay', 'tone', 'decay', 'source.drum'),
        range: { min: 0.05, max: 0.95, scale: 'linear', unit: 'normalized' },
      },
      {
        ...nodeParam('noise', 'tone', 'noise', 'source.drum'),
        range: { min: 0, max: 1.5, scale: 'linear', unit: 'ratio' },
      },
    ],
    truth: { tune: -4, decay: 0.7, noise: 0.6 },
    descriptors: [
      'spectralPeakHz',
      'decay40Seconds',
      'crestFactorDb',
      'flatness',
      'integratedLufs',
    ],
  },
  {
    id: 'hidden-muted',
    base: mutedBase(),
    dimensions: [
      {
        ...nodeParam('frequency', 'tone', 'frequency', 'source.oscillator'),
        range: { min: 80, max: 2000, scale: 'log', unit: 'Hz' },
      },
      {
        ...nodeParam('ghost-freq', 'ghost', 'frequency', 'source.oscillator'),
        range: { min: 100, max: 800, scale: 'log', unit: 'Hz' },
      },
    ],
    truth: { frequency: 440, 'ghost-freq': 300 },
    descriptors: ['pitchHz', 'spectralPeakHz', 'integratedLufs', 'attackSeconds'],
    unidentifiable: ['ghost-freq'],
  },
];

function descriptorsOf(program: unknown): DescriptorSummaryV1 {
  const r = renderProgram(program);
  const report = analyzeAudio(r.channels, r.sampleRate, 'source-pcm');
  return summarizeAudio(r.channels, r.sampleRate, report);
}

function targetEntries(
  measured: DescriptorSummaryV1,
  names: readonly (keyof DescriptorSummaryV1)[],
  manifest: boolean,
): Record<string, { value: number | null; weight: number }> {
  const out: Record<string, { value: number | null; weight: number }> = {};
  for (const name of names) {
    const v = measured[name];
    // PCM yolunda null ölçüm hedefe giremez (değer zorunlu); manifest yolunda
    // null bırakılır — değer manifest'ten okunur.
    if (!manifest && typeof v !== 'number') continue;
    out[name] = { value: manifest ? null : (v as number), weight: 1 };
  }
  return out;
}

/** Manifest `analysis.encoded` gövdesini ölçülen betimleyicilerden doldurur. */
function manifestEncoded(measured: DescriptorSummaryV1): Record<string, unknown> {
  const encoded: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(FIT_MANIFEST_FIELDS)) {
    const v = (measured as unknown as Record<string, number | null>)[name];
    if (typeof v !== 'number') continue;
    let node = encoded;
    for (const key of path.slice(0, -1)) {
      node[key] ??= {};
      node = node[key] as Record<string, unknown>;
    }
    node[path[path.length - 1]] = v;
  }
  return encoded;
}

/** Boyutun normalize kurtarma hatası; `null` = karşılaştırılamaz değer. */
function normalizedError(
  dim: DimensionV1,
  recovered: unknown,
  truth: number | string,
): number | null {
  if (dim.options) return recovered === truth ? 0 : 1;
  if (typeof recovered !== 'number' || typeof truth !== 'number') return null;
  const r = dim.range as { min: number; max: number; scale: string };
  if (r.scale === 'log') {
    return Math.abs(Math.log2(recovered / truth)) / Math.log2(r.max / r.min);
  }
  return Math.abs(recovered - truth) / (r.max - r.min);
}

interface RunRow {
  readonly target: string;
  readonly seed: number;
  readonly via: 'pcm' | 'manifest';
  readonly verdict: string;
  readonly distance: number | null;
  readonly evaluated: number;
  readonly errors: Record<string, number | null>;
  readonly ok: boolean;
}

function runTarget(target: HiddenTarget): RunRow[] {
  const hidden = materialize(
    { kind: 'program', program: target.base as unknown as AcousticProgramV1 },
    target.dimensions,
    target.truth,
  );
  const measured = descriptorsOf(hidden);
  const rows: RunRow[] = [];
  for (const seed of SEEDS) {
    const spec: AcousticFitSpecV1 = {
      schema: 'AcousticFitSpecV1',
      fitId: `exp-${target.id}-s${seed}`,
      seed,
      base: { kind: 'program', program: target.base as unknown as AcousticProgramV1 },
      dimensions: target.dimensions,
      target: { descriptors: targetEntries(measured, target.descriptors, false) },
      search: SEARCH,
      tolerance: TOLERANCE,
    };
    const { report } = runFit(REPO_ROOT, FITS_ROOT, spec, { workers: 4 });
    const errors: Record<string, number | null> = {};
    for (const dim of target.dimensions) {
      const recovered = report.best.values?.[dim.name];
      errors[dim.name] = normalizedError(dim, recovered, target.truth[dim.name]);
    }
    const blind = new Set(target.unidentifiable ?? []);
    const ok =
      report.verdict === 'converged' &&
      Object.entries(errors).every(([name, e]) => blind.has(name) || (e !== null && e <= DIM_OK));
    rows.push({
      target: target.id,
      seed,
      via: 'pcm',
      verdict: report.verdict,
      distance: report.best.distance,
      evaluated: report.evaluated,
      errors,
      ok,
    });
  }
  return rows;
}

/** Manifest girişli tek koşu — `hidden-drum` için ikinci giriş yolu kanıtı. */
function runManifestVariant(target: HiddenTarget): RunRow {
  const hidden = materialize(
    { kind: 'program', program: target.base as unknown as AcousticProgramV1 },
    target.dimensions,
    target.truth,
  );
  const measured = descriptorsOf(hidden);
  const manifestPath = `devtools/audio-synth/export/fit-experiment/${target.id}-manifest.json`;
  mkdirSync(dirname(join(REPO_ROOT, manifestPath)), { recursive: true });
  writeFileSync(
    join(REPO_ROOT, manifestPath),
    JSON.stringify({ analysis: { encoded: manifestEncoded(measured) } }),
  );
  const spec: AcousticFitSpecV1 = {
    schema: 'AcousticFitSpecV1',
    fitId: `exp-${target.id}-manifest`,
    seed: SEEDS[0],
    base: { kind: 'program', program: target.base as unknown as AcousticProgramV1 },
    dimensions: target.dimensions,
    target: {
      manifest: manifestPath,
      descriptors: targetEntries(measured, target.descriptors, true),
    },
    search: SEARCH,
    tolerance: TOLERANCE,
  };
  const { report } = runFit(REPO_ROOT, FITS_ROOT, spec, { workers: 4 });
  const errors: Record<string, number | null> = {};
  for (const dim of target.dimensions) {
    const recovered = report.best.values?.[dim.name];
    errors[dim.name] = normalizedError(dim, recovered, target.truth[dim.name]);
  }
  return {
    target: target.id,
    seed: SEEDS[0],
    via: 'manifest',
    verdict: report.verdict,
    distance: report.best.distance,
    evaluated: report.evaluated,
    errors,
    ok: report.verdict === 'converged',
  };
}

function fmt(e: number | null): string {
  return e === null ? '—' : e.toFixed(3);
}

// Deney tekrarlanabilir: önceki `exp-*` fit dizinleri yeniden üretilebilir
// kanıttır (export/ git dışı), temizlenip yeniden koşulur.
const fitsAbs = join(REPO_ROOT, FITS_ROOT);
if (existsSync(fitsAbs)) {
  for (const entry of readdirSync(fitsAbs)) {
    if (entry.startsWith('exp-')) rmSync(join(fitsAbs, entry), { recursive: true });
  }
}

const rows: RunRow[] = [];
for (const target of TARGETS) rows.push(...runTarget(target));
const drum = TARGETS.find((t) => t.id === 'hidden-drum');
if (drum) rows.push(runManifestVariant(drum));

console.log('| hedef | tohum | giriş | verdict | uzaklık | değerlendirilen | boyut hataları |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) {
  const errs = Object.entries(r.errors)
    .map(([k, v]) => `${k}:${fmt(v)}`)
    .join(' ');
  console.log(
    `| ${r.target} | ${r.seed} | ${r.via} | ${r.verdict} | ${r.distance?.toFixed(3) ?? '—'} | ` +
      `${r.evaluated} | ${errs} |`,
  );
}
console.log('');
for (const target of TARGETS) {
  const own = rows.filter((r) => r.target === target.id && r.via === 'pcm');
  const ok = own.filter((r) => r.ok).length;
  console.log(`${target.id}: başarı ${ok}/${own.length}`);
}

mkdirSync(dirname(EVIDENCE), { recursive: true });
writeFileSync(
  EVIDENCE,
  prettyCanonicalJson({ seeds: SEEDS, search: SEARCH, tolerance: TOLERANCE, dimOk: DIM_OK, rows }),
);
console.log(`\nkanıt: ${EVIDENCE}`);
