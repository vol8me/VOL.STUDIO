import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MECHANISMS, ONTOLOGY_VERSION, type MechanismV1 } from '../program/ontology';
import type { ProgramBaseV1 } from '../program/dimensions';
import type { AcousticProgramV1 } from '../program/schema';
import type { LayerRole } from '../program/roles';
import {
  isFreshBenchmarkReport,
  BENCHMARK_REPORT_SCHEMA,
  loadBenchmarkTasks,
  type BenchmarkReportV2,
  type BenchmarkTaskV1,
} from './benchmark';
import { loadCanaries, type OrganicCanaryV1 } from './canary';
import { readJsonFile } from './fs';
import { hashCanonical, type Sha256 } from '../kernel/canonical';
import { ProtocolError } from './errors';
import { verifyManifest } from './publish';
import { surveyTargets } from './targets';

export const QUALITY_MATRIX_SCHEMA = 'QualityMatrixV2';

export type CapabilityLevel =
  | 'production-ready'
  | 'benchmarked'
  | 'canary'
  | 'regressed'
  | 'research'
  | 'pipeline'
  | 'unsupported';

export interface CapabilityEvidenceV2 {
  readonly kind: 'benchmark' | 'canary';
  readonly id: string;
  readonly version: number;
  readonly pass: boolean;
}

/** Keşfedilmiş yayın kaynağının etiketleri; üretim için türetme anında doğrulanır. */
export interface PublishedRefV1 {
  readonly manifest: string;
  readonly tags: ReadonlySet<string>;
}

export interface CapabilityRowV2 {
  readonly mechanism: string;
  readonly role: LayerRole;
  readonly description: string;
  readonly level: CapabilityLevel;
  readonly providers: readonly string[];
  readonly evidence: readonly CapabilityEvidenceV2[];
  /** Kategoriyi kapsayan doğrulanmış yayımlanmış manifestler. */
  readonly published: readonly string[];
}

export interface QualityMatrixV2 {
  readonly schema: typeof QUALITY_MATRIX_SCHEMA;
  readonly ontology: number;
  readonly engine: BenchmarkReportV2['engine'];
  readonly counts: Readonly<Record<CapabilityLevel, number>>;
  readonly rows: readonly CapabilityRowV2[];
}

/** Program kaynağında anılan registry kimlikleri + bildirilmiş mekanizma etiketleri. */
function programTags(program: AcousticProgramV1): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const layer of program.layers) {
    ids.add(layer.source.primitive);
    for (const node of layer.resonators ?? []) ids.add(node.primitive);
    if (layer.articulation) ids.add(layer.articulation.primitive);
    for (const node of layer.inserts ?? []) ids.add(node.primitive);
    if (layer.mechanism) ids.add(`mechanism:${layer.mechanism}`);
  }
  for (const node of program.effects ?? []) ids.add(node.primitive);
  for (const bus of Object.values(program.buses ?? {})) {
    for (const node of bus.effects ?? []) ids.add(node.primitive);
  }
  return ids;
}

function baseTags(base: ProgramBaseV1): ReadonlySet<string> {
  if (base.kind === 'archetype') return new Set([`archetype.${base.request.archetype}`]);
  return programTags(base.program);
}

function taskTags(task: BenchmarkTaskV1): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const part of task.parts) {
    const source = part.source;
    if (source.kind === 'music') {
      ids.add('pipeline:MusicProgramV1');
    } else {
      for (const id of baseTags(source)) ids.add(id);
    }
  }
  return ids;
}

function covers(mechanism: MechanismV1, tags: ReadonlySet<string>): boolean {
  if (tags.has(`mechanism:${mechanism.id}`)) return true;
  if (mechanism.providers.some((p) => tags.has(p))) return true;
  return (mechanism.pipelines ?? []).some((p) => tags.has(`pipeline:${p}`));
}

function levelOf(
  mechanism: MechanismV1,
  evidence: readonly CapabilityEvidenceV2[],
  published: readonly string[],
  fresh: boolean,
): CapabilityLevel {
  const benches = evidence.filter((e) => e.kind === 'benchmark' && e.pass);
  if (benches.length > 0) {
    if (fresh && published.length > 0) return 'production-ready';
    return 'benchmarked';
  }
  if (evidence.some((e) => e.kind === 'canary' && e.pass)) return 'canary';
  if (evidence.length > 0) return 'regressed';
  if (mechanism.providers.length > 0) return 'research';
  return mechanism.pipelines && mechanism.pipelines.length > 0 ? 'pipeline' : 'unsupported';
}

export interface QualityMatrixInput {
  readonly tasks: readonly BenchmarkTaskV1[];
  readonly canaries: readonly OrganicCanaryV1[];
  readonly report: BenchmarkReportV2;
  readonly mechanisms?: readonly MechanismV1[];
  /** loadPublishedReferences çıktısı; verilmezse üretim seviyesine çıkılmaz. */
  readonly published?: readonly PublishedRefV1[];
}

