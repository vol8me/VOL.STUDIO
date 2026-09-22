import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BatchBudgetError } from '../../src/guard/batch';
import { renderProgram } from '../../src/program/render';
import { writeAuditionCopy } from '../../src/protocol/audition';
import { hashCanonical, prettyCanonicalJson } from '../../src/protocol/canonical';
import { ProtocolError } from '../../src/protocol/errors';
import {
  analyzeCandidate,
  initJob,
  registerBrief,
  registerProgram,
  renderCandidate,
  selectCandidate,
} from '../../src/protocol/job';
import { validateOrigin } from '../../src/protocol/origin';
import { publishJob } from '../../src/protocol/publish';
import {
  exportSearchAudition,
  loadSearch,
  promoteCandidate,
  recordDecision,
  runSearch,
  searchStatus,
  verifySearch,
  type SearchLocation,
} from '../../src/protocol/search';
import { jobStatus } from '../../src/protocol/status';
import { shellSpec } from '../search/fixtures';
import { createTestRepo, REFERENCE_TARGET, testBrief, type TestRepo } from './repo';

const ROOT = 'devtools/audio-synth/audio-searches';
const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));
const TSX = join(PACKAGE, 'node_modules/.bin/tsx');
const CLI = join(PACKAGE, 'scripts/audio-job.ts');

let repo: TestRepo;
let search: SearchLocation;
beforeEach(() => {
  repo = createTestRepo();
  search = { repoRoot: repo.root, searchesRoot: ROOT, searchId: 'shell-test' };
});
afterEach(() => repo.cleanup());

const dir = () => join(repo.root, ROOT, 'shell-test');
const decision = (state: 'approved' | 'rejected' | 'pending') => ({
  state,
  by: 'agent' as const,
  labels: [],
  note: null,
});

function passedId(): string {
  const id = loadSearch(search).report.candidates.find((c) => c.state === 'passed')?.candidateId;
  if (!id) throw new Error('passed aday yok');
  return id;
}

function briefedJob(jobId = 'shell') {
  const loc = repo.loc(jobId);
  initJob(loc, {
    target: { ...REFERENCE_TARGET, asset: `reference/production/assets/sfx/${jobId}.ogg` },
  });
  registerBrief(loc, testBrief({ id: jobId, durationSeconds: { min: 0.2, max: 1 } }));
  return loc;
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError) return error.code;
    throw error;
  }
  throw new Error('hata beklenirdi');
}

describe('arama kalıcılığı', () => {
  it('spec, aday programları ve rapor yazılır; tamamlanmış arama üzerine yazılmaz', () => {
    const outcome = runSearch(repo.root, ROOT, shellSpec());
    expect(readdirSync(dir()).sort()).toEqual(['candidates', 'report.json', 'spec.json']);
    const rendered = outcome.report.candidates.filter((c) => c.candidateId);
    expect(readdirSync(join(dir(), 'candidates')).sort()).toEqual(
      rendered.map((c) => `${c.candidateId}.json`).sort(),
    );
    expect(codeOf(() => runSearch(repo.root, ROOT, shellSpec()))).toBe('overwrite');
    expect(verifySearch(search).ok).toBe(true);
  });

  it('bütçe aşımı: adlı hata, SIFIR dosya (arama ağacı da dinleme kökü de açılmaz)', () => {
    expect(() =>
      runSearch(repo.root, ROOT, shellSpec({ budget: { maxTotalWorkUnits: 1000 } }), {
        audition: true,
      }),
    ).toThrow(BatchBudgetError);
    expect(existsSync(join(repo.root, ROOT))).toBe(false);
    expect(existsSync(join(repo.root, 'devtools/audio-synth/export'))).toBe(false);
  });

  it('raporu olmayan (yarım kalmış) arama aynı spec ile yeniden koşulabilir', () => {
    runSearch(repo.root, ROOT, shellSpec());
    const report = readFileSync(join(dir(), 'report.json'), 'utf8');
    rmSync(join(dir(), 'report.json'));
    expect(runSearch(repo.root, ROOT, shellSpec()).report).toEqual(JSON.parse(report));
  });

  it('bütünlük: değişen aday programı ve spec adıyla raporlanır', () => {
    runSearch(repo.root, ROOT, shellSpec());
    const id = passedId();
    const file = join(dir(), 'candidates', `${id}.json`);
    writeFileSync(
      file,
      prettyCanonicalJson({ ...JSON.parse(readFileSync(file, 'utf8')), seed: 1 }),
    );
    expect(searchStatus(search).problems).toEqual([
      `aday programı rapordan sonra değişti: candidates/${id}.json`,
    ]);
    expect(verifySearch(search).ok).toBe(false);
    const spec = join(dir(), 'spec.json');
    writeFileSync(
      spec,
      prettyCanonicalJson({ ...JSON.parse(readFileSync(spec, 'utf8')), seed: 8 }),
    );
    expect(codeOf(() => loadSearch(search))).toBe('identity');
  });
});

