import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_REPORT_SCHEMA,
  deriveQualityMatrix,
  loadBenchmarkTasks,
  loadCanaries,
  type BenchmarkReportV1,
  type CapabilityLevel,
  type QualityMatrixV1,
} from '../../src/protocol';
import { MECHANISMS } from '../../src/program/ontology';

/**
 * `audio:capabilities` matrisinin davranış sözleşmesi: seviye elle
 * yazılmaz, sürümlü görev/canary kayıtlarından VE fixture kaynaklarındaki
 * gerçek sağlayıcı kullanımından türetilir. Sentetik raporla koşar —
 * render gerekmez, karar mantığı yalıtılır.
 */
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const tasks = loadBenchmarkTasks(REPO);
const canaries = loadCanaries(REPO);

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

function rowOf(matrix: QualityMatrixV1, mechanism: string) {
  const row = matrix.rows.find((r) => r.mechanism === mechanism);
  expect(row, `${mechanism} satırı`).toBeDefined();
  return row!;
}

describe('kalite matrisi türetmesi', () => {
  const matrix = deriveQualityMatrix({ tasks, canaries, report: reportWith({}) });

  it('her mekanizma tam bir satır üretir ve counts satırlarla tutarlıdır', () => {
    expect(matrix.schema).toBe('QualityMatrixV1');
    expect(matrix.rows).toHaveLength(MECHANISMS.length);
    const sum = Object.values(matrix.counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(matrix.rows.length);
  });

  it('geçen görev kanıtı mekanizmayı production-ready yapar', () => {
    expect(rowOf(matrix, 'impact').level).toBe('production-ready');
    expect(rowOf(matrix, 'explosion').level).toBe('production-ready');
    expect(rowOf(matrix, 'musical').level).toBe('production-ready');
    expect(rowOf(matrix, 'ui').level).toBe('production-ready');
  });

  it('yalnız canary kanıtı olan mekanizma canary seviyesinde kalır', () => {
    for (const mech of ['fire', 'vocal', 'sampled'] as const) {
      const row = rowOf(matrix, mech);
      expect(row.level).toBe('canary');
      expect(row.evidence.every((e) => e.kind === 'canary')).toBe(true);
    }
  });

  it('sağlayıcısı olup kanıtı olmayan mekanizma research kalır', () => {
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
    });
    const fallen = failing.rows.filter((r) => r.level === 'regressed');
    expect(fallen.length).toBeGreaterThan(0);
    expect(rowOf(failing, 'ui').level).toBe('regressed');
    expect(rowOf(failing, 'musical').level).toBe('regressed');
    // Canary kanıtı hâlâ geçen mekanizma 'canary'ye geriler, research'e düşmez.
    expect(rowOf(failing, 'impact').level).toBe('canary');
  });

  it('canary düşünce benchmark geçen mekanizma seviyesini korur, kanıt düşüşü görünür kalır', () => {
    const every = deriveQualityMatrix({
      tasks,
      canaries,
      report: reportWith({ failCanaries: canaries.map((c) => c.id) }),
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
    });
    expect(rowOf(reviewed, 'impact').listening).toBe('heard-problem');
  });
});

describe('matris dürüstlüğü', () => {
  it('production-ready satırı dinleme onayı İDDİA ETMEZ — listening ayrıdır', () => {
    const m = deriveQualityMatrix({ tasks, canaries, report: reportWith({}) });
    for (const row of m.rows.filter((r) => r.level === 'production-ready')) {
      expect(['pending-human', 'none']).toContain(row.listening);
    }
  });

  it('seviye sözlüğü beklenen kapalı kümedir', () => {
    const levels: readonly CapabilityLevel[] = [
      'production-ready',
      'canary',
      'regressed',
      'research',
      'pipeline',
      'unsupported',
    ];
    const m = deriveQualityMatrix({ tasks, canaries, report: reportWith({}) });
    for (const row of m.rows) expect(levels).toContain(row.level);
  });
});
