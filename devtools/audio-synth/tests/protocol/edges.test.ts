import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evaluateCheck, validateCheck } from '../../src/analysis/checks';
import { countOnsets, estimatePitch, estimatePulseRate } from '../../src/analysis/descriptors';
import {
  assessFamily,
  familyDistance,
  validateFamilyQualityPolicy,
  DEFAULT_FAMILY_QUALITY_POLICY,
} from '../../src/analysis/family';
import { analyzeAudio } from '../../src/analysis/report';
import { AudioParamError } from '../../src/guard/errors';
import { limitationRisks } from '../../src/program/limitations';
import { renderProgram } from '../../src/program/render';
import { resolveProgram } from '../../src/program/schema';
import { startAuditionServer } from '../../src/protocol/auditionServer';
import { validateCanary, validateReviews } from '../../src/protocol/canary';
import { prettyCanonicalJson } from '../../src/protocol/canonical';
import { ProtocolError } from '../../src/protocol/errors';
import { validateOrigin } from '../../src/protocol/origin';
import {
  exportSearchAudition,
  listSearches,
  loadSearch,
  promoteCandidate,
  recordDecision,
  runSearch,
  searchLabel,
  searchStatus,
  verifySearch,
  type SearchLocation,
} from '../../src/protocol/search';
import { shellSpec } from '../search/fixtures';
import { edited } from '../support/json';
import { createTestRepo, type TestRepo } from './repo';

const ROOT = 'devtools/audio-synth/audio-searches';
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError) return error.code;
    if (error instanceof AudioParamError) return `${error.path} ${error.issue}`;
    throw error;
  }
  return 'kabul edildi';
};

describe('arama protokolü — kenar dalları', () => {
  let repo: TestRepo;
  let loc: SearchLocation;
  const dir = () => join(repo.root, ROOT, 'shell-test');
  beforeEach(() => {
    repo = createTestRepo();
    loc = { repoRoot: repo.root, searchesRoot: ROOT, searchId: 'shell-test' };
  });
  afterEach(() => repo.cleanup());

  it('kimlik, yokluk ve başka aramaya ait rapor adıyla reddedilir', () => {
    expect(code(() => searchLabel({ ...loc, searchId: '../x' }))).toBe('path');
    expect(code(() => loadSearch(loc))).toBe('not-found');
    expect(listSearches(repo.root, ROOT)).toEqual([]);
    runSearch(
      repo.root,
      ROOT,
      shellSpec({
        constraints: [
          {
            kind: 'exclude',
            when: [{ dimension: 'layout', equals: 'membrane' }],
            reason: 'zar yok',
          },
        ],
      }),
    );
    writeFileSync(join(repo.root, ROOT, 'note.txt'), 'x');
    expect(listSearches(repo.root, ROOT)).toEqual(['shell-test']);
    cpSync(dir(), join(repo.root, ROOT, 'kopya'), { recursive: true });
    expect(code(() => loadSearch({ ...loc, searchId: 'kopya' }))).toBe('identity');
    expect(verifySearch(loc).ok).toBe(true);
  });

  it('eksik aday programı, raporda olmayan dosya, bayat ve bozuk seçim durumda görünür', () => {
    runSearch(repo.root, ROOT, shellSpec());
    const { report } = loadSearch(loc);
    const [first, second] = report.candidates
      .filter((c) => c.state === 'passed')
      .map((c) => c.candidateId as string);
    recordDecision(loc, first, { state: 'approved', by: 'agent', labels: [], note: null });
    rmSync(join(dir(), 'candidates', `${second}.json`));
    writeFileSync(join(dir(), 'candidates', 'stray.json'), '{}');
    const status = searchStatus(loc);
    expect(status.problems).toEqual([
      `aday programı yok: candidates/${second}.json`,
      'raporda olmayan dosya: candidates/stray.json',
    ]);
    expect(code(() => exportSearchAudition(loc))).toBe('identity');

    const selection = join(dir(), 'selection.json');
    const sel = JSON.parse(readFileSync(selection, 'utf8')) as Record<string, unknown>;
    writeFileSync(
      selection,
      prettyCanonicalJson({ ...sel, reportHash: `sha256:${'9'.repeat(64)}` }),
    );
    expect(searchStatus(loc).selection.state).toBe('stale');
    expect(searchStatus(loc).summary.approved).toBe(0);
    writeFileSync(selection, '{bozuk');
    expect(searchStatus(loc).selection.state).toBe('corrupt');
    expect(
      code(() =>
        recordDecision(loc, first, { state: 'approved', by: 'agent', labels: [], note: null }),
      ),
    ).toBe('corrupt');
  });

  it('terfi: olmayan ya da passed olmayan aday reddedilir', () => {
    runSearch(
      repo.root,
      ROOT,
      shellSpec({ filters: [{ kind: 'descriptor', descriptor: 'centroidHz', max: 450 }] }),
    );
    const job = repo.loc('shell');
    const filtered = loadSearch(loc).report.candidates.find((c) => c.state === 'filtered')
      ?.candidateId as string;
    expect(code(() => promoteCandidate(job, loc, 'c-0000000000000000'))).toBe('not-found');
    expect(code(() => promoteCandidate(job, loc, filtered))).toBe('invalid');
  });

  it('dinleme kopyası PCM’i rapordan saparsa yazılmaz (bayat)', () => {
    runSearch(repo.root, ROOT, shellSpec());
    const reportFile = join(dir(), 'report.json');
    const doc = JSON.parse(readFileSync(reportFile, 'utf8')) as {
      candidates: { render: { pcmHash: string } | null }[];
    };
    const target = doc.candidates.find((c) => c.render);
    if (!target?.render) throw new Error('render yok');
    target.render.pcmHash = `sha256:${'8'.repeat(64)}`;
    writeFileSync(reportFile, prettyCanonicalJson(doc));
    expect(code(() => exportSearchAudition(loc))).toBe('stale');
    expect(verifySearch(loc).checks.find((c) => c.name === 'reproduction')?.ok).toBe(false);
  });

  it('dinleme sunucusu IPv6 loopback’e de bağlanabilir; sabit dosyalar ve durum servis edilir', async (ctx) => {
    runSearch(repo.root, ROOT, shellSpec());
    const server = await startAuditionServer(loc, { host: '::1' }).catch(() => null);
    if (!server) return ctx.skip();
    try {
      expect(server.url).toMatch(/^http:\/\/\[::1\]:\d+\/$/);
      for (const path of ['app.js', 'app.css', 'api/state']) {
        const res = await fetch(`${server.url}${path}`);
        expect(res.status, path).toBe(200);
      }
    } finally {
      await server.close();
    }
  });

  it('arama dizini taşınınca eski yol bulunamaz, yeni yol kendi kimliğiyle çalışmaz', () => {
    runSearch(repo.root, ROOT, shellSpec());
    mkdirSync(join(repo.root, ROOT, 'arsiv'), { recursive: true });
    renameSync(dir(), join(repo.root, ROOT, 'arsiv', 'shell-test'));
    expect(code(() => loadSearch(loc))).toBe('not-found');
  });
});

