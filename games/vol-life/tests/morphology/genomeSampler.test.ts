import { describe, expect, it } from 'vitest';
import { GenomeSampler, defaultSamplerOptions } from '@/../scripts/morphology/genomeSampler';
import { validateSubstratePhysicsProfile } from '@/config/genome';
import {
  defaultSubstrateCandidate,
  defaultVoidProfile,
  digestVoidProfile,
  type SubstrateCandidate,
} from '@/config/candidate';
import { particleConfig } from '@/config/particles';

const FIXED_VOID_DIGEST = digestVoidProfile(defaultVoidProfile);

describe('GenomeSampler', () => {
  it('varsayılan genomdan geçerli aday üretir', () => {
    const sampler = new GenomeSampler({ ...defaultSamplerOptions, seed: 42 });
    const candidate = sampler.sample(defaultSubstrateCandidate);
    expect(() =>
      validateSubstratePhysicsProfile(candidate.physics, particleConfig.radiusUnits),
    ).not.toThrow();
  });

  it('farklı tohumlar farklı aday üretir', () => {
    const sampler1 = new GenomeSampler({ ...defaultSamplerOptions, seed: 1 });
    const sampler2 = new GenomeSampler({ ...defaultSamplerOptions, seed: 2 });
    const c1 = sampler1.sample();
    const c2 = sampler2.sample();
    expect(c1.physics.strength).not.toEqual(c2.physics.strength);
  });

  it('korpus istenen sayıda aday üretir', () => {
    const sampler = new GenomeSampler({ ...defaultSamplerOptions, seed: 7 });
    const corpus = sampler.sampleCorpus(defaultSubstrateCandidate, 5);
    expect(corpus).toHaveLength(5);
    for (const genome of corpus) {
      expect(() =>
        validateSubstratePhysicsProfile(genome.physics, particleConfig.radiusUnits),
      ).not.toThrow();
    }
  });

  it('geçersiz aday denemeden sonra tabana döner', () => {
    const sampler = new GenomeSampler({
      ...defaultSamplerOptions,
      seed: 0,
      strengthJitter: 2,
    });
    const candidate = sampler.sample(defaultSubstrateCandidate);
    expect(candidate.physics.schemaVersion).toBe(defaultSubstrateCandidate.physics.schemaVersion);
  });
});

/*
 * E2: Void profili Adım 2'de SABİTLENİR. Adım 3 morfoloji araması onu optimize
 * edemez, örnekleyemez ve kaydıramaz — ne ayar yoluyla ne de taban aday
 * üzerinden. Aşağıdaki testler bu imkânsızlığı hem imzada hem davranışta arar.
 */
describe('GenomeSampler — Void profili sabittir (E2)', () => {
  it('sampler seçenekleri Void’e dair hiçbir ayar taşımaz', () => {
    const keys = Object.keys(defaultSamplerOptions);

    expect(keys.filter((key) => /fringe|tidal|void/i.test(key))).toEqual([]);
  });

  it('farklı tohumlarla üretilen bütün adaylar aynı Void digest’ini taşır', () => {
    const digests = new Set<string>();
    for (const seed of [0, 1, 7, 42, 1337]) {
      const sampler = new GenomeSampler({ ...defaultSamplerOptions, seed });
      for (const candidate of sampler.sampleCorpus(defaultSubstrateCandidate, 4)) {
        digests.add(digestVoidProfile(candidate.void));
      }
    }

    expect([...digests]).toEqual([FIXED_VOID_DIGEST]);
  });

  /*
   * Kurcalanmış taban en tehlikeli sızıntı yoludur: sampler tabanın Void'ini
   * kopyalasaydı, arama başka bir kıyı fiziğiyle koşar ve bu hiçbir yerde
   * görünmezdi.
   */
  it('kurcalanmış tabandan örneklense bile Void sabit profilden gelir', () => {
    const tampered: SubstrateCandidate = {
      ...defaultSubstrateCandidate,
      void: { ...defaultVoidProfile, widthUnits: 48, tidalStrength: 0.5 },
    };
    const sampler = new GenomeSampler({ ...defaultSamplerOptions, seed: 5 });

    const candidate = sampler.sample(tampered);

    expect(digestVoidProfile(candidate.void)).toBe(FIXED_VOID_DIGEST);
    expect(candidate.void.widthUnits).toBe(defaultVoidProfile.widthUnits);
    expect(candidate.void.tidalStrength).toBe(defaultVoidProfile.tidalStrength);
  });

  /* E10'un void-stress senaryosu da AYNI sabit profili kullanır. */
  it('void-stress senaryolu taban aynı sabit Void profilini taşır', () => {
    const stressed: SubstrateCandidate = {
      ...defaultSubstrateCandidate,
      scenario: { kind: 'void-stress', tidalControl: false },
    };
    const sampler = new GenomeSampler({ ...defaultSamplerOptions, seed: 11 });

    const candidate = sampler.sample(stressed);

    expect(candidate.scenario).toEqual({ kind: 'void-stress', tidalControl: false });
    expect(digestVoidProfile(candidate.void)).toBe(FIXED_VOID_DIGEST);
  });
});
