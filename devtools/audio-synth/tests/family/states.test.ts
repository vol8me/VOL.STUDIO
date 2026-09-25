import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SoundFamilyQualityReportV1 } from '../../src/analysis/family';
import { assessIdentity, assessStateClaims } from '../../src/analysis/familyStates';
import type { DescriptorSummaryV1 } from '../../src/analysis/summary';
import { timbreDistance, timbreEnvelope } from '../../src/analysis/timbre';
import { validateBank } from '../../src/family/bank';
import { validateFamilyProgram } from '../../src/family/program';
import { isStateAxis, stateRank, STATE_AXES } from '../../src/family/vocabulary';
import { AudioParamError } from '../../src/guard/errors';
import { validateBrief } from '../../src/program/brief';
import { renderProgram } from '../../src/program/render';
import type { AudioAssetManifestV1 } from '../../src/protocol/manifest';
import { repoSampleResolver } from '../../src/protocol/samples';
import { testBrief } from '../protocol/repo';
import { RENDER_BLOCK } from '../support/timeouts';

/**
 * Oyun durumu aileleri: sıralı genel eksenler, kontrollü çiftlerde ölçülen
 * yön iddiaları, perde ve seviyeden bağımsız ortak tını kimliği ve
 * manifest'te açık durum anlamı.
 */
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const PACKAGE = new URL('../../', import.meta.url);
const readJson = <T>(rel: string) => JSON.parse(readFileSync(new URL(rel, PACKAGE), 'utf8')) as T;

function descriptors(values: Partial<DescriptorSummaryV1>): DescriptorSummaryV1 {
  return {
    durationSeconds: 1,
    activeSeconds: 1,
    attackSeconds: 0.01,
    decay40Seconds: 0.5,
    maxMomentaryLufs: -20,
    integratedLufs: -21,
    truePeakDbtp: -3,
    crestFactorDb: 10,
    centroidHz: 1000,
    rolloff85Hz: 3000,
    flatness: 0.01,
    spectralPeakHz: 500,
    pitchHz: null,
    pitchConfidence: 0,
    onsetsPerSecond: 0,
    clicks: 0,
    clippedSamples: 0,
    ...values,
  };
}

const member = (
  key: string,
  roles: Record<string, string>,
  values: Partial<DescriptorSummaryV1>,
) => ({
  key,
  roles,
  descriptors: descriptors(values),
  timbre: null,
});

describe('durum sözlüğü', () => {
  it('eksenler sıralı ve genel; sıra değerden okunur', () => {
    expect(Object.keys(STATE_AXES)).toEqual(['energy', 'urgency', 'integrity']);
    expect(stateRank('energy', 'idle')).toBeLessThan(stateRank('energy', 'high'));
    expect(stateRank('integrity', 'yok')).toBe(-1);
    expect(isStateAxis('urgency')).toBe(true);
    expect(isStateAxis('intensity')).toBe(false);
  });

  it('brief durumu yalnız sözlükten alır', () => {
    expect(validateBrief(testBrief({ state: { energy: 'high' } }))).toMatchObject({
      state: { energy: 'high' },
    });
    expect(() => validateBrief(testBrief({ state: { energy: 'charged' } }))).toThrow(
      AudioParamError,
    );
    expect(() => validateBrief(testBrief({ state: { weaponState: 'charged' } }))).toThrow(
      AudioParamError,
    );
    expect(() => validateBrief(testBrief({ state: {} }))).toThrow(/en az bir/);
  });
});

describe('durum iddiaları', () => {
  it('yalnız o eksende farklı çiftler sınanır; yön kesin olmalı', () => {
    const members = [
      member('idle', { energy: 'idle', integrity: 'intact' }, { centroidHz: 200 }),
      member('high', { energy: 'high', integrity: 'intact' }, { centroidHz: 800 }),
      member('high-worn', { energy: 'high', integrity: 'damaged' }, { centroidHz: 100 }),
    ];
    const [claim] = assessStateClaims(members, [
      { axis: 'energy', descriptor: 'centroidHz', direction: 1 },
    ]);
    expect(claim).toMatchObject({ pairs: 1, violations: [], pass: true });
    const [flipped] = assessStateClaims(members, [
      { axis: 'energy', descriptor: 'centroidHz', direction: -1 },
    ]);
    expect(flipped.violations).toEqual([{ lower: 'idle', higher: 'high', values: [200, 800] }]);
    const [untestable] = assessStateClaims(members.slice(0, 1), [
      { axis: 'energy', descriptor: 'centroidHz', direction: 1 },
    ]);
    expect(untestable).toMatchObject({ pairs: 0, pass: false });
  });

  it('aile iddiası tanımadığı bir eksene yapılamaz', () => {
    const family = readJson<Record<string, unknown>>(
      'audio-families/reference-engine-states/family.json',
    );
    const quality = family.quality as Record<string, unknown>;
    const bad = {
      ...family,
      quality: {
        ...quality,
        states: [{ axis: 'urgency', descriptor: 'centroidHz', direction: 1 }],
      },
    };
    expect(() => validateFamilyProgram(bad)).toThrow(/ailenin rolleri arasında yok/);
  });
});

