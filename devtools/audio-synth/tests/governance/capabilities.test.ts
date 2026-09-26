import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_REPORT_SCHEMA,
  deriveQualityMatrix,
  loadBenchmarkTasks,
  loadCanaries,
  loadPublishedReferences,
  type BenchmarkReportV1,
  type CapabilityLevel,
  type QualityMatrixV1,
} from '../../src/protocol';
import { MECHANISMS } from '../../src/program/ontology';

/**
 * `audio:capabilities` matrisinin davranış sözleşmesi: seviye elle
 * yazılmaz, sürümlü görev/canary kayıtlarından VE fixture kaynaklarındaki
 * gerçek sağlayıcı kullanımından türetilir. Sentetik raporla koşar —
 * render gerekmez, karar mantığı yalıtılır. `production-ready` üç kanıt
 * birden ister: geçen görev + kategoriyi kapsayan doğrulanmış yayımlanmış
 * manifest + güncel görev sürümünde insan `heard-acceptable` beyanı.
 */
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const tasks = loadBenchmarkTasks(REPO);
const canaries = loadCanaries(REPO);
const published = loadPublishedReferences(REPO);

function reportWith(args: {
  readonly failTasks?: readonly string[];
  readonly failCanaries?: readonly string[];
  readonly reviews?: Readonly<Record<string, 'heard-acceptable' | 'heard-problem'>>;
}): BenchmarkReportV1 {
  const failT = new Set(args.failTasks ?? []);
  const failC = new Set(args.failCanaries ?? []);
  const reviews = args.reviews ?? {};
  return {
    schema: BENCHMARK_REPORT_SCHEMA,
    engine: {
      programRenderer: 0,
      musicRenderer: 0,
      analyzer: 0,
      checks: 0,
      registryHash: 'sha256:test',
      instrumentRegistryHash: 'sha256:test',
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      version: t.version,
      category: t.category,
      pass: !failT.has(t.id),
      parts: [],
      review: reviews[t.id] ?? 'pending-human',
    })),
    canaries: canaries.map((c) => ({
      id: c.id,
      version: c.version,
      programHash: 'sha256:test',
      pcmHash: 'sha256:test',
      pass: !failC.has(c.id),
      checks: [],
      review: 'pending-human',
    })),
  };
}

const ACCEPT_ALL = Object.fromEntries(tasks.map((t) => [t.id, 'heard-acceptable'] as const));

function rowOf(matrix: QualityMatrixV1, mechanism: string) {
  const row = matrix.rows.find((r) => r.mechanism === mechanism);
  expect(row, `${mechanism} satırı`).toBeDefined();
  return row!;
}

