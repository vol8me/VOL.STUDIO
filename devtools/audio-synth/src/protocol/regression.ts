import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { analyzeAudio, ANALYZER_VERSION, type AudioAnalysisReportV1 } from '../analysis/report';
import type { AssetClass } from '../analysis/assetQa';
import { MUSIC_RENDERER_VERSION } from '../music/render';
import { PROGRAM_RENDERER_VERSION } from '../program/render';
import { decodeWithFfmpeg } from './toolchain';
import { registryHash } from './publish';
import { type Sha256 } from '../kernel/canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside } from './fs';
import { estimateForKind, kindOfProgramSchema, renderForKind, type JobKind } from './kinds';
import { validateManifest } from './manifest';
import { runTasks } from './parallel';
import type { RegressionPartInput, RegressionPartOutput } from './parallelTasks';
import { assertBatchBudget, DEFAULT_BATCH_BUDGET, estimateBatch } from '../guard/batch';
import { batchWorkers } from '../guard/parallel';
import { repoSampleResolver } from './samples';

export const REGRESSION_REPORT_SCHEMA = 'RegressionReportV2';
export const MANIFESTS_ROOT = 'devtools/audio-synth/reference/production/manifests';

export interface RegressionEntryV1 {
  /** Manifest köküne göreli kimlik (`.json` hariç): `sfx/reference-impact`. */
  readonly id: string;
  readonly manifest: string;
  readonly assetClass: AssetClass;
  readonly kind: JobKind;
  readonly programHash: Sha256;
  readonly pcmHash: Sha256;
  readonly seed: number;
  readonly frames: number;
  readonly program: unknown;
  readonly assetPath: string;
}

/** Korpus = production manifest'lerinin tamamı; üyelik elle beyan edilmez. */
export function regressionCorpus(repoRoot: string): RegressionEntryV1[] {
  const root = resolveInside(repoRoot, MANIFESTS_ROOT, 'manifests');
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.json')) files.push(full);
    }
  };
  walk(root);
  return files.sort().map((file) => {
    const rel = relative(repoRoot, file).replaceAll('\\', '/');
    const manifest = validateManifest(readJsonFile(file, rel));
    return {
      id: rel.slice(MANIFESTS_ROOT.length + 1).replace(/\.json$/, ''),
      manifest: rel,
      assetClass: manifest.policy.assetClass,
      kind: kindOfProgramSchema(manifest.program.schema, rel),
      programHash: manifest.program.hash,
      pcmHash: manifest.render.pcm.hash,
      seed: manifest.render.seed,
      frames: manifest.render.pcm.frames,
      program: manifest.program.document,
      assetPath: manifest.asset.path,
    };
  });
}

export type RegressionStatus = 'unchanged' | 'pcm-changed';

export interface DescriptorDeltaV1 {
  readonly key: string;
  readonly baseline: number | null;
  readonly current: number | null;
  readonly delta: number;
}

function flattenNumbers(value: unknown, prefix: string, out: Map<string, number>): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.set(prefix, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => flattenNumbers(v, `${prefix}[${i}]`, out));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'schema' || k === 'analyzerVersion' || k === 'measuredFrom') continue;
      flattenNumbers(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
}

/** Kayıtlı (yayımlanmış çözülmüş) betimleyicilerle yeni render'ın sayısal farkı. */
export function descriptorDeltas(
  baseline: AudioAnalysisReportV1,
  current: AudioAnalysisReportV1,
): DescriptorDeltaV1[] {
  const a = new Map<string, number>();
  const b = new Map<string, number>();
  flattenNumbers(baseline, '', a);
  flattenNumbers(current, '', b);
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const deltas: DescriptorDeltaV1[] = [];
  for (const key of keys) {
    const was = a.get(key) ?? null;
    const now = b.get(key) ?? null;
    if (was === now) continue;
    if (was !== null && now !== null && Math.abs(now - was) < 1e-9) continue;
    deltas.push({ key, baseline: was, current: now, delta: (now ?? 0) - (was ?? 0) });
  }
  return deltas;
}

export interface RegressionRowV2 {
  readonly id: string;
  readonly manifest: string;
  readonly assetClass: AssetClass;
  readonly kind: JobKind;
  readonly baseline: { readonly programHash: Sha256; readonly pcmHash: Sha256 };
  readonly current: { readonly programHash: Sha256; readonly pcmHash: Sha256 };
  readonly status: RegressionStatus;
  readonly deltas: readonly DescriptorDeltaV1[];
}