describe('tını zarfı', () => {
  it('seviyeden ve log-frekans kaydırmasından bağımsız; biçim farkını görür', () => {
    const shape = Array.from({ length: 60 }, (_, i) => -Math.abs(i - 30) * 0.8);
    const louder = shape.map((v) => v + 12);
    expect(timbreDistance(shape, louder).distance).toBe(0);
    const shifted = [...shape.slice(6), ...shape.slice(-6)];
    expect(timbreDistance(shape, shifted)).toMatchObject({ distance: 0, shiftOctaves: -1 });
    const other = shape.map((v, i) => (i % 2 ? v + 6 : v - 6));
    expect(timbreDistance(shape, other).distance).toBeGreaterThan(5);
  });

  it('kimlik: medoid seçilir, zarfı ölçülemeyen üye kimliği geçemez', () => {
    const base = Array.from({ length: 60 }, (_, i) => -i * 0.5);
    const members = ['a', 'b', 'c'].map((key, i) => ({
      key,
      roles: {},
      descriptors: descriptors({}),
      timbre: base.map((v, j) => v + (j % 3 === i ? 1 : 0)),
    }));
    const report = assessIdentity(members, { maxTimbreDistance: 2 });
    expect(report.pass).toBe(true);
    expect(report.medoid).not.toBeNull();
    expect(
      assessIdentity([...members, { ...members[0], key: 'd', timbre: null }], {
        maxTimbreDistance: 2,
      }).pass,
    ).toBe(false);
  });
});

describe('referans durum ailesi', RENDER_BLOCK, () => {
  const quality = readJson<SoundFamilyQualityReportV1>(
    'audio-families/reference-engine-states/quality.json',
  );
  const manifest = (rel: string) =>
    readJson<AudioAssetManifestV1>(`reference/production/manifests/sfx/${rel}.json`);
  const envelopeOf = (rel: string) => {
    const m = manifest(rel);
    const r = renderProgram(m.program.document, {
      seed: m.render.seed,
      samples: repoSampleResolver(REPO),
    });
    return timbreEnvelope(r.channels, r.sampleRate) as number[];
  };

  it('kimlik ve üç durum iddiası kapıdan geçti; her varyantın durumu manifest’te açık', () => {
    expect(quality.verdict).toEqual({ pass: true, failures: [] });
    expect(quality.identity?.pass).toBe(true);
    expect(quality.states?.map((c) => [c.axis, c.descriptor, c.pairs, c.pass])).toEqual([
      ['energy', 'centroidHz', 6, true],
      ['energy', 'maxMomentaryLufs', 6, true],
      ['integrity', 'flatness', 3, true],
    ]);
    const bank = validateBank(readJson('reference/production/banks/reference-engine-states.json'));
    for (const variant of bank.variants) {
      const brief = manifest(`families/reference-engine-states/${variant.key}`).brief.document as {
        state?: Record<string, string>;
      };
      expect(brief.state, variant.key).toEqual({
        energy: variant.roles.energy,
        integrity: variant.roles.integrity,
      });
    }
  });

  it('eşik yabancı sesleri ayırır: yedi referans ses de medoidin eşiği dışında', () => {
    const identity = quality.identity!;
    const medoid = envelopeOf(`families/reference-engine-states/${identity.medoid}`);
    const foreign = [
      'reference-impact',
      'delivery/reference-impact-distance-far',
      'families/reference-shell-hits/hard-heavy',
      'families/reference-shell-hits/soft-light',
      'platform-reference-knock',
      'reference-hybrid',
      'reference-sampled',
    ];
    for (const rel of foreign) {
      expect(timbreDistance(medoid, envelopeOf(rel)).distance, rel).toBeGreaterThan(identity.limit);
    }
  });
});
