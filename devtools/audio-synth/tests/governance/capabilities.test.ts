import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_REPORT_SCHEMA,
  deriveQualityMatrix,
  loadBenchmarkTasks,
  loadCanaries,
  type BenchmarkReportV2,
  type QualityMatrixV2,
} from '../../src/protocol';
import { hashCanonical } from '../../src/kernel/canonical';
import { MECHANISMS } from '../../src/program/ontology';

const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const tasks = loadBenchmarkTasks(REPO);
const canaries = loadCanaries(REPO);
const published = [{ manifest: 'publication.json', tags: new Set(['mechanism:impact']) }];

function reportWith(args: {
  readonly failTasks?: readonly string[];
  readonly failCanaries?: readonly string[];
}): BenchmarkReportV2 {
  const failT = new Set(args.failTasks ?? []);
  const failC = new Set(args.failCanaries ?? []);
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
      sourceHash: hashCanonical(t),
    })),
    canaries: canaries.map((c) => ({
      id: c.id,
      version: c.version,
      programHash: 'sha256:test',
      pcmHash: 'sha256:test',
      pass: !failC.has(c.id),
      checks: [],
      sourceHash: hashCanonical(c),
    })),
  };
}

function rowOf(matrix: QualityMatrixV2, mechanism: string) {
  const row = matrix.rows.find((r) => r.mechanism === mechanism);
  expect(row, `${mechanism} satırı`).toBeDefined();
  return row!;
}

describe('kalite matrisi türetmesi', () => {
  const matrix = deriveQualityMatrix({ tasks, canaries, report: reportWith({}), published });

  it('her mekanizma tam bir satır üretir ve counts satırlarla tutarlıdır', () => {
    expect(matrix.schema).toBe('QualityMatrixV2');
    expect(matrix.rows).toHaveLength(MECHANISMS.length);
    const sum = Object.values(matrix.counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(matrix.rows.length);
  });

  it('geçen görev kanıtı tek başına yalnız benchmarked üretir — kabul kaydı yok', () => {
    for (const mech of ['impact', 'explosion', 'musical', 'ui'] as const) {
      const row = rowOf(matrix, mech);
      expect(row.level).toBe('benchmarked');
      expect(row.evidence.some((e) => e.kind === 'benchmark' && e.pass)).toBe(true);
      expect(row.published).toEqual([]);
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
});

describe('güncel teknik kabul', () => {
  it('kayıtlı rapor ve manifest etiketi tek başına üretim kabulü oluşturmaz', () => {
    const report = reportWith({});
    const matrix = deriveQualityMatrix({ tasks, canaries, report, published });
    expect(rowOf(matrix, 'impact').level).toBe('benchmarked');
    expect(matrix.rows.some((r) => r.level === 'production-ready')).toBe(false);
    expect(rowOf(matrix, 'impact')).not.toHaveProperty('listening');
    expect(rowOf(matrix, 'impact').evidence[0]).not.toHaveProperty('review');
  });
  it('bayat görev sürümü geçen görev olarak sayılamaz', () => {
    const report = reportWith({});
    const matrix = deriveQualityMatrix({
      tasks: tasks.map((t) => ({ ...t, version: t.version + 1 })),
      canaries,
      report,
      published,
    });
    expect(rowOf(matrix, 'ui').level).toBe('regressed');
  });
});