export interface RegressionReportV2 {
  readonly schema: typeof REGRESSION_REPORT_SCHEMA;
  readonly engine: {
    readonly programRenderer: number;
    readonly musicRenderer: number;
    readonly analyzer: number;
    readonly registryHash: Sha256;
  };
  readonly counts: Readonly<Record<RegressionStatus, number>>;
  readonly rows: readonly RegressionRowV2[];
}

export interface RegressionRunOptions {
  readonly workers?: number;
  /** Yalnız bu manifest kimlikleri (test/dar kapsam); verilmezse bütün korpus. */
  readonly ids?: readonly string[];
}

/** Güncel PCM ile kayıtlı yayın kimliğinin farkını ölçer; baseline değişmez. */
export function runRegression(
  repoRoot: string,
  options: RegressionRunOptions = {},
): RegressionReportV2 {
  const corpus = regressionCorpus(repoRoot);
  const entries = options.ids ? corpus.filter((e) => options.ids!.includes(e.id)) : corpus;
  if (options.ids) {
    const missing = options.ids.filter((id) => !corpus.some((e) => e.id === id));
    if (missing.length) {
      throw new ProtocolError('invalid', `korpusta yok: ${missing.join(', ')}`, 'ids');
    }
  }
  const estimate = estimateBatch(
    entries.map((e) => ({
      cost: estimateForKind(e.kind, e.program),
      samples: e.frames,
    })),
  );
  assertBatchBudget(estimate, DEFAULT_BATCH_BUDGET, 'regresyon korpusu');
  const outputs = runTasks<RegressionPartOutput>(
    repoRoot,
    'regression-part',
    entries.map((e): RegressionPartInput => ({
      key: e.id,
      kind: e.kind,
      document: e.program,
      seed: e.seed,
      expectedPcmHash: e.pcmHash,
    })),
    batchWorkers(estimate, options.workers),
  );
  const byKey = new Map(outputs.map((o) => [o.key, o]));
  const resolver = repoSampleResolver(repoRoot);
  const rows = entries.map((entry): RegressionRowV2 => {
    const out = byKey.get(entry.id);
    if (!out) throw new ProtocolError('invalid', 'regression parçası çıktısı eksik', entry.id);
    const baseline = { programHash: entry.programHash, pcmHash: entry.pcmHash };
    const current = { programHash: out.programHash, pcmHash: out.pcmHash };
    if (out.pcmHash === entry.pcmHash) {
      return {
        id: entry.id,
        manifest: entry.manifest,
        assetClass: entry.assetClass,
        kind: entry.kind,
        baseline,
        current,
        status: 'unchanged',
        deltas: [],
      };
    }
    const channels =
      out.channels ??
      renderForKind(entry.kind, entry.program, {
        seed: entry.seed,
        samples: resolver,
        quality: 'final',
        cache: null,
      }).channels;
    const sampleRate = out.sampleRate ?? 48000;
    const fresh = analyzeAudio(channels, sampleRate, 'source-pcm');
    const assetFile = resolveInside(repoRoot, entry.assetPath, 'asset');
    let deltas: DescriptorDeltaV1[] = [];
    if (existsSync(assetFile)) {
      try {
        const decoded = decodeWithFfmpeg(assetFile, entry.assetPath);
        const shipped = analyzeAudio(decoded.channels, decoded.sampleRate, 'decoded-encoded');
        deltas = descriptorDeltas(shipped, fresh);
      } catch (error) {
        if (!(error instanceof ProtocolError)) throw error;
      }
    }
    return {
      id: entry.id,
      manifest: entry.manifest,
      assetClass: entry.assetClass,
      kind: entry.kind,
      baseline,
      current,
      status: 'pcm-changed',
      deltas,
    };
  });
  const counts: Record<RegressionStatus, number> = {
    unchanged: 0,
    'pcm-changed': 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return {
    schema: REGRESSION_REPORT_SCHEMA,
    engine: {
      programRenderer: PROGRAM_RENDERER_VERSION,
      musicRenderer: MUSIC_RENDERER_VERSION,
      analyzer: ANALYZER_VERSION,
      registryHash: registryHash(),
    },
    counts,
    rows,
  };
}
