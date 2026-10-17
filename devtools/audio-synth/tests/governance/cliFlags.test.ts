import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCanaryCommand } from '../../scripts/lib/canaryCommands';
import { runBenchmarkCommand, runCapabilitiesCommand } from '../../scripts/lib/benchmarkCommands';
import { runRegressionCommand } from '../../scripts/lib/regressionCommands';
import { createTestRepo } from '../protocol/repo';
import { writeFileSync } from 'node:fs';
import { BOOLEAN_FLAGS, VALUE_FLAGS, parse } from '../../scripts/lib/args';

const SCRIPTS = resolve(import.meta.dirname, '../../scripts');

/** `audio:job` komutlarının koddan okuduğu bayrak adları. */
function readFlags(): Set<string> {
  const files = [
    join(SCRIPTS, 'audio-job.ts'),
    ...readdirSync(join(SCRIPTS, 'lib')).map((name) => join(SCRIPTS, 'lib', name)),
  ];
  const names = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/flags(?:\.(?:has|get)\(|, )'([a-z0-9-]+)'/g))
      names.add(match[1]);
    for (const match of text.matchAll(/(?:terms|positiveCount\(parsed,)\s*\(?'([a-z0-9-]+)'/g))
      names.add(match[1]);
  }
  return names;
}

describe('audio:job bayrakları', () => {
  it('okunan her bayrak bilinir, bilinen listede okunmayan bayrak kalmaz', () => {
    const known = new Set([...BOOLEAN_FLAGS, ...VALUE_FLAGS]);
    const used = readFlags();
    expect([...used].filter((name) => !known.has(name))).toEqual([]);
    expect([...known].filter((name) => !used.has(name))).toEqual([]);
  });

  it('yazım hatalı bayrak sessizce yok sayılmaz', () => {
    expect(() => parse(['publish', 'job-1', '--drfat'])).toThrow('bilinmeyen bayrak --drfat');
    expect(parse(['publish', 'job-1', '--draft']).flags.get('draft')).toBe(true);
  });
});

describe('kaldırılan kabul komutları', () => {
  it.each([
    ['canary', 'review', runCanaryCommand],
    ['benchmark', 'review', runBenchmarkCommand],
    ['regression', 'decide', runRegressionCommand],
    ['regression', 'decisions', runRegressionCommand],
  ] as const)('%s %s kayıtsız reddedilir', (command, sub, run) => {
    const repo = createTestRepo();
    try {
      expect(run(parse([command, sub]), repo.root)).toBe(1);
    } finally {
      repo.cleanup();
    }
  });
  it('eski benchmark raporu açık sürüm hatası verir', () => {
    const repo = createTestRepo();
    try {
      writeFileSync(join(repo.root, 'old.json'), JSON.stringify({ schema: 'BenchmarkReportV1' }));
      expect(() =>
        runCapabilitiesCommand(parse(['capabilities', '--from-report', 'old.json']), repo.root),
      ).toThrow(/BenchmarkReportV2/);
    } finally {
      repo.cleanup();
    }
  });
});

describe('kayıtlı rapor doğrulaması', () => {
  it('yeni sürüm etiketi eksik içeriği geçerli rapor yapmaz', () => {
    const repo = createTestRepo();
    try {
      writeFileSync(
        join(repo.root, 'broken.json'),
        JSON.stringify({ schema: 'BenchmarkReportV2' }),
      );
      expect(() =>
        runCapabilitiesCommand(parse(['capabilities', '--from-report', 'broken.json']), repo.root),
      ).toThrow(/engine/);
    } finally {
      repo.cleanup();
    }
  });
});