describe('arama kararları (SearchSelectionV1)', () => {
  it('yalnız passed adaya karar yazılır; kimlik biçimi ve varlığı denetlenir', () => {
    runSearch(
      repo.root,
      ROOT,
      shellSpec({ filters: [{ kind: 'descriptor', descriptor: 'centroidHz', max: 450 }] }),
    );
    const filtered = loadSearch(search).report.candidates.find((c) => c.state === 'filtered')
      ?.candidateId as string;
    expect(() => recordDecision(search, filtered, decision('approved'))).toThrow(/yalnız passed/);
    expect(() => recordDecision(search, 'c-0000000000000000', decision('approved'))).toThrow(
      /aramasında yok/,
    );
    expect(codeOf(() => recordDecision(search, '../../etc', decision('approved')))).toBe('invalid');
  });

  it('karar taze bir SÜREÇTE dosyalardan yeniden kurulur', () => {
    runSearch(repo.root, ROOT, shellSpec());
    const id = passedId();
    recordDecision(search, id, {
      state: 'approved',
      by: 'human',
      labels: ['warm', 'short'],
      note: 'kısa ve sıcak',
    });
    const res = spawnSync(TSX, [CLI, 'search', 'status', 'shell-test', '--json'], {
      cwd: repo.root,
      encoding: 'utf8',
    });
    const status = JSON.parse(res.stdout) as ReturnType<typeof searchStatus>;
    expect(status.candidates.find((c) => c.candidateId === id)).toMatchObject({
      decision: 'approved',
      by: 'human',
      labels: ['short', 'warm'],
      note: 'kısa ve sıcak',
    });
    expect(status.summary.approved).toBe(1);
    expect(status.selection.state).toBe('valid');
  }, 60_000);
});

