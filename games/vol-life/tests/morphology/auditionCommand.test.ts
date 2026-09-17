import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildFromRecords,
  parseCandidateRecords,
  risksOf,
  type CandidateRecord,
} from '@/../scripts/morphology/auditionCommand';
import { parseAuditionCatalog } from '@/config/auditionCatalog';
import { particleConfig } from '@/config/particles';
import { serializeSubstrateCandidate } from '@/config/candidate';
import { candidateVariant } from '../support/auditionCatalogFixture';

const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');

function record(index: number, overrides: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    index,
    genome: serializeSubstrateCandidate(candidateVariant(0.9 + index / 1000)),
    primary: 'DYNAMIC_STRUCTURED',
    structured: true,
    phaseDistribution: { DYNAMIC_STRUCTURED: 4 },
    metrics: {
      clusteredFraction: 0.7 + index / 100,
      clusterCount: 2 + index,
      clusterCompactness: 0.7,
      clusterAnisotropy: 0.3,
      meanSpeed: 0.05 * index,
      maxSpeed: 2,
      retention: 0.95,
      radialStructure: 0.3,
    },
    ...overrides,
  };
}

const context = {
  corpusId: 'corpus-v1',
  seeds: [11, 22, 33],
  sourceRevision: '0'.repeat(40),
  sourceDirty: false,
};

describe('audition komutu', () => {
  it('kayıt dosyası boşsa kısa liste üretilmez', () => {
    expect(() => parseCandidateRecords('   \n\n')).toThrow(RangeError);
  });

  /* Yapısal aday yoksa katalog ÜRETİLMEZ; boş audition "eleme yapıldı" yalanıdır. */
  it('yapısal aday yoksa katalog üretilmez', () => {
    const records = [0, 1, 2].map((index) => record(index, { structured: false }));
    expect(() => buildFromRecords(records, context)).toThrow(RangeError);
  });

  it('riskler ölçülen sayılardan türer', () => {
    expect(risksOf(record(0, { metrics: { ...record(0).metrics, retention: 0.6 } }))).toContain(
      'madde tutma %60',
    );
    expect(risksOf(record(0, { metrics: { ...record(0).metrics, clusterCount: 1 } }))).toContain(
      'tek kümeye çöküyor',
    );
    expect(risksOf(record(0))).toEqual([]);
  });

  it('seed’ler arası faz tutarsızlığı risk olarak yazılır', () => {
    const risks = risksOf(record(0, { phaseDistribution: { GAS: 2, DYNAMIC_STRUCTURED: 2 } }));
    expect(risks).toContain("seed'ler arası faz tutarsız (2 faz)");
  });

  it('CLI gerçek kayıt dosyasından katalog yazar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vol-life-audition-'));
    try {
      const recordsPath = join(dir, 'records.jsonl');
      const records = [0, 1, 2, 3].map((index) => record(index));
      writeFileSync(recordsPath, records.map((entry) => JSON.stringify(entry)).join('\n'), 'utf8');

      execFileSync(
        'pnpm',
        [
          'exec',
          'tsx',
          'scripts/morphology/cli.ts',
          'audition',
          '--out',
          dir,
          '--from',
          recordsPath,
        ],
        { cwd: PACKAGE_ROOT, stdio: 'pipe' },
      );

      const catalog = parseAuditionCatalog(
        readFileSync(join(dir, 'audition-catalog.json'), 'utf8'),
        particleConfig.radiusUnits,
      );
      expect(catalog.corpusId).toBe('corpus-v1');
      expect(catalog.seeds).toHaveLength(3);
      expect(catalog.entries.length).toBeGreaterThanOrEqual(3);
      expect(catalog.sourceRevision).toMatch(/^[0-9a-f]{7,40}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('kayıt dosyası yoksa komut REDDEDER', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vol-life-audition-'));
    try {
      expect(() =>
        execFileSync(
          'pnpm',
          [
            'exec',
            'tsx',
            'scripts/morphology/cli.ts',
            'audition',
            '--out',
            dir,
            '--from',
            join(dir, 'yok.jsonl'),
          ],
          { cwd: PACKAGE_ROOT, stdio: 'pipe' },
        ),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