describe('kalite matrisi türetmesi', () => {
  const matrix = deriveQualityMatrix({ tasks, canaries, report: reportWith({}), published });

  it('her mekanizma tam bir satır üretir ve counts satırlarla tutarlıdır', () => {
    expect(matrix.schema).toBe('QualityMatrixV1');
    expect(matrix.rows).toHaveLength(MECHANISMS.length);
    const sum = Object.values(matrix.counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(matrix.rows.length);
  });

  it('geçen görev kanıtı tek başına yalnız benchmarked üretir — kabul kaydı yok', () => {
    for (const mech of ['impact', 'explosion', 'musical', 'ui'] as const) {
      const row = rowOf(matrix, mech);
      expect(row.level).toBe('benchmarked');
      expect(row.evidence.some((e) => e.kind === 'benchmark' && e.pass)).toBe(true);
      expect(row.published.length).toBeGreaterThan(0);
    }
    expect(matrix.rows.some((r) => r.level === 'production-ready')).toBe(false);
  });

  it('yalnız canary kanıtı olan mekanizma canary seviyesinde kalır', () => {
    for (const mech of ['fire', 'vocal', 'sampled'] as const) {
      const row = rowOf(matrix, mech);
      expect(row.level).toBe('canary');
      expect(row.evidence.every((e) => e.kind === 'canary')).toBe(true);
    }
  });

  it('sağlayıcısı olup kanıtı olmayan mekanizma research kalır — yayın manifesti yetmez', () => {
    for (const mech of ['tail', 'space'] as const) {
      const row = rowOf(matrix, mech);
      expect(row.level).toBe('research');
      expect(row.providers.length).toBeGreaterThan(0);
      expect(row.evidence).toHaveLength(0);
    }
  });

  it('sağlayıcısı olmayan mekanizma unsupported kalır — "primitive mevcut" sayılmaz', () => {
    for (const mech of ['speech', 'doppler-motion'] as const) {
      const row = rowOf(matrix, mech);
      expect(row.level).toBe('unsupported');
      expect(row.evidence).toHaveLength(0);
    }
  });

  it('kapsam sağlayıcı kullanımından gelir: ilgisiz görev kanıt sayılmaz', () => {
    const impact = rowOf(matrix, 'impact');
    const fluid = rowOf(matrix, 'fluid');
    // water-splash fluid sağlayıcılarını kullanır; tank-fire kullanmaz.
    expect(fluid.evidence.map((e) => e.id)).toContain('water-splash');
    expect(fluid.evidence.map((e) => e.id)).not.toContain('tank-fire');
    expect(impact.evidence.map((e) => e.id)).toContain('heavy-impact');
  });

  it('dinleme durumu kanıt kayıtlarından toplanır', () => {
    expect(rowOf(matrix, 'impact').listening).toBe('pending-human');
    expect(rowOf(matrix, 'speech').listening).toBe('none');
  });

  it('düşen görev regressed üretir — seviye research’e SİNMET', () => {
    const failing = deriveQualityMatrix({
      tasks,
      canaries,
      report: reportWith({ failTasks: tasks.map((t) => t.id) }),
      published,
    });
    const fallen = failing.rows.filter((r) => r.level === 'regressed');
    expect(fallen.length).toBeGreaterThan(0);
    expect(rowOf(failing, 'ui').level).toBe('regressed');
    expect(rowOf(failing, 'musical').level).toBe('regressed');
    // Canary kanıtı hâlâ geçen mekanizma 'canary'ye geriler, research'e düşmez.
    expect(rowOf(failing, 'impact').level).toBe('canary');
  });

  it('canary düşünce kabulü olan görevli mekanizma seviyesini korur, kanıt düşüşü görünür', () => {
    const every = deriveQualityMatrix({
      tasks,
      canaries,
      report: reportWith({ failCanaries: canaries.map((c) => c.id), reviews: ACCEPT_ALL }),
      published,
    });
    const contact = rowOf(every, 'impact');
    expect(contact.level).toBe('production-ready');
    expect(contact.evidence.some((e) => e.kind === 'canary' && !e.pass)).toBe(true);
  });

  it('insan incelemesi matrise yansır (heard-problem öncelikli)', () => {
    const reviewed = deriveQualityMatrix({
      tasks,
      canaries,
      report: reportWith({ reviews: { 'heavy-impact': 'heard-problem' } }),
      published,
    });
    expect(rowOf(reviewed, 'impact').listening).toBe('heard-problem');
  });
});

describe('production-ready üç kanıt ister', () => {
  it('insan kabulü + yayın kanıtı + geçen görev → production-ready', () => {
    const m = deriveQualityMatrix({
      tasks,
      canaries,
      report: reportWith({ reviews: ACCEPT_ALL }),
      published,
    });
    for (const mech of ['impact', 'explosion', 'musical', 'ui'] as const) {
      const row = rowOf(m, mech);
      expect(row.level).toBe('production-ready');
      expect(row.published.length).toBeGreaterThan(0);
    }
  });

  it('yayın manifesti yoksa kabul tek başına yetmez', () => {
    const m = deriveQualityMatrix({
      tasks,
      canaries,
      report: reportWith({ reviews: ACCEPT_ALL }),
      published: [],
    });
    expect(m.rows.some((r) => r.level === 'production-ready')).toBe(false);
    expect(rowOf(m, 'impact').level).toBe('benchmarked');
  });

  it('bayat kabul statüyü düşürür: eski sürüm beyanı pending-human sayılır', () => {
    // Sürüm uyuşmazlığında reviews → pending-human indirgemesi
    // benchmark.test.ts'de kanıtlı; burada rapordaki düşmüş durum sınanır.
    const accepted = deriveQualityMatrix({
      tasks,
      canaries,
      report: reportWith({ reviews: { 'heavy-impact': 'heard-acceptable' } }),
      published,
    });
    expect(rowOf(accepted, 'impact').level).toBe('production-ready');
    const stale = deriveQualityMatrix({
      tasks,
      canaries,
      report: reportWith({}),
      published,
    });
    expect(rowOf(stale, 'impact').level).toBe('benchmarked');
  });
});

describe('matris dürüstlüğü', () => {
  it('production-ready satırının kabulü geçen bir görevden gelir', () => {
    const m = deriveQualityMatrix({
      tasks,
      canaries,
      report: reportWith({ reviews: ACCEPT_ALL }),
      published,
    });
    for (const row of m.rows.filter((r) => r.level === 'production-ready')) {
      expect(
        row.evidence.some(
          (e) => e.kind === 'benchmark' && e.pass && e.review === 'heard-acceptable',
        ),
      ).toBe(true);
    }
  });

  it('seviye sözlüğü beklenen kapalı kümedir', () => {
    const levels: readonly CapabilityLevel[] = [
      'production-ready',
      'benchmarked',
      'canary',
      'regressed',
      'research',
      'pipeline',
      'unsupported',
    ];
    const m = deriveQualityMatrix({ tasks, canaries, report: reportWith({}), published });
    for (const row of m.rows) expect(levels).toContain(row.level);
  });
});
