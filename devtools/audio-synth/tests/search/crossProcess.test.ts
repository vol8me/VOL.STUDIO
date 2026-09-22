import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AcousticSearchReportV1 } from '../../src/search/report';
import { createTestRepo, type TestRepo } from '../protocol/repo';
import { reverseKeys, shellSpec } from './fixtures';

/**
 * İki BAĞIMSIZ süreç, iki ayrı depo: A spec'i olduğu gibi, B anahtarları ve
 * boyut dizisi ters çevrilmiş hâliyle koşar. Aynı aday sırası, kimlikleri,
 * program ve PCM özetleri — ve bayt bayt aynı rapor — beklenir.
 */
const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));
const TSX = join(PACKAGE, 'node_modules/.bin/tsx');
const CLI = join(PACKAGE, 'scripts/audio-job.ts');

let a: TestRepo;
let b: TestRepo;
beforeAll(() => {
  a = createTestRepo();
  b = createTestRepo();
  writeFileSync(join(a.root, 'spec.json'), JSON.stringify(shellSpec()));
  const flipped = reverseKeys(shellSpec()) as Record<string, unknown>;
  writeFileSync(
    join(b.root, 'spec.json'),
    JSON.stringify({ ...flipped, dimensions: [...(flipped.dimensions as unknown[])].reverse() }),
  );
});
afterAll(() => {
  a.cleanup();
  b.cleanup();
});

function cli(repo: TestRepo, ...args: string[]) {
  const res = spawnSync(TSX, [CLI, ...args], { cwd: repo.root, encoding: 'utf8' });
  expect(res.status, res.stderr).toBe(0);
  return JSON.parse(res.stdout) as Record<string, unknown>;
}

const reportOf = (repo: TestRepo) =>
  readFileSync(
    join(repo.root, 'devtools/audio-synth/audio-searches/shell-test/report.json'),
    'utf8',
  );

describe('arama — süreçler arası determinizm', () => {
  it('iki taze süreç aynı sırayı, kimlikleri, program ve PCM özetlerini üretir', () => {
    const planA = cli(a, 'search', 'plan', '--file', 'spec.json');
    const planB = cli(b, 'search', 'plan', '--file', 'spec.json');
    expect({ ...planB, timings: null }).toEqual({ ...planA, timings: null });

    cli(a, 'search', 'run', '--file', 'spec.json');
    cli(b, 'search', 'run', '--file', 'spec.json');
    const ra = JSON.parse(reportOf(a)) as AcousticSearchReportV1;
    const rb = JSON.parse(reportOf(b)) as AcousticSearchReportV1;
    const identity = (r: AcousticSearchReportV1) =>
      r.candidates.map((c) => [
        c.ordinal,
        c.candidateId,
        c.programHash,
        c.render?.pcmHash ?? null,
        c.state,
      ]);
    expect(identity(rb)).toEqual(identity(ra));
    expect(identity(ra).filter((row) => row[3] !== null)).toHaveLength(ra.candidates.length);
    expect(reportOf(b)).toBe(reportOf(a));
  }, 120_000);
});
