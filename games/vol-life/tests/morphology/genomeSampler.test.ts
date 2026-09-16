import { describe, expect, it } from 'vitest';
import { GenomeSampler, defaultSamplerOptions } from '@/../scripts/morphology/genomeSampler';
import { validateSubstratePhysicsProfile } from '@/config/genome';
import { defaultSubstrateCandidate } from '@/config/candidate';
import { particleConfig } from '@/config/particles';

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
