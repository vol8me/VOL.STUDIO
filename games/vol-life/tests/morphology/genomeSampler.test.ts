import { describe, expect, it } from 'vitest';
import { GenomeSampler, defaultSamplerOptions } from '@/../scripts/morphology/genomeSampler';
import { defaultPhysicsGenome, validatePhysicsGenome } from '@/config/genome';
import { particleConfig } from '@/config/particles';

describe('GenomeSampler', () => {
  it('varsayılan genomdan geçerli aday üretir', () => {
    const sampler = new GenomeSampler({ ...defaultSamplerOptions, seed: 42 });
    const candidate = sampler.sample(defaultPhysicsGenome);
    expect(() => validatePhysicsGenome(candidate, particleConfig.radiusUnits)).not.toThrow();
  });

  it('farklı tohumlar farklı aday üretir', () => {
    const sampler1 = new GenomeSampler({ ...defaultSamplerOptions, seed: 1 });
    const sampler2 = new GenomeSampler({ ...defaultSamplerOptions, seed: 2 });
    const c1 = sampler1.sample();
    const c2 = sampler2.sample();
    expect(c1.strength).not.toEqual(c2.strength);
  });

  it('korpus istenen sayıda aday üretir', () => {
    const sampler = new GenomeSampler({ ...defaultSamplerOptions, seed: 7 });
    const corpus = sampler.sampleCorpus(defaultPhysicsGenome, 5);
    expect(corpus).toHaveLength(5);
    for (const genome of corpus) {
      expect(() => validatePhysicsGenome(genome, particleConfig.radiusUnits)).not.toThrow();
    }
  });

  it('geçersiz aday denemeden sonra tabana döner', () => {
    const sampler = new GenomeSampler({
      ...defaultSamplerOptions,
      seed: 0,
      strengthJitter: 2,
    });
    const candidate = sampler.sample(defaultPhysicsGenome);
    expect(candidate.schemaVersion).toBe(defaultPhysicsGenome.schemaVersion);
  });
});
