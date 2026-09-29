/**
 * QualityMatrixV1 — `audio:capabilities` çıktısı. Ontolojinin kapalı
 * mekanizma sözlüğünün her satırı için motorun KANITLANMIŞ seviyesini
 * türetir: registry'de sağlayıcı var demek yetmez; seviye, sürümlü
 * benchmark görevleri ve organik canary kayıtlarından (BenchmarkReportV1)
 * mekanik olarak okunur.
 *
 * Kapsam türetmesi de kayıttan gelir: bir görev/canary, kaynak programında
 * mekanizmanın `providers` kimliğinden en az birini kullanıyorsa (ya da
 * katman `mechanism` etiketini taşıyorsa) o mekanizmanın kanıtıdır. Elle
 * yazılmış aile↔görev tablosu yoktur; yeni görev ya da sağlayıcı matrise
 * kendiliğinden düşer.
 *
 * Seviyeler: `production-ready` = geçen benchmark kanıtı VE kategoriyi
 * kapsayan doğrulanmış yayımlanmış manifest VE güncel görev sürümü için
 * insan `heard-acceptable` beyanı; `benchmarked` = geçen benchmark kanıtı
 * var ama yayın ya da kabul kanıtı eksik (mekanik geçiş, üretim onayı
 * değil); `canary` = yalnız geçen canary kanıtı; `regressed` = kanıt var
 * ama hepsi düşüyor; `research` = sağlayıcı registry'de var, render
 * kanıtı yok; `pipeline` = ayrı üretim hattı (MusicProgramV1) henüz
 * kanıtlanmadı; `unsupported` = sağlayıcısız. Görev sürümü artınca eski
 * sürüme yapılmış kabul bayatlar ve raporda `pending-human` görünür —
 * statü kendiliğinden düşer. İnsan dinleme durumu satırda ayrıca taşınır.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MECHANISMS, ONTOLOGY_VERSION, type MechanismV1 } from '../program/ontology';
import type { ProgramBaseV1 } from '../program/dimensions';
import type { AcousticProgramV1 } from '../program/schema';
import type { LayerRole } from '../program/roles';
import { loadBenchmarkTasks, type BenchmarkReportV1, type BenchmarkTaskV1 } from './benchmark';
import { loadCanaries, type OrganicCanaryV1 } from './canary';
import { readJsonFile } from './fs';
import { surveyTargets } from './targets';

export const QUALITY_MATRIX_SCHEMA = 'QualityMatrixV1';

export type CapabilityLevel =
  | 'production-ready'
  | 'benchmarked'
  | 'canary'
  | 'regressed'
  | 'research'
  | 'pipeline'
  | 'unsupported';

export type CapabilityListening = 'heard-acceptable' | 'heard-problem' | 'pending-human' | 'none';

export interface CapabilityEvidenceV1 {
  readonly kind: 'benchmark' | 'canary';
  readonly id: string;
  readonly version: number;
  readonly pass: boolean;
  readonly review: CapabilityListening;
}

/** Yayımlanmış bir manifest'in (kanonik kapıdan geçmiş kayıt) kapsadığı tag kümesi. */
export interface PublishedRefV1 {
  readonly manifest: string;
  readonly tags: ReadonlySet<string>;
}

export interface CapabilityRowV1 {
  readonly mechanism: string;
  readonly role: LayerRole;
  readonly description: string;
  readonly level: CapabilityLevel;
  readonly providers: readonly string[];
  readonly evidence: readonly CapabilityEvidenceV1[];
  /** Kategoriyi kapsayan doğrulanmış yayımlanmış manifestler. */
  readonly published: readonly string[];
  readonly listening: CapabilityListening;
}

export interface QualityMatrixV1 {
  readonly schema: typeof QUALITY_MATRIX_SCHEMA;
  readonly ontology: number;
  readonly engine: BenchmarkReportV1['engine'];
  readonly counts: Readonly<Record<CapabilityLevel, number>>;
  readonly rows: readonly CapabilityRowV1[];
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

function listeningOf(evidence: readonly CapabilityEvidenceV1[]): CapabilityListening {
  if (evidence.some((e) => e.review === 'heard-problem')) return 'heard-problem';
  if (evidence.some((e) => e.review === 'pending-human')) return 'pending-human';
  if (evidence.some((e) => e.review === 'heard-acceptable')) return 'heard-acceptable';
  return 'none';
}

function levelOf(
  mechanism: MechanismV1,
  evidence: readonly CapabilityEvidenceV1[],
  published: readonly string[],
): CapabilityLevel {
  const benches = evidence.filter((e) => e.kind === 'benchmark' && e.pass);
  if (benches.length > 0) {
    const accepted = benches.some((e) => e.review === 'heard-acceptable');
    if (accepted && published.length > 0) return 'production-ready';
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
  readonly report: BenchmarkReportV1;
  readonly mechanisms?: readonly MechanismV1[];
  /** Doğrulanmış yayımlanmış referanslar; verilmezse hiçbir satır production-ready olamaz. */
  readonly published?: readonly PublishedRefV1[];
}

/** Saf türetme: görev/canary kaynakları + koşu kaydı → seviye matrisi. */
export function deriveQualityMatrix(input: QualityMatrixInput): QualityMatrixV1 {
  const mechanisms = input.mechanisms ?? MECHANISMS;
  const taskTagsBy = new Map(input.tasks.map((t) => [t.id, taskTags(t)]));
  const canaryTagsBy = new Map(input.canaries.map((c) => [c.id, baseTags(c.source)]));
  const rows = mechanisms.map((mechanism) => {
    const evidence: CapabilityEvidenceV1[] = [];
    for (const task of input.report.tasks) {
      const tags = taskTagsBy.get(task.id);
      if (tags !== undefined && covers(mechanism, tags)) {
        evidence.push({
          kind: 'benchmark',
          id: task.id,
          version: task.version,
          pass: task.pass,
          review: task.review,
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
          pass: canary.pass,
          review: canary.review,
        });
      }
    }
    evidence.sort(
      (a, b) =>
        (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const published = (input.published ?? [])
      .filter((ref) => covers(mechanism, ref.tags))
      .map((ref) => ref.manifest)
      .sort();
    return {
      mechanism: mechanism.id,
      role: mechanism.role,
      description: mechanism.description,
      level: levelOf(mechanism, evidence, published),
      providers: [...mechanism.providers].sort(),
      evidence,
      published,
      listening: listeningOf(evidence),
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

/**
 * `reference/production/manifests/**` altındaki yayımlanmış manifestleri
 * okur; her biri `asset` + `analysis.encoded` kaydı taşımak zorundadır —
 * bu kayıt yalnız kanonik yayın kapısından geçen (yeniden render + encode
 * + post-codec QA) çıktıda vardır. Sürekli doğrulama `audio:verify`'nin
 * işidir; burada manifest kapının yazdığı kayıt sayılır. Müzik
 * manifestleri `pipeline:MusicProgramV1` etiketi üretir; akustik
 * manifestler program düğümlerinin sağlayıcı kimliklerini taşır.
 */
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
    return { manifest, tags };
  }
}

/** Fixture'ları diskten okuyup rapora bağlayan kolaylık sarmalayıcısı. */
export function qualityMatrix(repoRoot: string, report: BenchmarkReportV1): QualityMatrixV1 {
  return deriveQualityMatrix({
    tasks: loadBenchmarkTasks(repoRoot),
    canaries: loadCanaries(repoRoot),
    report,
    published: loadPublishedReferences(repoRoot),
  });
}
