import { describe, expect, it } from 'vitest';
import { substrateConfig, type SubstrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';

/*
 * Birim kapısında aynı iddianın küçük sürümü koşar (`LifeWorld.test.ts`); burada
 * ÜRETİM kapasitesiyle (512) ve seed korpusuyla koşar. Kapsam altında paralel
 * koşan birim kapısında bu sürüm 5 sn'lik sınırı aşıyordu; timeout büyütmek
 * yerine ağır sürüm buraya taşındı (K6).
 */
const TICKS = 600;
const SEEDS = [19, 7, 42, 4242];

function productionConfig(): SubstrateConfig {
  return { ...substrateConfig, world: { ...substrateConfig.world, fieldResolution: 8 } };
}

describe('madde muhasebesi — üretim kapasitesi', () => {
  it.each(SEEDS)('seed %i: 512 parçacıkta aktif + rezervuar her tick korunur', (seed) => {
    const world = new LifeWorld(productionConfig(), createExplicitWorldMetadata(seed));
    const initial = world.particles.activeCount;
    const flagMismatches: string[] = [];
    const accountingBreaks: string[] = [];

    for (let tick = 1; tick <= TICKS; tick++) {
      world.step();
      const { active, capacity, activeCount } = world.particles;
      let flagged = 0;
      for (let slot = 0; slot < capacity; slot++) flagged += active[slot];
      if (flagged !== activeCount) flagMismatches.push(`tick ${tick}: ${flagged} ≠ ${activeCount}`);
      if (activeCount + world.reservoir.external !== initial) {
        accountingBreaks.push(`tick ${tick}: ${activeCount} + ${world.reservoir.external}`);
      }
    }

    expect(initial).toBe(512);
    expect(flagMismatches).toEqual([]);
    expect(accountingBreaks).toEqual([]);
    expect(world.reservoir.voidLossTotal).toBeGreaterThan(0);
    expect(world.particles.activeCount).toBe(initial - world.reservoir.voidLossTotal);
  });
});
