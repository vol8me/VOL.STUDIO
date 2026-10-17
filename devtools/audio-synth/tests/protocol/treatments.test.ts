import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prettyCanonicalJson } from '../../src/kernel/canonical';
import { ProtocolError } from '../../src/protocol/errors';
import {
  analyzeCandidate,
  initJob,
  registerBrief,
  registerProgram,
  renderCandidate,
  selectCandidate,
} from '../../src/protocol/job';
import type { AudioAssetManifestV1 } from '../../src/protocol/manifest';
import { readOrigin } from '../../src/protocol/origin';
import { publishJob, verifyManifest } from '../../src/protocol/publish';
import { deriveTreatment, derivedDocuments } from '../../src/protocol/treatments';
import { PIPELINE_BLOCK, PIPELINE_TIMEOUT } from '../support/timeouts';
import {
  cloneTestRepo,
  createTestRepo,
  REFERENCE_TARGET,
  testBrief,
  testProgram,
  type TestRepo,
} from './repo';

/**
 * Teslim varyantı yayımlanmış bir kaynaktan türer ve kanonik kapıdan geçer;
 * manifest kaynağa ve profile bağını taşır, `verify` bu bağı kaynak ve
 * katalogla yeniden sınar.
 */
const SOURCE = 'devtools/audio-synth/reference/production/manifests/sfx/knock.json';
const FAR = 'devtools/audio-synth/reference/production/manifests/sfx/knock-far.json';

let golden: TestRepo;
beforeAll(() => {
  golden = createTestRepo();
  const loc = golden.loc('knock');
  initJob(loc, { target: REFERENCE_TARGET });
  registerBrief(loc, testBrief());
  // Uzak varyant kaynağın 6 LU altında: sessiz bir kaynağın varyantı sfx
  // politikasının altına düşer ve kapı onu (doğru olarak) reddeder.
  registerProgram(loc, testProgram({ master: { normalize: 'peak', peakDbfs: -1 } }));
  renderCandidate(loc);
  analyzeCandidate(loc);
  selectCandidate(loc, undefined, 'kaynak');
  publishJob(loc);
  deriveTreatment({
    repoRoot: golden.root,
    job: golden.loc('knock-far'),
    source: SOURCE,
    profile: 'distance-far',
    asset: 'reference/production/assets/sfx/knock-far.ogg',
  });
}, PIPELINE_TIMEOUT);
afterAll(() => golden.cleanup());

const read = (repo: TestRepo, path: string) =>
  JSON.parse(readFileSync(join(repo.root, path), 'utf8')) as AudioAssetManifestV1;

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError) return error.code;
    throw error;
  }
  throw new Error('hata beklenirken geçti');
}

describe('teslim varyantı türetme', PIPELINE_BLOCK, () => {
  it('program = kaynak + profil; brief kaynağın beyanını taşır, kuyruk süreye eklenir', () => {
    const source = read(golden, SOURCE);
    const docs = derivedDocuments(source, 'distance-far');
    const { treatment, ...rest } = docs.program;
    expect(rest).toEqual(source.program.document);
    expect(treatment?.chain.map((n) => n.primitive)).toContain('effect.air-absorption');
    expect(docs.brief).toMatchObject({ id: 'knock-distance-far', assetClass: 'sfx', channels: 1 });
    expect(docs.brief.durationSeconds.max).toBeGreaterThan(2);
    expect(docs.brief.descriptors).toContain('treatment:distance-far');
  });

  it('manifest bağı ve ölçüleri taşır; verify bağı sınar; tekrar dokunmaz', () => {
    const source = read(golden, SOURCE);
    const far = read(golden, FAR);
    expect(far.derivation).toMatchObject({
      scheme: 'treatment-derivation-v1',
      source: {
        manifest: SOURCE,
        assetId: 'knock',
        programHash: source.program.hash,
        pcmHash: source.render.pcm.hash,
      },
      profile: { id: 'distance-far', version: 1, kind: 'distance' },
    });
    const cues = far.derivation!.cues;
    expect(cues.derived.centroidHz ?? 0).toBeLessThan(cues.source.centroidHz ?? 0);
    expect(cues.derived.directnessDb ?? 0).toBeLessThan(cues.source.directnessDb ?? 0);
    expect(readOrigin(golden.loc('knock-far'))?.source.kind).toBe('treatment');
    const report = verifyManifest(golden.root, FAR);
    expect(report.checks.find((c) => c.name === 'derivation')).toMatchObject({
      ok: true,
      detail: 'knock + distance-far@1',
    });
    expect(report.ok).toBe(true);
    const again = deriveTreatment({
      repoRoot: golden.root,
      job: golden.loc('knock-far'),
      source: SOURCE,
      profile: 'distance-far',
      asset: 'reference/production/assets/sfx/knock-far.ogg',
    });
    expect(again).toEqual({ result: 'unchanged', manifest: FAR });
  });

  it('kaynak değişirse bağ kopar; işlenmiş kaynaktan ve bilinmeyen profilden türetilmez', () => {
    const repo = cloneTestRepo(golden);
    try {
      const source = read(repo, SOURCE);
      const moved = {
        ...source,
        render: {
          ...source.render,
          pcm: { ...source.render.pcm, hash: `sha256:${'0'.repeat(64)}` },
        },
      };
      writeFileSync(join(repo.root, SOURCE), prettyCanonicalJson(moved));
      const check = verifyManifest(repo.root, FAR).checks.find((c) => c.name === 'derivation');
      expect(check).toMatchObject({ ok: false, detail: 'kaynak manifest’in PCM’i değişti' });
      const derive = (from: string, profile: string) => () =>
        deriveTreatment({
          repoRoot: repo.root,
          job: repo.loc('again'),
          source: from,
          profile,
          asset: 'reference/production/assets/sfx/again.ogg',
        });
      expect(code(derive(FAR, 'radio'))).toBe('invalid');
      writeFileSync(join(repo.root, SOURCE), prettyCanonicalJson(source));
      expect(code(derive(SOURCE, 'yok-boyle'))).toBe('invalid');
    } finally {
      repo.cleanup();
    }
  });
});
