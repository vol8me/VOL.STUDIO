import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHECK_KINDS,
  evaluateChecks,
  type CheckResult,
  type MechanicalCheckV1,
} from '../../src/analysis/checks';
import { analyzeAudio } from '../../src/analysis/report';
import { AudioParamError } from '../../src/guard/errors';
import { materialize } from '../../src/program/dimensions';
import { renderProgram } from '../../src/program/render';
import { REFERENCE_MIX_ID } from '../../src/music/stem';
import {
  BENCHMARKS_ROOT,
  benchmarkReviews,
  loadBenchmarkTasks,
  recordBenchmarkReview,
  runBenchmarks,
  validateBenchmarkTask,
  type BenchmarkPartV1,
  type BenchmarkTaskV1,
} from '../../src/protocol/benchmark';
import { hashPcm } from '../../src/kernel/canonical';
import { runTasks } from '../../src/protocol/parallel';
import type { BenchmarkPartOutput } from '../../src/protocol/parallelTasks';
import { checkMusic } from '../../src/protocol/music';
import { repoRenderCache } from '../../src/protocol/renderCacheStore';
import { repoSampleResolver } from '../../src/protocol/samples';
import { withRenderSession } from '../../src/kernel/session';
import { edited } from '../support/json';
import { createTestRepo, type TestRepo } from '../protocol/repo';
import { CORPUS_TIMEOUT, PIPELINE_TIMEOUT, RENDER_TIMEOUT } from '../support/timeouts';

/**
 * Sürümlü benchmark derlemi: 14 görev + 19 canary tek raporda. Mekanik
 * kriterler gerçek davranışı kilitler; "kalite" ya da "organik" kanıtı
 * DEĞİLDİR ve dinleme durumu yalnız insan beyanıyla değişir.
 */
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const IDS = [
  'ambience-loop',
  'arcade-theme',
  'creature-vocal',
  'electrical-charge',
  'heavy-impact',
  'metal-scrape',
  'motor-acceleration',
  'music-cue',
  'retro-arcade-sfx',
  'snake-hiss',
  'steam',
  'tank-fire',
  'ui-feedback',
  'water-splash',
];

const mechanical = (part: BenchmarkPartV1): MechanicalCheckV1[] =>
  part.expectations.filter((e): e is MechanicalCheckV1 =>
    (CHECK_KINDS as readonly string[]).includes(e.kind),
  );

/** `benchmark-part` göreviyle aynı saf yol: render + mekanik kriterler. */
function runPart(repoRoot: string, task: BenchmarkTaskV1, part: BenchmarkPartV1) {
  if (part.source.kind === 'music') throw new Error('müzik parçası bu yardımcıyla koşmaz');
  const program = materialize(part.source, [], {});
  const render = renderProgram(program, { samples: repoSampleResolver(repoRoot) });
  const report = analyzeAudio(render.channels, render.sampleRate, 'source-pcm');
  return {
    checks: evaluateChecks(mechanical(part), render, report),
    pcmHash: hashPcm(render.channels, render.sampleRate),
  };
}

const taskDoc = (id: string): unknown =>
  JSON.parse(readFileSync(join(REPO, BENCHMARKS_ROOT, `${id}.json`), 'utf8'));

const failingKinds = (
  checks: readonly ({ kind: string; pass: boolean } | CheckResult)[],
): string[] => checks.filter((c) => !c.pass).map((c) => ('check' in c ? c.check.kind : c.kind));

