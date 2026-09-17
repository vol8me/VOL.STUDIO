import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { substrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import { createTriangularKernel } from '../../benchmarks/fixtures/triangularKernel';
import { validateNegativeControlSummary } from '@/../scripts/morphology/negativeControlSummary';

/*
 * F2: negatif kontrol YENİDEN ÜRETİLEBİLİR olmalı. Özet şeması doğrulanır ve
 * kısa bir smoke koşusu aynı girdinin aynı sonucu verdiğini gösterir.
 */
function smokeConfig(): typeof substrateConfig {
  return {
    ...substrateConfig,
    particles: { ...substrateConfig.particles, capacity: 128 },
  };
}

function smokeRun(seed: number): { active: number; fingerprint: number } {
  const world = new LifeWorld(smokeConfig(), createExplicitWorldMetadata(seed), {
    kernel: createTriangularKernel(),
  });
  for (let tick = 0; tick < 60; tick++) world.step();
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
  }, 20_000);

  it('farklı seed farklı sonuç verir', () => {
    expect(smokeRun(7).fingerprint).not.toBe(smokeRun(8).fingerprint);
  }, 20_000);

  it('reddedilen kernel gerçekten farklı bir fizik üretir', () => {
    const control = smokeRun(7);
    const production = new LifeWorld(smokeConfig(), createExplicitWorldMetadata(7));
    for (let tick = 0; tick < 60; tick++) production.step();
    let fingerprint = 0;
    for (let slot = 0; slot < production.particles.capacity; slot++) {
      if (production.particles.active[slot] === 0) continue;
      fingerprint = (fingerprint + Math.round(production.particles.x[slot] * 1000)) % 2147483647;
    }

    expect(control.fingerprint).not.toBe(fingerprint);
  }, 20_000);

  it('özet şeması doğrulanır', () => {
    const seed = (value: number): Record<string, unknown> => ({
      seed: value,
      retention: 0.5,
      clusteredFraction: 0.3,
      meanSpeed: 0.2,
      primaryReason: 'GAS',
    });
    const arm = (kernel: string, seeds: number[]): Record<string, unknown> => ({
      kernel,
      seedler: seeds.map(seed),
      medyanKoruma: 0.5,
      medyanKümeliMadde: 0.3,
      gerekçeDağılımı: { GAS: seeds.length },
    });
    const valid = {
      schemaVersion: 2,
      madde: 'F2',
      tarih: '2026-09-17',
      candidateDigest: 'a'.repeat(16),
      tickCount: 3600,
      sampleInterval: 30,
      seedCount: 2,
      süreMs: 10,
      kontrol: arm('triangular-v1 (REDDEDİLEN)', [1, 2]),
      referans: arm('multi-band (üretim)', [1, 2]),
    };

    expect(validateNegativeControlSummary(valid).schemaVersion).toBe(2);
    expect(() => validateNegativeControlSummary({ ...valid, schemaVersion: 1 })).toThrow(
      RangeError,
    );
    expect(() => validateNegativeControlSummary({ ...valid, candidateDigest: 'kısa' })).toThrow(
      RangeError,
    );
    expect(() =>
      validateNegativeControlSummary({ ...valid, kontrol: arm('triangular', []) }),
    ).toThrow(RangeError);
  });

  /*
   * İki kol AYNI tohumlarda koşmazsa karşılaştırma anlamsızdır: farkın
   * kernelden mi tohumdan mı geldiği ayrılamaz.
   */
  it('kolların tohumları ayrışırsa özet reddedilir', () => {
    const arm = (kernel: string, seeds: number[]): Record<string, unknown> => ({
      kernel,
      seedler: seeds.map((value) => ({
        seed: value,
        retention: 0.5,
        clusteredFraction: 0.3,
        meanSpeed: 0.2,
        primaryReason: 'GAS',
      })),
      medyanKoruma: 0.5,
      medyanKümeliMadde: 0.3,
      gerekçeDağılımı: { GAS: seeds.length },
    });

    expect(() =>
      validateNegativeControlSummary({
        schemaVersion: 2,
        madde: 'F2',
        tarih: '2026-09-17',
        candidateDigest: 'a'.repeat(16),
        tickCount: 3600,
        sampleInterval: 30,
        seedCount: 2,
        süreMs: 10,
        kontrol: arm('triangular-v1 (REDDEDİLEN)', [1, 2]),
        referans: arm('multi-band (üretim)', [1, 3]),
      }),
    ).toThrow(RangeError);
  });

  /*
   * Diskteki GERÇEK özet de şemayı geçer. Dosya kanıt olarak commit'lenir;
   * "dosya yoksa atla" koşulu, koşmamış bir F2'yi yeşil gösterirdi.
   */
  it('yazılmış F2 özeti şemayı geçer', () => {
    const summary = validateNegativeControlSummary(
      JSON.parse(readFileSync('benchmarks/results/v1-negative-control.json', 'utf8')),
    );
    expect(summary.kontrol.seedler.length).toBe(summary.referans.seedler.length);
    expect(summary.kontrol.kernel).not.toBe(summary.referans.kernel);
  });
});
