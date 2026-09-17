import type { SubstrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import type { Calibration } from './funnel';

/**
 * Tick maliyeti ÖLÇÜLÜR (E13). Huni tahminleri buradan çıkar; sabit bir sayı
 * yazmak, makineye ve aday büyüklüğüne göre değişen bir şeyi bilir gibi
 * davranmak olurdu.
 */
export function measureCalibration(config: SubstrateConfig, ticks = 600): Calibration {
  const world = new LifeWorld(config, createExplicitWorldMetadata(1));
  const particleCount = world.particles.activeCount;
  // Ölçümden önce ısınma: ilk tick'ler JIT yüzünden temsili değildir.
  for (let tick = 0; tick < 60; tick++) world.step();
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick++) world.step();
  const elapsed = performance.now() - started;
  return { msPerTick: elapsed / ticks, particleCount, measuredAtMs: Date.now() };
}
