import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashCanonical, prettyCanonicalJson } from '../../src/protocol/canonical';
import { ProtocolError } from '../../src/protocol/errors';
import {
  analyzeCandidate,
  initJob,
  listJobs,
  registerBrief,
  registerProgram,
  renderCandidate,
  selectCandidate,
} from '../../src/protocol/job';
import { artifactFile, loadJob, saveJob } from '../../src/protocol/location';
import { publishJob } from '../../src/protocol/publish';
import { jobStatus } from '../../src/protocol/status';
import { createTestRepo, REFERENCE_TARGET, testBrief, testProgram, type TestRepo } from './repo';

let repo: TestRepo;
beforeEach(() => {
  repo = createTestRepo();
});
afterEach(() => repo.cleanup());

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError) return error.code;
    throw error;
  }
  throw new Error('hata beklenirken geçti');
}

function throughSelect(jobId = 'knock', program = testProgram()): void {
  const loc = repo.loc(jobId);
  initJob(loc, { target: REFERENCE_TARGET });
  registerBrief(loc, testBrief());
  registerProgram(loc, program);
  renderCandidate(loc);
  analyzeCandidate(loc);
  selectCandidate(loc, undefined, 'tek aday');
}

describe('AudioJob durum makinesi', () => {
  it('her aşamada sonraki geçerli adım yalnız dosyalardan hesaplanır', () => {
    const loc = repo.loc();
    initJob(loc, { target: REFERENCE_TARGET });
    const steps: [() => unknown, string, string][] = [
      [() => undefined, 'created', 'brief'],
      [() => registerBrief(loc, testBrief()), 'briefed', 'program'],
      [() => registerProgram(loc, testProgram()), 'programmed', 'render'],
      [() => renderCandidate(loc), 'rendered', 'analyze'],
      [() => analyzeCandidate(loc), 'analyzed', 'select'],
      [() => selectCandidate(loc, undefined, 'tek aday'), 'selected', 'publish'],
      [() => publishJob(loc), 'published', 'done'],
    ];
    for (const [run, stage, next] of steps) {
      run();
      const status = jobStatus(loc);
      expect([status.effectiveStage, status.next.action]).toEqual([stage, next]);
      expect(status.problems).toEqual([]);
    }
    expect(listJobs(repo.root, loc.jobsRoot)).toEqual(['knock']);
  });

  it('sıra dışı komut reddedilir ve geçerli adımı söyler', () => {
    const loc = repo.loc();
    initJob(loc, { target: REFERENCE_TARGET });
    expect(code(() => registerProgram(loc, testProgram()))).toBe('stage');
    expect(() => renderCandidate(loc)).toThrow(/Sonraki geçerli adım: brief/);
    registerBrief(loc, testBrief());
    expect(code(() => analyzeCandidate(loc))).toBe('stage');
    expect(code(() => selectCandidate(loc, undefined, 'x'))).toBe('stage');
    expect(code(() => publishJob(loc))).toBe('stale');
  });

  it('var olan job sıfırlanmaz', () => {
    initJob(repo.loc(), { target: REFERENCE_TARGET });
    expect(code(() => initJob(repo.loc(), { target: REFERENCE_TARGET }))).toBe('overwrite');
  });

  it('program brief ile uyumsuzsa ya da bütçeyi aşarsa KAYDEDİLMEZ', () => {
    const loc = repo.loc();
    initJob(loc, { target: REFERENCE_TARGET });
    registerBrief(loc, testBrief());
    expect(code(() => registerProgram(loc, testProgram({ channels: 2 })))).toBe('invalid');
    expect(code(() => registerProgram(loc, testProgram({ durationSeconds: 3 })))).toBe('invalid');
    expect(
      code(() =>
        registerProgram(
          loc,
          testProgram({
            layers: [{ name: 'x', source: { primitive: 'source.nope', version: 1 } }],
          }),
        ),
      ),
    ).toBe('invalid');
    expect(existsSync(artifactFile(loc, 'program.json'))).toBe(false);
    expect(jobStatus(loc).artifacts.program.state).toBe('missing');
  });

  it('birden çok aday: render seçimi açık olmalı; farklı tohum farklı kimlik', () => {
    const loc = repo.loc();
    initJob(loc, { target: REFERENCE_TARGET });
    registerBrief(loc, testBrief());
    registerProgram(loc, testProgram());
    const a = renderCandidate(loc).record;
    const b = renderCandidate(loc, { seed: 99 }).record;
    expect(a.renderId).not.toBe(b.renderId);
    expect(a.pcm.hash).not.toBe(b.pcm.hash);
    expect(code(() => analyzeCandidate(loc))).toBe('invalid');
    expect(code(() => analyzeCandidate(loc, 'r-0000000000000000'))).toBe('stale');
    analyzeCandidate(loc, b.renderId);
    expect(code(() => selectCandidate(loc, a.renderId, 'analizsiz'))).toBe('stale');
    expect(selectCandidate(loc, b.renderId, 'ikinci').renderId).toBe(b.renderId);
  });

  it('dinleme kopyası export/ altına yazılır, job ağacına girmez', () => {
    const loc = repo.loc();
    initJob(loc, { target: REFERENCE_TARGET });
    registerBrief(loc, testBrief());
    registerProgram(loc, testProgram());
    const outcome = renderCandidate(loc, { audition: true });
    expect(outcome.audition).toMatch(
      /^devtools\/audio-synth\/export\/audio-jobs\/knock\/r-[0-9a-f]{16}\.wav$/,
    );
    expect(existsSync(join(repo.root, outcome.audition ?? ''))).toBe(true);
    expect(jobStatus(loc).problems).toEqual([]);
  });
});

