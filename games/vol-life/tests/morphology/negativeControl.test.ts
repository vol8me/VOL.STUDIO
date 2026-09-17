import { describe, expect, it } from 'vitest';
import { substrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import { createTriangularKernel } from '../../benchmarks/fixtures/triangularKernel';
import { validateNegativeControlSummary } from '@/../scripts/morphology/negativeControlSummary';

/*
 * F2: negatif kontrol YENİDEN ÜRETİLEBİLİR olmalı. Özet şeması doğrulanır ve
 * kısa bir smoke koşusu aynı girdinin aynı sonucu verdiğini gösterir.
 */
function smokeRun(seed: number): { active: number; fingerprint: number } {
  const world = new LifeWorld(substrateConfig, createExplicitWorldMetadata(seed), {
    kernel: createTriangularKernel(),
  });
  for (let tick = 0; tick < 120; tick++) world.step();
  let fingerprint = 0;
  for (let slot = 0; slot < world.particles.capacity; slot++) {
    if (world.particles.active[slot] === 0) continue;
    fingerprint = (fingerprint + Math.round(world.particles.x[slot] * 1000)) % 2147483647;
  }
  return { active: world.particles.activeCount, fingerprint };
}

describe('F2 — V1 negatif kontrolü', () => {
  it('aynı seed aynı sonucu verir', () => {
    expect(smokeRun(7)).toEqual(smokeRun(7));
  });

  it('farklı seed farklı sonuç verir', () => {
    expect(smokeRun(7).fingerprint).not.toBe(smokeRun(8).fingerprint);
  });

  it('reddedilen kernel gerçekten farklı bir fizik üretir', () => {
    const control = smokeRun(7);
    const production = new LifeWorld(substrateConfig, createExplicitWorldMetadata(7));
    for (let tick = 0; tick < 120; tick++) production.step();
    let fingerprint = 0;
    for (let slot = 0; slot < production.particles.capacity; slot++) {
      if (production.particles.active[slot] === 0) continue;
      fingerprint = (fingerprint + Math.round(production.particles.x[slot] * 1000)) % 2147483647;
    }

    expect(control.fingerprint).not.toBe(fingerprint);
  });

  it('özet şeması doğrulanır', () => {
    const valid = {
      schemaVersion: 1,
      madde: 'F2',
      tarih: '2026-09-17',
      kernel: 'triangular-v1 (REDDEDİLEN)',
      candidateDigest: 'a'.repeat(16),
      tickCount: 3600,
      sampleInterval: 30,
      seedCount: 1,
      süreMs: 10,
      seedler: [
        {
          seed: 1,
          retention: 0.5,
          clusteredFraction: 0.3,
          meanSpeed: 0.2,
          primaryReason: 'GAS',
        },
      ],
      medyanKoruma: 0.5,
      medyanKümeliMadde: 0.3,
      gerekçeDağılımı: { GAS: 1 },
    };

    expect(validateNegativeControlSummary(valid).schemaVersion).toBe(1);
    expect(() => validateNegativeControlSummary({ ...valid, schemaVersion: 2 })).toThrow(
      RangeError,
    );
    expect(() => validateNegativeControlSummary({ ...valid, candidateDigest: 'kısa' })).toThrow(
      RangeError,
    );
    expect(() => validateNegativeControlSummary({ ...valid, seedler: [] })).toThrow(RangeError);
  });
});