describe('benchmark görev derlemi (gerçek depo)', () => {
  const tasks = loadBenchmarkTasks(REPO);

  it('14 görev sürümlü, kategorili, rehberli ve üç kaynak türünü de kapsar', () => {
    expect(tasks.map((t) => t.id)).toEqual(IDS);
    const kinds = new Set<string>();
    for (const t of tasks) {
      expect(t.version).toBeGreaterThanOrEqual(1);
      expect(t.listeningGuide.length).toBeGreaterThan(0);
      for (const part of t.parts) {
        kinds.add(part.source.kind);
        // Şema zaten zorlar; burada niyeti kilitleriz: her parça temel sağlık üçlüsünü taşır.
        for (const required of ['asset-policy', 'clipping', 'clicks']) {
          expect(
            part.expectations.filter((e) => e.kind === required).length,
            `${t.id}/${part.id}: ${required}`,
          ).toBe(1);
        }
      }
    }
    expect([...kinds].sort()).toEqual(['archetype', 'music', 'program']);
  });

  it(
    'tek rapor: 19 canary + 14 görev mekanik kriterlerde geçer',
    () =>
      withRenderSession({ cache: repoRenderCache(REPO) }, () => {
        const report = runBenchmarks(REPO);
        expect(report.canaries).toHaveLength(19);
        expect(report.tasks.map((t) => t.id)).toEqual(IDS);
        for (const c of report.canaries) {
          expect(failingKinds(c.checks), `canary ${c.id}`).toEqual([]);
          expect(['pending-human', 'heard-acceptable', 'heard-problem']).toContain(c.review);
        }
        for (const t of report.tasks) {
          expect(t.review).toBe('pending-human');
          for (const p of t.parts) {
            expect(failingKinds(p.checks), `${t.id}/${p.id}`).toEqual([]);
            expect(p.programHash).toMatch(/^sha256:[0-9a-f]{64}$/);
            expect(p.pcmHash).toMatch(/^sha256:[0-9a-f]{64}$/);
          }
        }
      }),
    CORPUS_TIMEOUT,
  );

  it.each(['ui-feedback', 'retro-arcade-sfx', 'water-splash'])(
    '%s: seri ve worker yolu aynı çıktıyı verir (benchmark-part eşliği)',
    (id) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) throw new Error(id);
      const inputs = task.parts.map((part) => {
        if (part.source.kind === 'music') throw new Error(`${id} müzik parçası içeremez`);
        return {
          key: `${task.id}/${part.id}`,
          program: materialize(part.source, [], {}),
          checks: mechanical(part),
          withPcm: true,
        };
      });
      const serial = runTasks<BenchmarkPartOutput>(REPO, 'benchmark-part', inputs, 1);
      const parallel = runTasks<BenchmarkPartOutput>(REPO, 'benchmark-part', inputs, 3);
      expect(parallel).toEqual(serial);
    },
    RENDER_TIMEOUT,
  );

  it('insan dinlemesi uydurulmaz: bütün görev incelemeleri pending-human', () => {
    expect(benchmarkReviews(REPO).map((r) => [r.id, r.status, r.note])).toEqual(
      IDS.map((id) => [id, 'pending-human', null]),
    );
  });
});

describe('benchmark kriterleri gerçek davranışı ayırt eder', () => {
  const tasks = loadBenchmarkTasks(REPO);
  const task = (id: string): BenchmarkTaskV1 => {
    const t = tasks.find((x) => x.id === id);
    if (!t) throw new Error(id);
    return t;
  };

  it('motorun rpm eğrisi düzleşince yükselen kontur beklentisi düşer', () => {
    const mutated = validateBenchmarkTask(
      edited(taskDoc('motor-acceleration'), [
        ['parts', 0, 'source', 'program', 'gestures', 'rev', 'points'],
        [
          [0, 2400],
          [4, 2400],
        ],
      ]),
    );
    const { checks } = runPart(REPO, mutated, mutated.parts[0]);
    expect(failingKinds(checks)).toContain('pitch-contour');
  });

  it('hata sesinin eğrisi ters çevrilince pencereli perde beklentisi düşer', () => {
    const mutated = validateBenchmarkTask(
      edited(taskDoc('ui-feedback'), [
        ['parts', 1, 'source', 'program', 'gestures', 'down', 'points'],
        [
          [0, 150],
          [0.28, 420],
        ],
      ]),
    );
    const { checks } = runPart(REPO, mutated, mutated.parts[1]);
    expect(failingKinds(checks)).toContain('pitch');
  });

  it('gövde vuruşu zil modeline dönünce karanlık ve sub beklentileri düşer', () => {
    const mutated = validateBenchmarkTask(
      edited(taskDoc('tank-fire'), [
        ['parts', 0, 'source', 'program', 'layers', 1, 'source', 'params', 'model'],
        'hat',
      ]),
    );
    const { checks } = runPart(REPO, mutated, mutated.parts[0]);
    expect(failingKinds(checks)).toContain('descriptor');
    expect(failingKinds(checks)).toContain('band-dominance');
  });

  it(
    'tıslama kriterleri buhar render’ını, darbe kriterleri sürtme render’ını reddeder',
    () => {
      // Aynı hava-akımı ailesinden iki doku: kriterler birbirinin çıktısını kabul etmemeli.
      const hiss = runPart(REPO, task('snake-hiss'), task('snake-hiss').parts[0]);
      const steamSource = task('steam').parts[0].source;
      if (steamSource.kind === 'music') throw new Error('steam müzik olamaz');
      const steamRender = renderProgram(materialize(steamSource, [], {}), {
        samples: repoSampleResolver(REPO),
      });
      const steamReport = analyzeAudio(steamRender.channels, steamRender.sampleRate, 'source-pcm');
      const hissOnSteam = evaluateChecks(
        mechanical(task('snake-hiss').parts[0]),
        steamRender,
        steamReport,
      );
      expect(failingKinds(hissOnSteam).length).toBeGreaterThan(0);

      const scrapeSource = task('metal-scrape').parts[0].source;
      if (scrapeSource.kind === 'music') throw new Error('metal-scrape müzik olamaz');
      const scrapeRender = renderProgram(materialize(scrapeSource, [], {}), {
        samples: repoSampleResolver(REPO),
      });
      const scrapeReport = analyzeAudio(
        scrapeRender.channels,
        scrapeRender.sampleRate,
        'source-pcm',
      );
      const impactOnScrape = evaluateChecks(
        mechanical(task('tank-fire').parts[0]),
        scrapeRender,
        scrapeReport,
      );
      expect(failingKinds(impactOnScrape).length).toBeGreaterThan(0);
      expect(hiss.pcmHash).not.toBe(hashPcm(scrapeRender.channels, scrapeRender.sampleRate));
    },
    RENDER_TIMEOUT,
  );

  it(
    'müzik programındaki anlamlı değişiklik PCM kimliğini değiştirir',
    () => {
      const mutated = validateBenchmarkTask(
        edited(taskDoc('arcade-theme'), [
          ['parts', 0, 'source', 'program', 'instruments', 0, 'source', 'patch', 'waveform'],
          'sawtooth',
        ]),
      );
      const mixOf = (t: BenchmarkTaskV1) => {
        const src = t.parts[0].source as Extract<BenchmarkPartV1['source'], { kind: 'music' }>;
        const check = checkMusic(REPO, { brief: src.brief, program: src.program, themeBook: null });
        return check.rendered.find((r) => r.stem === REFERENCE_MIX_ID)?.pcmHash;
      };
      const original = mixOf(task('arcade-theme'));
      const changed = mixOf(mutated);
      expect(changed).not.toBe(original);
    },
    PIPELINE_TIMEOUT,
  );
});

