import { describe, expect, it } from 'vitest';
import { substrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import {
  PerturbationSystem,
  defaultPerturbationConfig,
  perturbationSeed,
  type PerturbationConfig,
  type PerturbationSpec,
} from '@/../scripts/morphology/perturbation';

/*
 * E15: perturbation protokolünün dört şartı ayrı ayrı sınanır — muhasebe,
 * sıra bağımsızlığı, yapıyı bozan kaybın "toparlandı" sayılmaması, determinizm.
 *
 * Testler KISA pencerelerle koşar (§8.4'ün 60 saniyesi birim kapısına sığmaz);
 * ön-kayıtlı sayılar ayrı bir testle kilitlenir, gevşetilmez.
 */
const FAST: PerturbationConfig = {
  ...defaultPerturbationConfig,
  baselineSeconds: 0.5,
  recoverySeconds: 1,
  sampleIntervalTicks: 2,
};

const smallConfig = {
  ...substrateConfig,
  particles: { ...substrateConfig.particles, capacity: 64 },
};

function makeWorld(seed: number): LifeWorld {
  return new LifeWorld(smallConfig, createExplicitWorldMetadata(seed));
}

const KICK: PerturbationSpec = {
  kind: 'velocity-kick',
  magnitude: 2,
  targetFraction: 0.3,
  tick: 120,
};
const SHIFT: PerturbationSpec = {
  kind: 'position-shift',
  magnitude: 5,
  targetFraction: 0.2,
  tick: 240,
};

describe('Perturbation muhasebesi (E15)', () => {
  it('madde çıkarma muhasebeli yoldan geçer: aktif + rezervuar = başlangıç', () => {
    const world = makeWorld(3);
    const system = new PerturbationSystem(FAST);
    const initial = world.particles.activeCount;
    const externalBefore = world.reservoir.external;

    system.apply(world, { kind: 'matter-removal', magnitude: 0, targetFraction: 0.25, tick: 60 });

    const removed = initial - world.particles.activeCount;
    expect(removed).toBeGreaterThan(0);
    expect(world.reservoir.external - externalBefore).toBe(removed);
    expect(world.particles.activeCount + world.reservoir.external).toBe(initial);
  });

  it('değişmez tam koşudan sonra da korunur', () => {
    const world = makeWorld(4);
    const system = new PerturbationSystem(FAST);
    const initial = world.particles.activeCount;

    system.runAll(world, [
      { kind: 'matter-removal', magnitude: 0, targetFraction: 0.1, tick: 60 },
      KICK,
    ]);

    expect(world.particles.activeCount + world.reservoir.external).toBe(initial);
  }, 20_000);
});

describe('Spec sırasına bağımsızlık (E15)', () => {
  it('iki sıralama aynı sonucu verir', () => {
    const system = new PerturbationSystem(FAST);
    const forward = system.runAll(makeWorld(5), [KICK, SHIFT]);
    const reverse = system.runAll(makeWorld(5), [SHIFT, KICK]);

    const byKind = (results: typeof forward, kind: string) =>
      results.find((result) => result.spec.kind === kind);

    for (const kind of ['velocity-kick', 'position-shift']) {
      const a = byKind(forward, kind);
      const b = byKind(reverse, kind);
      expect(a?.recovered).toBe(b?.recovered);
      expect(a?.recoveryTicks).toBe(b?.recoveryTicks);
      expect(a?.postState.meanSpeed).toBeCloseTo(b?.postState.meanSpeed ?? -1, 12);
      expect(a?.postState.activeCount).toBe(b?.postState.activeCount);
    }
  }, 20_000);

  it('koşu bittiğinde dünya yakınsamış duruma geri döner', () => {
    const world = makeWorld(6);
    const system = new PerturbationSystem(FAST);
    const countBefore = world.particles.activeCount;
    const tickBefore = world.tick;

    system.runAll(world, [KICK, SHIFT]);

    expect(world.particles.activeCount).toBe(countBefore);
    expect(world.tick).toBe(tickBefore);
  }, 20_000);
});

describe('Toparlanma bandı (E15)', () => {
  /*
   * ESKİ HATA: sabit 0,15 eşiği vardı; %10 madde kaybında sayım farkı 0,10
   * olduğu için İLK kontrolde "toparlandı" deniyordu. Kayıp geri gelmiyor,
   * dolayısıyla bu koşu hiçbir zaman toparlanmamalı.
   */
  it('yapıyı bozan %10 madde kaybı toparlanmış sayılmaz', () => {
    const world = makeWorld(7);
    const system = new PerturbationSystem(FAST);

    const [result] = system.runAll(world, [
      { kind: 'matter-removal', magnitude: 0, targetFraction: 0.1, tick: 60 },
    ]);

    expect(result.recovered).toBe(false);
    expect(result.outOfBand.join(' ')).toContain('aktif madde');
  }, 20_000);

  it('taban bandı perturbation ÖNCESİ değişkenlikten çıkar', () => {
    const world = makeWorld(8);
    const system = new PerturbationSystem(FAST);

    const [result] = system.runAll(world, [KICK]);

    expect(result.baseline.sampleCount).toBeGreaterThan(1);
    expect(result.baseline.activeCount.mean).toBeGreaterThan(0);
    expect(result.baseline.meanSpeed.sigma).toBeGreaterThanOrEqual(0);
  }, 20_000);

  it('ön-kayıtlı sayılar §8.4’tedir ve test için gevşetilmez', () => {
    expect(defaultPerturbationConfig.baselineSigmaMultiple).toBe(2);
    expect(defaultPerturbationConfig.recoverySeconds).toBe(60);
  });

  it('iki örnekten az taban penceresi reddedilir', () => {
    const world = makeWorld(9);
    const system = new PerturbationSystem({
      ...FAST,
      baselineSeconds: 0.01,
      sampleIntervalTicks: 100,
    });

    expect(() => system.runAll(world, [KICK])).toThrow(RangeError);
  });
});

describe('Determinizm (E15)', () => {
  it('tohum (seed, spec, zaman) üçlüsünden çıkar', () => {
    expect(perturbationSeed(5, KICK)).toBe(perturbationSeed(5, KICK));
    expect(perturbationSeed(5, KICK)).not.toBe(perturbationSeed(6, KICK));
    expect(perturbationSeed(5, KICK)).not.toBe(perturbationSeed(5, { ...KICK, tick: 121 }));
    expect(perturbationSeed(5, KICK)).not.toBe(perturbationSeed(5, SHIFT));
  });

  /* ESKİ HATA: itme yönleri 0xdeadbeef sabitinden geliyordu; seed'den bağımsızdı. */
  it('farklı seed farklı itme yönü üretir, aynı seed aynısını', () => {
    const system = new PerturbationSystem(FAST);
    const kickOf = (seed: number): number[] => {
      const world = makeWorld(seed);
      system.apply(world, KICK);
      return [world.particles.vx[0], world.particles.vy[0]];
    };

    expect(kickOf(11)).toEqual(kickOf(11));
    expect(kickOf(11)).not.toEqual(kickOf(12));
  });

  it('aynı koşu iki kez aynı sonucu verir', () => {
    const system = new PerturbationSystem(FAST);
    const first = system.runAll(makeWorld(13), [KICK]);
    const second = system.runAll(makeWorld(13), [KICK]);

    expect(first[0].recoveryTicks).toBe(second[0].recoveryTicks);
    expect(first[0].postState.meanSpeed).toBeCloseTo(second[0].postState.meanSpeed, 12);
  }, 20_000);
});
