import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runBenchmarks, BENCHMARKS_ROOT } from '../../src/protocol/benchmark';
import {
  qualityMatrix,
  deriveQualityMatrix,
  loadPublishedReferences,
} from '../../src/protocol/capabilities';
import {
  initJob,
  registerBrief,
  registerProgram,
  renderCandidate,
  analyzeCandidate,
  selectCandidate,
} from '../../src/protocol/job';
import { publishJob } from '../../src/protocol/publish';
import { loadBenchmarkTasks } from '../../src/protocol/benchmark';
import { createTestRepo, testBrief, testProgram, REFERENCE_TARGET, type TestRepo } from './repo';

let repo: TestRepo;
afterEach(() => repo?.cleanup());
function prepare() {
  repo = createTestRepo();
  const dir = join(repo.root, BENCHMARKS_ROOT);
  mkdirSync(dir, { recursive: true });
  const task = {
    schema: 'BenchmarkTaskV1',
    id: 'knock',
    version: 1,
    category: 'impact',
    title: 'Vuruş',
    purpose: 'Teknik kabul',
    listeningGuide: ['Kaynak ve teslim.'],
    parts: [
      {
        id: 'main',
        source: { kind: 'program', program: testProgram() },
        expectations: [
          { kind: 'asset-policy', assetClass: 'sfx' },
          { kind: 'clipping' },
          { kind: 'clicks', max: 0 },
        ],
      },
    ],
  };
  writeFileSync(join(dir, 'knock.json'), JSON.stringify(task));
  const loc = repo.loc();
  initJob(loc, { target: REFERENCE_TARGET });
  registerBrief(loc, testBrief());
  registerProgram(loc, testProgram());
  renderCandidate(loc);
  analyzeCandidate(loc);
  selectCandidate(loc, undefined, 'tek aday');
  const publication = publishJob(loc);
  return { publication, report: runBenchmarks(repo.root, { workers: 1 }) };
}
function noiseLevel(report: ReturnType<typeof runBenchmarks>) {
  return qualityMatrix(repo.root, report).rows.find((r) => r.mechanism === 'noise')?.level;
}

describe('üretim seviyesinin güncel teknik kanıtı', () => {
  it('review dosyası olmadan görev, yayın ve verify üretim seviyesini sağlar', () => {
    const { report } = prepare();
    expect(report.tasks[0].pass).toBe(true);
    expect(noiseLevel(report)).toBe('production-ready');
    expect(report.schema).toBe('BenchmarkReportV2');
    expect(report.tasks[0]).not.toHaveProperty('review');
    expect(existsSync(join(repo.root, BENCHMARKS_ROOT, 'reviews.json'))).toBe(false);
    expect(noiseLevel(JSON.parse(JSON.stringify(report)) as ReturnType<typeof runBenchmarks>)).toBe(
      'benchmarked',
    );
  });
  it('başarılı koşu raporunun değiştirilmesi üretim kabulünü kaldırır', () => {
    const { report } = prepare();
    const modified = report as unknown as { engine: { analyzer: number } };
    modified.engine.analyzer += 1;
    expect(noiseLevel(report)).toBe('benchmarked');
  });
  it('görev aynı sürümde değişse bile eski başarılı koşu üretim kanıtı olamaz', () => {
    const { report } = prepare();
    const file = join(repo.root, BENCHMARKS_ROOT, 'knock.json');
    const task = JSON.parse(readFileSync(file, 'utf8')) as {
      parts: { source: { program: { seed: number } } }[];
    };
    task.parts[0].source.program.seed = 17;
    writeFileSync(file, JSON.stringify(task));
    expect(noiseLevel(report)).toBe('regressed');
  });
  it('asset baytları bozulunca manifestin varlığı üretim kanıtı sayılmaz', () => {
    const { publication, report } = prepare();
    writeFileSync(join(repo.root, publication.manifest.asset.path), 'bozuk OGG');
    expect(noiseLevel(report)).toBe('benchmarked');
    expect(
      qualityMatrix(repo.root, report).rows.find((r) => r.mechanism === 'noise')?.published,
    ).toEqual([]);
  });
  it('PCM kimliği değişince mevcut manifest üretim kanıtı olmaktan çıkar', () => {
    const { publication, report } = prepare();
    const file = join(repo.root, publication.manifestPath);
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
      render: { pcm: { hash: string } };
    };
    manifest.render.pcm.hash = 'sha256:' + '0'.repeat(64);
    writeFileSync(file, JSON.stringify(manifest));
    expect(noiseLevel(report)).toBe('benchmarked');
  });
  it('önceden okunan yayın referansı disk bozulduktan sonra kullanılamaz', () => {
    const { publication, report } = prepare();
    const published = loadPublishedReferences(repo.root);
    writeFileSync(join(repo.root, publication.manifest.asset.path), 'bozuk OGG');
    const matrix = deriveQualityMatrix({
      tasks: loadBenchmarkTasks(repo.root),
      canaries: [],
      report,
      published,
    });
    expect(matrix.rows.find((r) => r.mechanism === 'noise')?.level).toBe('benchmarked');
  });
  it('verify kanıtının sağlayıcı etiketleri sonradan genişletilemez', () => {
    const { report } = prepare();
    const published = loadPublishedReferences(repo.root);
    (published[0].tags as Set<string>).add('mechanism:speech');
    const matrix = deriveQualityMatrix({
      tasks: loadBenchmarkTasks(repo.root),
      canaries: [],
      report,
      published,
    });
    expect(matrix.rows.find((r) => r.mechanism === 'noise')?.level).toBe('benchmarked');
  });
});