describe('benchmark inceleme kaydı', () => {
  let repo: TestRepo;
  beforeEach(() => {
    repo = createTestRepo();
    mkdirSync(join(repo.root, BENCHMARKS_ROOT), { recursive: true });
    cpSync(
      join(REPO, BENCHMARKS_ROOT, 'ui-feedback.json'),
      join(repo.root, BENCHMARKS_ROOT, 'ui-feedback.json'),
    );
  });
  afterEach(() => repo.cleanup());

  it('beyan not ister; görev sürümü artınca inceleme bayatlar ve pending-human sayılır', () => {
    expect(benchmarkReviews(repo.root)).toEqual([
      { id: 'ui-feedback', status: 'pending-human', version: 1, note: null, stale: false },
    ]);
    expect(() => recordBenchmarkReview(repo.root, 'ui-feedback', 'heard-acceptable', null)).toThrow(
      /not ister/,
    );
    expect(() => recordBenchmarkReview(repo.root, 'yok', 'heard-problem', 'x')).toThrow(
      /benchmark görevi yok/,
    );
    recordBenchmarkReview(repo.root, 'ui-feedback', 'heard-problem', 'test beyanı');
    expect(benchmarkReviews(repo.root)[0]).toMatchObject({
      status: 'heard-problem',
      stale: false,
    });

    const file = join(repo.root, BENCHMARKS_ROOT, 'ui-feedback.json');
    writeFileSync(
      file,
      JSON.stringify({ ...(JSON.parse(readFileSync(file, 'utf8')) as object), version: 2 }),
    );
    expect(benchmarkReviews(repo.root)[0]).toMatchObject({
      status: 'pending-human',
      stale: true,
    });
  });

  it('dosya adı kimlikle eşleşmeli; bilinmeyen alan ve şema ihlalleri reddedilir', () => {
    cpSync(
      join(REPO, BENCHMARKS_ROOT, 'ui-feedback.json'),
      join(repo.root, BENCHMARKS_ROOT, 'bip.json'),
    );
    expect(() => loadBenchmarkTasks(repo.root)).toThrow(/ui-feedback\.json olmalı/);

    expect(() => validateBenchmarkTask(edited(taskDoc('ui-feedback'), [['extra'], 1]))).toThrow(
      AudioParamError,
    );
    // Müzik dışı parçada müzik kriteri yoktur.
    expect(() =>
      validateBenchmarkTask(
        edited(taskDoc('ui-feedback'), [['parts', 0, 'expectations', 0], { kind: 'music-qa' }]),
      ),
    ).toThrow(AudioParamError);
    // Temel sağlık üçlüsü eksikse parça reddedilir.
    expect(() =>
      validateBenchmarkTask(
        edited(taskDoc('ui-feedback'), [
          ['parts', 0, 'expectations'],
          [{ kind: 'descriptor', descriptor: 'durationSeconds', max: 1 }],
        ]),
      ),
    ).toThrow(AudioParamError);
  });
});