describe('özet zinciri ve bayatlık', () => {
  it('program değişince analiz/seçim bayatlar ve publish REDDEDİLİR', () => {
    throughSelect();
    const loc = repo.loc();
    registerProgram(loc, testProgram({ seed: 6 }));
    const status = jobStatus(loc);
    expect(status.artifacts.renders.map((r) => [r.state, r.reason])).toEqual([
      ['stale', 'program değişti'],
    ]);
    expect(status.artifacts.analyses[0].state).toBe('stale');
    expect(status.artifacts.selection.state).toBe('stale');
    expect(status.next.action).toBe('render');
    expect(code(() => publishJob(loc))).toBe('stale');
    expect(existsSync(join(repo.root, 'devtools/audio-synth', REFERENCE_TARGET.asset))).toBe(false);
  });

  it('program.json protokol DIŞINDA düzenlenirse modified; alt zincir bayat', () => {
    throughSelect();
    const loc = repo.loc();
    const file = artifactFile(loc, 'program.json');
    const edited = { ...(JSON.parse(readFileSync(file, 'utf8')) as object), seed: 77 };
    writeFileSync(file, JSON.stringify(edited));
    const status = jobStatus(loc);
    expect(status.artifacts.program.state).toBe('modified');
    expect(status.artifacts.renders[0].state).toBe('stale');
    expect(status.next.action).toBe('program');
    expect(code(() => publishJob(loc))).toBe('stale');
  });

  it('brief değişince program bayatlar (brief → program kenarı)', () => {
    throughSelect();
    const loc = repo.loc();
    registerBrief(loc, testBrief({ title: 'Yeni başlık' }));
    const status = jobStatus(loc);
    expect([status.artifacts.program.state, status.artifacts.program.reason]).toEqual([
      'stale',
      'brief değişti',
    ]);
    expect(status.effectiveStage).toBe('briefed');
    registerProgram(loc, testProgram());
    expect(jobStatus(loc).artifacts.renders[0].state).toBe('valid');
  });

  it('başka bir render’ın analizine işaret eden seçim publish edilemez', () => {
    const loc = repo.loc();
    initJob(loc, { target: REFERENCE_TARGET });
    registerBrief(loc, testBrief());
    registerProgram(loc, testProgram());
    const a = renderCandidate(loc).record;
    const b = renderCandidate(loc, { seed: 41 }).record;
    analyzeCandidate(loc, a.renderId);
    analyzeCandidate(loc, b.renderId);
    const honest = selectCandidate(loc, a.renderId, 'a');
    const job = loadJob(loc);
    const forged = { ...honest, analysisHash: job.artifacts.analyses[b.renderId].hash };
    writeFileSync(artifactFile(loc, 'selection.json'), prettyCanonicalJson(forged));
    saveJob(loc, {
      ...job,
      artifacts: {
        ...job.artifacts,
        selection: { path: 'selection.json', hash: hashCanonical(forged) },
      },
    });
    const status = jobStatus(loc);
    expect(status.artifacts.selection.reason).toBe(
      'seçim başka bir render/analiz kaydına işaret ediyor',
    );
    expect(code(() => publishJob(loc))).toBe('stale');
  });

  it('yarım yazım geçerli görünmez; geçici dosya ve kayıtsız dosya raporlanır', () => {
    throughSelect();
    const loc = repo.loc();
    const file = artifactFile(loc, 'program.json');
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, text.slice(0, Math.floor(text.length / 2)));
    writeFileSync(artifactFile(loc, '.tmp-123-1-1'), '{');
    writeFileSync(artifactFile(loc, 'notes.json'), '{}');
    const status = jobStatus(loc);
    expect(status.artifacts.program.state).toBe('corrupt');
    expect(status.artifacts.selection.state).toBe('stale');
    expect(status.problems).toEqual([
      'job kaydında olmayan dosya: notes.json',
      'yarım yazımdan kalan geçici dosya: .tmp-123-1-1',
    ]);
  });

  it('kayıtlı ama silinmiş render kaydı bozuk sayılır', () => {
    throughSelect();
    const loc = repo.loc();
    const renderId = Object.keys(loadJob(loc).artifacts.renders)[0];
    writeFileSync(artifactFile(loc, `renders/${renderId}.json`), '[]');
    const status = jobStatus(loc);
    expect(status.artifacts.renders[0].state).toBe('corrupt');
    expect(status.artifacts.analyses[0].reason).toBe('render corrupt');
  });
});