/** Görev/canary kaydı ve güncel yayın doğrulamasından seviye türetir. */
export function deriveQualityMatrix(input: QualityMatrixInput): QualityMatrixV2 {
  if (String(input.report.schema) !== BENCHMARK_REPORT_SCHEMA) {
    throw new ProtocolError('invalid', `${BENCHMARK_REPORT_SCHEMA} rapor sürümü gerekir`, 'schema');
  }
  const fresh = isFreshBenchmarkReport(input.report);
  const verified = new Map<PublishedRefV1, boolean>();
  const currentPublication = (ref: PublishedRefV1): boolean => {
    if (!verified.has(ref)) verified.set(ref, verifyReference(ref));
    return verified.get(ref) === true;
  };
  const mechanisms = input.mechanisms ?? MECHANISMS;
  const taskTagsBy = new Map(input.tasks.map((t) => [t.id, taskTags(t)]));
  const canaryTagsBy = new Map(input.canaries.map((c) => [c.id, baseTags(c.source)]));
  const rows = mechanisms.map((mechanism) => {
    const evidence: CapabilityEvidenceV2[] = [];
    for (const task of input.report.tasks) {
      const tags = taskTagsBy.get(task.id);
      if (tags !== undefined && covers(mechanism, tags)) {
        evidence.push({
          kind: 'benchmark',
          id: task.id,
          version: task.version,
          pass:
            task.pass &&
            input.tasks.some(
              (t) =>
                t.id === task.id &&
                t.version === task.version &&
                hashCanonical(t) === task.sourceHash,
            ),
        });
      }
    }
    for (const canary of input.report.canaries) {
      const tags = canaryTagsBy.get(canary.id);
      if (tags !== undefined && covers(mechanism, tags)) {
        evidence.push({
          kind: 'canary',
          id: canary.id,
          version: canary.version,
          pass:
            canary.pass &&
            input.canaries.some(
              (c) =>
                c.id === canary.id &&
                c.version === canary.version &&
                hashCanonical(c) === canary.sourceHash,
            ),
        });
      }
    }
    evidence.sort(
      (a, b) =>
        (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const published = (input.published ?? [])
      .filter((ref) => covers(mechanism, ref.tags) && currentPublication(ref))
      .map((ref) => ref.manifest)
      .sort();
    return {
      mechanism: mechanism.id,
      role: mechanism.role,
      description: mechanism.description,
      level: levelOf(mechanism, evidence, published, fresh),
      providers: [...mechanism.providers].sort(),
      evidence,
      published,
    };
  });
  const counts: Record<CapabilityLevel, number> = {
    'production-ready': 0,
    benchmarked: 0,
    canary: 0,
    regressed: 0,
    research: 0,
    pipeline: 0,
    unsupported: 0,
  };
  for (const row of rows) counts[row.level] += 1;
  return {
    schema: QUALITY_MATRIX_SCHEMA,
    ontology: ONTOLOGY_VERSION,
    engine: input.report.engine,
    counts,
    rows,
  };
}

const discoveredReferences = new WeakMap<
  PublishedRefV1,
  { hash: Sha256; repoRoot: string; manifestHash: Sha256 }
>();
const referenceHash = (ref: PublishedRefV1) =>
  hashCanonical({ manifest: ref.manifest, tags: [...ref.tags].sort() });

function verifyReference(ref: PublishedRefV1): boolean {
  const proof = discoveredReferences.get(ref);
  if (!proof || proof.hash !== referenceHash(ref)) return false;
  try {
    const current = readJsonFile(join(proof.repoRoot, ref.manifest), ref.manifest);
    return (
      hashCanonical(current) === proof.manifestHash &&
      verifyManifest(proof.repoRoot, ref.manifest).ok
    );
  } catch (error) {
    if (!(error instanceof ProtocolError)) throw error;
    return false;
  }
}

/** Referansları keşfeder; üretim kanıtı türetme anındaki bağımsız verify sonucudur. */
export function loadPublishedReferences(repoRoot: string): readonly PublishedRefV1[] {
  const refs: PublishedRefV1[] = [];
  for (const target of surveyTargets(repoRoot).publishable) {
    const root = `${target.packagePath}/${target.manifestRoot}`;
    const walk = (rel: string) => {
      const abs = join(repoRoot, rel);
      if (!existsSync(abs)) return;
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        const child = `${rel}/${entry.name}`;
        if (entry.isDirectory()) walk(child);
        else if (entry.name.endsWith('.json') && !entry.name.startsWith('.'))
          refs.push(tagsOf(child));
      }
    };
    walk(root);
  }
  return refs.sort((a, b) => (a.manifest < b.manifest ? -1 : a.manifest > b.manifest ? 1 : 0));

  function tagsOf(manifest: string): PublishedRefV1 {
    const raw = readJsonFile(join(repoRoot, manifest), manifest) as {
      asset?: unknown;
      analysis?: { encoded?: unknown };
      program?: { document?: unknown };
    };
    const doc = raw.program?.document;
    const tags = new Set<string>();
    if (
      typeof raw.asset !== 'object' ||
      raw.asset === null ||
      typeof raw.analysis?.encoded !== 'object'
    ) {
      return { manifest, tags };
    }
    if (doc !== null && typeof doc === 'object') {
      if (Array.isArray((doc as AcousticProgramV1).layers)) {
        for (const t of programTags(doc as AcousticProgramV1)) tags.add(t);
      } else if ('music' in doc || 'stem' in doc) tags.add('pipeline:MusicProgramV1');
    }
    const ref = { manifest, tags };
    discoveredReferences.set(ref, {
      hash: referenceHash(ref),
      repoRoot,
      manifestHash: hashCanonical(raw),
    });
    return ref;
  }
}

/** Fixture'ları diskten okuyup rapora bağlayan kolaylık sarmalayıcısı. */
export function qualityMatrix(repoRoot: string, report: BenchmarkReportV2): QualityMatrixV2 {
  return deriveQualityMatrix({
    tasks: loadBenchmarkTasks(repoRoot),
    canaries: loadCanaries(repoRoot),
    report,
    published: loadPublishedReferences(repoRoot),
  });
}
