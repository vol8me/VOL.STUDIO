/**
 * Estetik regresyon hafızası — reference/audition korpusu motorun "kabul
 * edilmiş ses karakteri" kaydıdır. Golden-file DEĞİLDİR: PCM sonsuza dek
 * değişemez diye bir kural yok; her manifest kaynağı, motor sürümü ve
 * betimleyiciyle birlikte saklanır ve büyük DSP değişikliğinde hangi
 * accepted asset'lerin etkilendiği `regression run` ile görünür olur.
 *
 * Karar mekaniği: PCM kimliği değişince satır `audition-required` olur —
 * otomatik "regression" sayılmaz (bilinçli iyileştirme de hash değiştirir).
 * İnsan kararı `regression decide` ile makine-okunur yazılır: karar tam o
 * PCM kimliğine bağlanır; sonraki koşu başka bir hash üretirse karar
 * bayatlar ve satır yeniden `audition-required` olur.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { analyzeAudio, ANALYZER_VERSION, type AudioAnalysisReportV1 } from '../analysis/report';
import type { AssetClass } from '../analysis/assetQa';
import { MUSIC_RENDERER_VERSION } from '../music/render';
import { PROGRAM_RENDERER_VERSION } from '../program/render';
import { decodeWithFfmpeg } from './toolchain';
import { registryHash } from './publish';
import { prettyCanonicalJson, type Sha256 } from '../kernel/canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside, withLock, writeFileAtomic } from './fs';
import { estimateForKind, kindOfProgramSchema, renderForKind, type JobKind } from './kinds';
import { validateManifest } from './manifest';
import { runTasks } from './parallel';
import type { RegressionPartInput, RegressionPartOutput } from './parallelTasks';
import { assertBatchBudget, DEFAULT_BATCH_BUDGET, estimateBatch } from '../guard/batch';
import { batchWorkers } from '../guard/parallel';
import { repoSampleResolver } from './samples';

export const REGRESSION_REPORT_SCHEMA = 'RegressionReportV1';
export const REGRESSION_DECISIONS_SCHEMA = 'RegressionDecisionsV1';
export const REGRESSION_ROOT = 'devtools/audio-synth/regression';
export const DECISIONS_FILE = `${REGRESSION_ROOT}/decisions.json`;
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

export type RegressionDecisionStatus = 'accepted-change' | 'rejected-regression';
export type RegressionStatus = 'unchanged' | 'audition-required' | RegressionDecisionStatus;

export interface RegressionDecisionV1 {
  readonly status: RegressionDecisionStatus;
  /** Kararın bağlandığı YENİ render kimliği; başka hash üretilirse karar bayatlar. */
  readonly pcmHash: Sha256;
  readonly note: string;
}

export interface RegressionDecisionsV1 {
  readonly schema: typeof REGRESSION_DECISIONS_SCHEMA;
  readonly decisions: Readonly<Record<string, RegressionDecisionV1>>;
}

function emptyDecisions(): RegressionDecisionsV1 {
  return { schema: REGRESSION_DECISIONS_SCHEMA, decisions: {} };
}

function validateDecision(value: unknown, path: string): RegressionDecisionV1 {
  const o = (value ?? {}) as Record<string, unknown>;
  const status = o.status;
  if (status !== 'accepted-change' && status !== 'rejected-regression') {
    throw new ProtocolError('invalid', 'karar accepted-change|rejected-regression olmalı', path);
  }
  if (typeof o.pcmHash !== 'string' || !o.pcmHash.startsWith('sha256:')) {
    throw new ProtocolError('invalid', 'pcmHash sha256: önekli olmalı', path);
  }
  if (typeof o.note !== 'string' || o.note.trim().length === 0) {
    throw new ProtocolError('invalid', 'karar notu boş olamaz', path);
  }
  return { status, pcmHash: o.pcmHash as Sha256, note: o.note };
}