describe('dosya sistemi güvenliği', () => {
  it('jobId ve jobs kökü kaçışa izin vermez', () => {
    expect(
      code(() => initJob({ ...repo.loc(), jobId: '../escape' }, { target: REFERENCE_TARGET })),
    ).toBe('path');
    expect(
      code(() => initJob({ ...repo.loc(), jobsRoot: '/tmp' }, { target: REFERENCE_TARGET })),
    ).toBe('path');
    expect(
      code(() => initJob({ ...repo.loc(), jobsRoot: 'a/../../b' }, { target: REFERENCE_TARGET })),
    ).toBe('path');
    expect(
      code(() => initJob({ ...repo.loc(), jobsRoot: 'C:/jobs' }, { target: REFERENCE_TARGET })),
    ).toBe('path');
  });

  it('sembolik bağ üzerinden job dizinine erişilmez', () => {
    const outside = join(repo.root, '..', `outside-${Date.now()}`);
    mkdirSync(outside, { recursive: true });
    mkdirSync(join(repo.root, 'devtools/audio-synth/audio-jobs'), { recursive: true });
    symlinkSync(outside, join(repo.root, 'devtools/audio-synth/audio-jobs/linked'));
    try {
      expect(code(() => initJob(repo.loc('linked'), { target: REFERENCE_TARGET }))).toBe('symlink');
      expect(existsSync(join(outside, 'job.json'))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('canlı bir sürecin kilidi ikinci yazıcıyı durdurur; ölü sürecin kilidi devralınır', () => {
    const loc = repo.loc();
    initJob(loc, { target: REFERENCE_TARGET });
    writeFileSync(artifactFile(loc, '.lock'), String(process.ppid));
    expect(code(() => registerBrief(loc, testBrief()))).toBe('locked');
    expect(jobStatus(loc).problems).toEqual([`kilit var (pid ${process.ppid})`]);
    writeFileSync(artifactFile(loc, '.lock'), '2147483646');
    registerBrief(loc, testBrief());
    expect(existsSync(artifactFile(loc, '.lock'))).toBe(false);
  });
});
