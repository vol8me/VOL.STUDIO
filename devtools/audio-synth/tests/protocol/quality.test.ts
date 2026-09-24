import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRenderCache } from '../../src/engine/renderCache';
import { withRenderSession } from '../../src/engine/session';
import { PROGRAM_RENDERER_VERSION, renderProgram } from '../../src/program/render';
import { programRootKey } from '../../src/program/renderKeys';
import { hashPcm } from '../../src/protocol/canonical';
import { ProtocolError } from '../../src/protocol/errors';
import {
  analyzeCandidate,
  initJob,
  registerBrief,
  registerProgram,
  renderCandidate,
  renderIdOf,
  selectCandidate,
} from '../../src/protocol/job';
import { publishJob, verifyManifest } from '../../src/protocol/publish';
import { validateRenderRecord } from '../../src/protocol/records';
import { PIPELINE_TIMEOUT } from '../support/timeouts';
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

/** Master true-peak sınırlayıcısı kaliteye bağlı bir düğümdür: taslak ondan farklı PCM verir. */
const limited = () =>
  testProgram({ master: { normalize: 'peak', peakDbfs: -1, limiter: { ceilingDbtp: -3 } } });

function programmed(program: Record<string, unknown> = limited(), jobId = 'knock') {
  const loc = repo.loc(jobId);
  initJob(loc, { target: REFERENCE_TARGET });
  registerBrief(loc, testBrief());
  registerProgram(loc, program);
  return loc;
}

describe('taslak render kalitesi — job akışı', () => {
  it('taslak kaydı kalitesini taşır, ayrı kimlik alır ve analizde kendi kalitesiyle doğrulanır', () => {
    const loc = programmed();
    const draft = renderCandidate(loc, { quality: 'draft' }).record;
    const final = renderCandidate(loc).record;
    expect(draft.quality).toBe('draft');
    expect(final.quality).toBeUndefined();
    expect(draft.renderId).not.toBe(final.renderId);
    expect(final.renderId).toBe(renderIdOf(final.programHash, final.seed));
    expect(draft.pcm.frames).toBe(final.pcm.frames);
    expect(draft.pcm.hash).not.toBe(final.pcm.hash);
    expect(analyzeCandidate(loc, draft.renderId).pcmHash).toBe(draft.pcm.hash);
    expect(analyzeCandidate(loc, final.renderId).pcmHash).toBe(final.pcm.hash);
  });

  it('kaliteye bağlı düğümü olmayan programda taslak ve nihai PCM aynıdır', () => {
    const loc = programmed(testProgram());
    const draft = renderCandidate(loc, { quality: 'draft' }).record;
    const final = renderCandidate(loc).record;
    expect(draft.renderId).not.toBe(final.renderId);
    expect(draft.pcm.hash).toBe(final.pcm.hash);
  });

  it('kayıt doğrulayıcısı yalnız bilinen kaliteyi kabul eder', () => {
    const loc = programmed();
    const record = renderCandidate(loc, { quality: 'draft' }).record;
    expect(validateRenderRecord(record).quality).toBe('draft');
    expect(() => validateRenderRecord({ ...record, quality: 'fast' })).toThrow(/quality/);
  });

  it(
    'yayın taslak seçimi reddeder ve hiçbir şey yazmaz; nihai seçim aynı job’da yayımlanır',
    () => {
      const loc = programmed();
      const draft = renderCandidate(loc, { quality: 'draft' }).record;
      analyzeCandidate(loc, draft.renderId);
      selectCandidate(loc, draft.renderId, 'taslak dinleme');
      expect(code(() => publishJob(loc))).toBe('policy');
      expect(existsSync(join(repo.root, 'devtools/audio-synth/reference'))).toBe(false);

      const final = renderCandidate(loc).record;
      analyzeCandidate(loc, final.renderId);
      selectCandidate(loc, final.renderId, 'nihai');
      const outcome = publishJob(loc);
      expect(outcome.manifest.render.pcm.hash).toBe(final.pcm.hash);
    },
    PIPELINE_TIMEOUT,
  );
});

describe('doğrulama önbelleği kullanmaz', () => {
  it(
    'zehirli bir önbellek normal render’ı etkiler ama verifyManifest gerçek hesap yapar',
    () => {
      const loc = programmed();
      const record = renderCandidate(loc).record;
      analyzeCandidate(loc);
      selectCandidate(loc, undefined, 'tek aday');
      const outcome = publishJob(loc);

      const document = JSON.parse(
        readFileSync(join(repo.root, `${loc.jobsRoot}/${loc.jobId}/program.json`), 'utf8'),
      ) as unknown;
      const key = programRootKey(document, record.seed, 'final', PROGRAM_RENDERER_VERSION);
      if (!key) throw new Error('program kanonik değil');
      const cache = new MemoryRenderCache({ maxBytes: 1 << 26 });
      const poison = [new Float32Array(record.pcm.frames).fill(0.25)];
      cache.write(key, poison);

      const poisoned = renderProgram(document, { cache });
      expect(hashPcm(poisoned.channels, poisoned.sampleRate)).toBe(
        hashPcm(poison, record.pcm.sampleRate),
      );
      const verification = withRenderSession({ cache }, () =>
        verifyManifest(repo.root, outcome.manifestPath),
      );
      expect(verification.ok).toBe(true);
    },
    PIPELINE_TIMEOUT,
  );
});
