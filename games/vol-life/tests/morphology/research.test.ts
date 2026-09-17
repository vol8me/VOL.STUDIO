import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSubstrateCandidate, serializeSubstrateCandidate } from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';
import { CheckpointStore, estimateProgress, formatEta } from '@/../scripts/morphology/checkpoint';
import { defaultClusterConfig } from '@/../scripts/morphology/clusterTracker';
import { defaultMetricsConfig } from '@/../scripts/morphology/metrics';
import { defaultPerturbationConfig } from '@/../scripts/morphology/perturbation';
import { defaultPhaseConfig } from '@/../scripts/morphology/phaseClassifier';
import { createGitProvider, readSourceState } from '@/../scripts/morphology/sourceState';
import { runSeedUnits, type PoolUnit } from '@/../scripts/morphology/workerPool';

/*
 * E12: paralel koşunun seri koşuyla aynı sonucu vermesi, checkpoint/resume,
 * clean-source zorunluluğu ve ölçülmüş bütçe.
 */
const smallSubstrate = {
  ...substrateConfig,
  particles: { ...substrateConfig.particles, capacity: 32 },
};

const temporaryDirs: string[] = [];

afterEach(() => {
  while (temporaryDirs.length > 0) {
    const dir = temporaryDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirs.push(dir);
  return dir;
}

function makeUnits(seeds: readonly number[]): PoolUnit[] {
  return seeds.map((seed) => ({
    workId: `qualification:test:${seed}`,
    input: {
      substrate: smallSubstrate,
      candidateText: serializeSubstrateCandidate(defaultSubstrateCandidate),
      seed,
      tickCount: 20,
      sampleInterval: 10,
      metrics: defaultMetricsConfig,
      cluster: defaultClusterConfig,
      phase: defaultPhaseConfig,
      perturbation: defaultPerturbationConfig,
      perturbationSpecs: [],
    },
  }));
}

describe('Paralel shard koşusu (E12)', () => {
  it('seri, 2 ve 4 worker aynı sonucu bayt düzeyinde verir', async () => {
    const units = makeUnits([1, 2, 3, 4, 5, 6]);

    const serial = await runSeedUnits(units, 1);
    const two = await runSeedUnits(units, 2);
    const four = await runSeedUnits(units, 4);

    expect(JSON.stringify(two)).toBe(JSON.stringify(serial));
    expect(JSON.stringify(four)).toBe(JSON.stringify(serial));
  }, 120_000);

  it('birleştirme iş kimliğine göre sıralıdır, bitiş sırasına göre değil', async () => {
    const units = makeUnits([9, 3, 7, 1]);

    const results = await runSeedUnits(units, 3);

    expect(results.map((result) => result.workId)).toEqual(
      [...results.map((result) => result.workId)].sort(),
    );
  }, 120_000);

  it('geçersiz worker sayısı reddedilir', async () => {
    await expect(runSeedUnits(makeUnits([1]), 0)).rejects.toThrow(RangeError);
  });
});

describe('Checkpoint ve resume (E12)', () => {
  it('yarıda kesilen koşu kaldığı yerden tamamlanır', async () => {
    const dir = makeTempDir('vol-life-checkpoint-');
    const file = join(dir, 'run.jsonl');
    const units = makeUnits([1, 2, 3, 4]);
    const full = await runSeedUnits(units, 1);

    // Kesinti: ilk iki birim yazıldı, sonra koşu düştü.
    const first = new CheckpointStore<(typeof full)[number]['output']>(file, 'digest-a');
    for (const result of full.slice(0, 2)) first.record(result.workId, result.output);

    // Devam: kalan birimler koşulur, tamamlananlar diskten gelir.
    const resumed = new CheckpointStore<(typeof full)[number]['output']>(file, 'digest-a');
    expect(resumed.completedCount).toBe(2);
    const pending = units.filter((unit) => !resumed.has(unit.workId));
    expect(pending).toHaveLength(2);
    const computed = await runSeedUnits(pending, 1);
    for (const result of computed) resumed.record(result.workId, result.output);

    const merged = units.map((unit) => resumed.get(unit.workId));
    expect(JSON.stringify(merged)).toBe(JSON.stringify(full.map((result) => result.output)));
  }, 120_000);

  it('farklı config digest’inden kalan kayıt kullanılmaz', async () => {
    const dir = makeTempDir('vol-life-checkpoint-');
    const file = join(dir, 'run.jsonl');
    const units = makeUnits([1]);
    const computed = await runSeedUnits(units, 1);

    const written = new CheckpointStore<(typeof computed)[number]['output']>(file, 'digest-a');
    written.record(computed[0].workId, computed[0].output);

    const other = new CheckpointStore(file, 'digest-b');
    expect(other.completedCount).toBe(0);
    expect(other.has(computed[0].workId)).toBe(false);
  }, 120_000);

  it('ETA ölçülen birim maliyetinden çıkar', () => {
    const estimate = estimateProgress(4, 10, 2000);

    expect(estimate.meanMsPerUnit).toBe(500);
    expect(estimate.remainingMs).toBe(3000);
    expect(formatEta(estimate)).toContain('4/10');
    expect(formatEta(estimateProgress(0, 10, 0))).toContain('ölçülmedi');
  });
});

describe('Clean-source zorunluluğu (E12)', () => {
  it('temiz ağaç promotion’a uygundur', () => {
    const state = readSourceState({
      revision: () => 'b'.repeat(40),
      porcelainStatus: () => '',
    });

    expect(state.dirty).toBe(false);
    expect(state.eligibleForPromotion).toBe(true);
  });

  it('kirli ağaçta eligibility false olur', () => {
    const state = readSourceState({
      revision: () => 'b'.repeat(40),
      porcelainStatus: () => ' M games/vol-life/src/config/genome.ts\n?? yeni.ts\n',
    });

    expect(state.dirty).toBe(true);
    expect(state.eligibleForPromotion).toBe(false);
    expect(state.dirtyPaths).toContain('games/vol-life/src/config/genome.ts');
  });

  it('research-out kirliliği koşuyu diskalifiye etmez', () => {
    const state = readSourceState({
      revision: () => 'b'.repeat(40),
      porcelainStatus: () => '?? research-out/run.jsonl\n',
    });

    expect(state.dirty).toBe(false);
  });

  /* Yeniden adlandırmada İKİ yol da sayılır; hedefe bakmak kirliliği gizlerdi. */
  it('yeniden adlandırılan dosya kirlilik sayılır', () => {
    const state = readSourceState({
      revision: () => 'b'.repeat(40),
      porcelainStatus: () => 'R  src/a.ts -> research-out/a.ts\n',
    });

    expect(state.dirty).toBe(true);
    expect(state.dirtyPaths).toContain('src/a.ts');
  });

  it('okunamayan revizyon sessizce geçmez', () => {
    expect(() =>
      readSourceState({ revision: () => 'HEAD yok', porcelainStatus: () => '' }),
    ).toThrow(RangeError);
  });

  /* Sahte sağlayıcı yetmez: gerçek bir depoda da aynı cevabı vermeli. */
  it('gerçek geçici depoda temiz ve kirli durumu ayırt eder', () => {
    const dir = makeTempDir('vol-life-git-');
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
    };
    writeFileSync(join(dir, 'a.txt'), 'bir\n');
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    git('add', 'a.txt');
    git('commit', '-qm', 'ilk');

    const clean = readSourceState(createGitProvider(dir));
    expect(clean.dirty).toBe(false);
    expect(clean.revision).toMatch(/^[0-9a-f]{40}$/);

    writeFileSync(join(dir, 'a.txt'), 'iki\n');
    const dirty = readSourceState(createGitProvider(dir));
    expect(dirty.dirty).toBe(true);
    expect(dirty.eligibleForPromotion).toBe(false);
    expect(dirty.dirtyPaths).toContain('a.txt');
  });
});