describe('köken, canary ve inceleme belgeleri', () => {
  const origin = {
    schema: 'ProgramOriginV1',
    programHash: `sha256:${'1'.repeat(64)}`,
    source: {
      kind: 'family-variant',
      familiesRoot: 'r',
      familyId: 'f',
      familyHash: `sha256:${'2'.repeat(64)}`,
      variantKey: 'k',
      variantId: 'v-0123456789abcdef',
    },
  };
  it.each([
    ['şema', { ...origin, schema: 'X' }, 'schema type'],
    ['program özeti', { ...origin, programHash: 'x' }, 'origin.programHash type'],
    ['aile özeti', edited(origin, [['source', 'familyHash'], 'x']), 'source.familyHash type'],
    ['boş anahtar', edited(origin, [['source', 'variantKey'], '']), 'source.variantKey type'],
    ['bilinmeyen tür', edited(origin, [['source', 'kind'], 'manual']), 'source.kind type'],
  ])('köken: %s', (_, doc, expected) => {
    expect(code(() => validateOrigin(doc))).toBe(expected);
  });

  const canary = JSON.parse(
    readFileSync(join(__dirname, '../../canaries/bubble.json'), 'utf8'),
  ) as unknown;
  it.each([
    ['şema', [['schema'], 'X'], 'schema type'],
    ['kimlik', [['id'], 'Kabarcık'], 'id type'],
    ['beklentisiz', [['expectations'], []], 'expectations range'],
    ['rehbersiz', [['listeningGuide'], []], 'listeningGuide range'],
    ['boş başlık', [['title'], ''], 'title type'],
  ] as const)('canary: %s', (_, edit, expected) => {
    expect(code(() => validateCanary(edited(canary, edit as never)))).toBe(expected);
  });

  it('inceleme belgesi: şema ve durum denetlenir', () => {
    expect(code(() => validateReviews({ schema: 'X', reviews: {} }))).toBe('schema type');
    expect(
      code(() =>
        validateReviews({
          schema: 'CanaryReviewsV1',
          reviews: { a: { status: 'loved', version: 1, note: null } },
        }),
      ),
    ).toBe('reviews.a.status type');
    expect(validateReviews({ schema: 'CanaryReviewsV1', reviews: {} }).reviews).toEqual({});
  });
});