describe('terfi (promote) — kanonik akışa tek giriş', () => {
  it('onaysız aday terfi etmez; onaylı adayın TAM programı job programı olur ve köken yazılır', () => {
    runSearch(repo.root, ROOT, shellSpec());
    const id = passedId();
    const job = briefedJob();
    expect(codeOf(() => promoteCandidate(job, search, id))).toBe('stage');
    recordDecision(search, id, decision('rejected'));
    expect(codeOf(() => promoteCandidate(job, search, id))).toBe('stage');
    recordDecision(search, id, decision('approved'));

    const { programHash, origin } = promoteCandidate(job, search, id);
    const entry = loadSearch(search).report.candidates.find((c) => c.candidateId === id);
    const candidateProgram = JSON.parse(
      readFileSync(join(dir(), 'candidates', `${id}.json`), 'utf8'),
    ) as unknown;
    expect(programHash).toBe(entry?.programHash);
    expect(
      hashCanonical(
        JSON.parse(readFileSync(join(repo.root, job.jobsRoot, 'shell/program.json'), 'utf8')),
      ),
    ).toBe(hashCanonical(candidateProgram));
    expect(
      validateOrigin(
        JSON.parse(readFileSync(join(repo.root, job.jobsRoot, 'shell/origin.json'), 'utf8')),
      ),
    ).toEqual(origin);
    expect(origin.source).toMatchObject({
      kind: 'search-candidate',
      candidateId: id,
      pcmHash: entry?.render?.pcmHash,
    });
    expect(jobStatus(job).artifacts.origin).toMatchObject({
      state: 'valid',
      kind: 'search-candidate',
    });
    expect(readdirSync(join(repo.root, job.jobsRoot, 'shell')).sort()).toEqual([
      'brief.json',
      'job.json',
      'origin.json',
      'program.json',
    ]);
  });

  it('terfi edilen program normal render → analyze → select → publish ile yayımlanır; manifest kökenle aynı programı taşır', () => {
    runSearch(repo.root, ROOT, shellSpec());
    const id = passedId();
    recordDecision(search, id, decision('approved'));
    const job = briefedJob();
    const { programHash } = promoteCandidate(job, search, id);
    const render = renderCandidate(job).record;
    expect(render.renderId.startsWith('r-')).toBe(true);
    analyzeCandidate(job);
    selectCandidate(job, undefined, 'aramadan terfi');
    const { manifest } = publishJob(job);
    expect(manifest.program.hash).toBe(programHash);
    expect(manifest.render.pcm.hash).toBe(
      loadSearch(search).report.candidates.find((c) => c.candidateId === id)?.render?.pcmHash,
    );
    expect(readdirSync(dir()).sort()).toEqual([
      'candidates',
      'report.json',
      'selection.json',
      'spec.json',
    ]);
  }, 60_000);

  it('bayat arama reddedilir: program dosyası değişirse identity, spec artık adayı üretmezse stale', () => {
    runSearch(repo.root, ROOT, shellSpec());
    const id = passedId();
    recordDecision(search, id, decision('approved'));
    const job = briefedJob();
    const file = join(dir(), 'candidates', `${id}.json`);
    const original = readFileSync(file, 'utf8');
    const drifted = { ...JSON.parse(original), description: 'elle değişti' } as Record<
      string,
      unknown
    >;
    writeFileSync(file, prettyCanonicalJson(drifted));
    expect(codeOf(() => promoteCandidate(job, search, id))).toBe('identity');

    const reportFile = join(dir(), 'report.json');
    const report = JSON.parse(readFileSync(reportFile, 'utf8')) as {
      candidates: { candidateId: string; programHash: string }[];
    };
    for (const c of report.candidates)
      if (c.candidateId === id) c.programHash = hashCanonical(drifted);
    writeFileSync(reportFile, prettyCanonicalJson(report));
    const selectionFile = join(dir(), 'selection.json');
    const selection = JSON.parse(readFileSync(selectionFile, 'utf8')) as Record<string, unknown>;
    writeFileSync(
      selectionFile,
      prettyCanonicalJson({ ...selection, reportHash: hashCanonical(report) }),
    );
    expect(codeOf(() => promoteCandidate(job, search, id))).toBe('stale');
    expect(existsSync(join(repo.root, job.jobsRoot, 'shell/program.json'))).toBe(false);
  });

  it('elle program kaydı kökeni siler; programla uyuşmayan köken publish’i durdurur', () => {
    runSearch(repo.root, ROOT, shellSpec());
    const id = passedId();
    recordDecision(search, id, decision('approved'));
    const job = briefedJob();
    promoteCandidate(job, search, id);
    const originFile = join(repo.root, job.jobsRoot, 'shell/origin.json');
    const origin = readFileSync(originFile, 'utf8');
    const program = JSON.parse(
      readFileSync(join(dir(), 'candidates', `${id}.json`), 'utf8'),
    ) as Record<string, unknown>;
    registerProgram(job, { ...program, seed: (program.seed as number) + 1 });
    expect(existsSync(originFile)).toBe(false);
    expect(jobStatus(job).artifacts.origin.state).toBe('none');

    renderCandidate(job);
    analyzeCandidate(job);
    selectCandidate(job, undefined, 'elle');
    writeFileSync(originFile, origin);
    const status = jobStatus(job);
    expect(status.artifacts.origin.state).toBe('stale');
    expect(status.next.action).toBe('program');
    expect(codeOf(() => publishJob(job))).toBe('stale');
  }, 60_000);
});

describe('dinleme kopyaları', () => {
  it('yalnız export/ altına yazılır; programdan yeniden üretilir', () => {
    runSearch(repo.root, ROOT, shellSpec());
    const written = exportSearchAudition(search);
    expect(written.length).toBe(
      loadSearch(search).report.candidates.filter((c) => c.render).length,
    );
    for (const path of written)
      expect(path.startsWith('devtools/audio-synth/export/audio-searches/shell-test/')).toBe(true);
    const render = renderProgram(
      JSON.parse(readFileSync(join(dir(), 'candidates', `${passedId()}.json`), 'utf8')),
    );
    expect(codeOf(() => writeAuditionCopy(repo.root, `${ROOT}/x.wav`, render))).toBe('path');
    expect(
      codeOf(() =>
        writeAuditionCopy(repo.root, 'devtools/audio-synth/export/../audio-jobs/x.wav', render),
      ),
    ).toBe('path');
  });
});