/** Karar dosyası; yoksa boş küme. */
export function regressionDecisions(repoRoot: string): RegressionDecisionsV1 {
  const file = resolveInside(repoRoot, DECISIONS_FILE, 'decisions');
  if (!existsSync(file)) return emptyDecisions();
  const raw = readJsonFile(file, DECISIONS_FILE) as { schema?: unknown; decisions?: unknown };
  if (
    raw.schema !== REGRESSION_DECISIONS_SCHEMA ||
    typeof raw.decisions !== 'object' ||
    raw.decisions === null
  ) {
    throw new ProtocolError('corrupt', `${REGRESSION_DECISIONS_SCHEMA} bekleniyor`, DECISIONS_FILE);
  }
  const decisions: Record<string, RegressionDecisionV1> = {};
  for (const [id, value] of Object.entries(raw.decisions as Record<string, unknown>)) {
    decisions[id] = validateDecision(value, `decisions.${id}`);
  }
  return { schema: REGRESSION_DECISIONS_SCHEMA, decisions };
}

/** İnsan kararını kaydet — PCM kimliği çağıranın elindeki koşu çıktısıdır. */
export function decideRegression(
  repoRoot: string,
  id: string,
  status: RegressionDecisionStatus,
  pcmHash: Sha256,
  note: string,
): RegressionDecisionsV1 {
  const decision = validateDecision({ status, pcmHash, note }, `decisions.${id}`);
  const file = resolveInside(repoRoot, DECISIONS_FILE, 'decisions');
  return withLock(resolveInside(repoRoot, REGRESSION_ROOT, 'decisions'), DECISIONS_FILE, () => {
    const current = regressionDecisions(repoRoot);
    const next: RegressionDecisionsV1 = {
      schema: REGRESSION_DECISIONS_SCHEMA,
      decisions: { ...current.decisions, [id]: decision },
    };
    writeFileAtomic(file, prettyCanonicalJson(next));
    return next;
  });
}

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

export interface RegressionRowV1 {
  readonly id: string;
  readonly manifest: string;
  readonly assetClass: AssetClass;
  readonly kind: JobKind;
  readonly baseline: { readonly programHash: Sha256; readonly pcmHash: Sha256 };
  readonly current: { readonly programHash: Sha256; readonly pcmHash: Sha256 };
  readonly status: RegressionStatus;
  readonly deltas: readonly DescriptorDeltaV1[];
  readonly decision: RegressionDecisionV1 | null;
}

export interface RegressionReportV1 {
  readonly schema: typeof REGRESSION_REPORT_SCHEMA;
  readonly engine: {
    readonly programRenderer: number;
    readonly musicRenderer: number;
    readonly analyzer: number;
    readonly registryHash: Sha256;
  };
  readonly counts: Readonly<Record<RegressionStatus, number>>;
  readonly rows: readonly RegressionRowV1[];
}

export interface RegressionRunOptions {
  readonly workers?: number;
  /** Yalnız bu manifest kimlikleri (test/dar kapsam); verilmezse bütün korpus. */
  readonly ids?: readonly string[];
}

/**
 * Korpusu güncel motorla yeniden render eder. PCM kimliği aynıysa
 * `unchanged`; değiştiyse yayımlanmış asset çözülüp betimleyici farkı
 * ölçülür ve satır `audition-required` olur (geçerli bir insan kararı
 * yoksa). Değişiklik ASLA otomatik "regression" sayılmaz.
 */
export function runRegression(
  repoRoot: string,
  options: RegressionRunOptions = {},
): RegressionReportV1 {
  const corpus = regressionCorpus(repoRoot);
  const entries = options.ids ? corpus.filter((e) => options.ids!.includes(e.id)) : corpus;
  if (options.ids) {
    const missing = options.ids.filter((id) => !corpus.some((e) => e.id === id));
    if (missing.length) {
      throw new ProtocolError('invalid', `korpusta yok: ${missing.join(', ')}`, 'ids');
    }
  }
  const decisions = regressionDecisions(repoRoot);
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
  const rows = entries.map((entry): RegressionRowV1 => {
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
        decision: null,
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
    const decision = decisions.decisions[entry.id] ?? null;
    const status: RegressionStatus =
      decision && decision.pcmHash === out.pcmHash ? decision.status : 'audition-required';
    return {
      id: entry.id,
      manifest: entry.manifest,
      assetClass: entry.assetClass,
      kind: entry.kind,
      baseline,
      current,
      status,
      deltas,
      decision,
    };
  });
  const counts: Record<RegressionStatus, number> = {
    unchanged: 0,
    'audition-required': 0,
    'accepted-change': 0,
    'rejected-regression': 0,
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