describe('sınırlama riski, betimleyici ve denetim kenarları', () => {
  const tone = (params: unknown, extra: Record<string, unknown> = {}) =>
    resolveProgram({
      schema: 'AcousticProgramV1',
      sampleRate: 48000,
      channels: 1,
      durationSeconds: 0.2,
      seed: 1,
      ...extra,
      layers: [{ name: 't', source: { primitive: 'source.oscillator', version: 1, params } }],
    });
  it('PolyBLEP riski: kare dalga, eşik altı sabit frekans ve sürülen frekans', () => {
    expect(limitationRisks(tone({ waveform: 'square', frequency: 2000 }))).toEqual([
      'polyblep-alias',
    ]);
    expect(limitationRisks(tone({ waveform: 'square', frequency: 500 }))).toEqual([]);
    expect(limitationRisks(tone({ waveform: 'sine', frequency: 5000 }))).toEqual([]);
    const driven = tone(
      { waveform: 'sawtooth', frequency: { gesture: 'f' } },
      {
        gestures: {
          f: {
            curve: 'curve.linear',
            version: 1,
            points: [
              [0, 200],
              [0.2, 300],
            ],
          },
        },
      },
    );
    expect(limitationRisks(driven)).toEqual(['polyblep-alias']);
  });

  it('betimleyiciler: 16 kHz girdi, sessizlik, boş sinyal ve 50 Hz sınır perdesi', () => {
    const sr = 16000;
    const x = Float32Array.from({ length: sr / 2 }, (_, i) =>
      Math.sin((2 * Math.PI * 200 * i) / sr),
    );
    expect(Math.round(estimatePitch([x], sr).hz as number)).toBe(200);
    const low = Float32Array.from({ length: 48000 }, (_, i) =>
      Math.sin((2 * Math.PI * 51 * i) / 48000),
    );
    expect(Math.abs((estimatePitch([low], 48000).hz as number) - 51)).toBeLessThan(2);
    expect(countOnsets([new Float32Array(0)], 48000)).toMatchObject({ count: 0, perSecond: 0 });
    expect(estimatePulseRate([new Float32Array(100)], 48000)).toMatchObject({
      hz: null,
      strength: 0,
    });
    expect(estimatePulseRate([new Float32Array(48000)], 48000).hz).toBeNull();
  });

  it('denetimler: pencere biçimi, pencereli perde, yalnız-min aralık, kırpma ve tık ihlali, düşen kontur', () => {
    expect(code(() => validateCheck({ kind: 'pitch', min: 1, window: [0.1] }, 'c'))).toBe(
      'c.window type',
    );
    expect(code(() => validateCheck(null, 'c'))).toBe('c type');
    const render = renderProgram({
      schema: 'AcousticProgramV1',
      sampleRate: 48000,
      channels: 1,
      durationSeconds: 0.6,
      seed: 1,
      gestures: {
        f: {
          curve: 'curve.linear',
          version: 1,
          points: [
            [0, 600],
            [0.6, 250],
          ],
        },
      },
      layers: [
        {
          name: 'v',
          source: {
            primitive: 'source.glottal',
            version: 1,
            params: { frequency: { gesture: 'f' }, jitter: 0, breath: 0 },
          },
        },
      ],
      master: { normalize: 'none', gainDb: 18 },
    });
    const report = analyzeAudio(render.channels, render.sampleRate, 'source-pcm');
    const run = (check: unknown) => evaluateCheck(validateCheck(check, 'c'), render, report);
    expect(run({ kind: 'pitch', min: 200, window: [0.4, 0.6], minConfidence: 0.5 }).pass).toBe(
      true,
    );
    expect(run({ kind: 'pitch-contour', shape: 'falling', minRatio: 1.3 }).pass).toBe(true);
    expect(run({ kind: 'clipping' })).toMatchObject({ pass: false });
    expect(run({ kind: 'clipping' }).reason).toMatch(/kırpılmış/);
    const loud = run({ kind: 'descriptor', descriptor: 'maxMomentaryLufs', min: 10 });
    expect(loud.reason).toMatch(/\[10, ∞\]/);
    const clicks = evaluateCheck({ kind: 'clicks', max: -1 }, render, report);
    expect(clicks.pass).toBe(false);
  });

  it('aile uzaklığı ve politika: boş ölçüm, politika modu, eşit PCM sıralaması', () => {
    const d = {
      durationSeconds: 1,
      activeSeconds: 1,
      attackSeconds: null,
      decay40Seconds: null,
      maxMomentaryLufs: null,
      integratedLufs: null,
      truePeakDbtp: null,
      crestFactorDb: null,
      centroidHz: null,
      rolloff85Hz: null,
      flatness: null,
      spectralPeakHz: null,
      pitchHz: null,
      pitchConfidence: 0,
      onsetsPerSecond: 0,
      clicks: 0,
      clippedSamples: 0,
    };
    expect(familyDistance(d, { ...d, activeSeconds: 2 })).toBeGreaterThan(0);
    expect(
      code(() =>
        validateFamilyQualityPolicy(
          { ...DEFAULT_FAMILY_QUALITY_POLICY, coherence: { maxRobustZ: 4, outliers: 'warn' } },
          'p',
        ),
      ),
    ).toBe('p.coherence.outliers type');
    const report = assessFamily([
      { key: 'b', pcmHash: 'sha256:b', descriptors: d },
      { key: 'a', pcmHash: 'sha256:a', descriptors: d },
      { key: 'c', pcmHash: 'sha256:a', descriptors: d },
      { key: 'd', pcmHash: 'sha256:b', descriptors: d },
    ]);
    expect(report.duplicates.map((x) => x.pcmHash)).toEqual(['sha256:a', 'sha256:b']);
  });
});
