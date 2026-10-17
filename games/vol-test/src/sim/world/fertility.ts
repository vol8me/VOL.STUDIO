import { LAKE } from '@/config/lakes';
import type { FertilityMask } from '../weather/SurfaceGrid';
import type { LakeProbe } from './LakeField';
import type { World } from './World';

/** Kaya dibinde yeşillik büyümez: lobun dışında bu pay (birim) kadar çıplak taş bırakılır. */
const ROCK_BARE = 24;

/**
 * Dünyanın coğrafyasından yeşilliğin kök salabileceği yerleri çıkarır: göl ve kaya yeşillenmez,
 * göl kıyı şeridi (`LAKE.bank`) sulak ama yarı verimlidir. Sunucu ve istemci aynı dünyadan aynı
 * maskeyi kurar; böylece iklim anlık görüntüsü iki tarafta aynı hücrelere oturur.
 */
export function fertilityOf(world: World): FertilityMask {
  const probe: LakeProbe = { lake: -1, depth: 0, s: Infinity };
  return (x, y) => {
    if (!world.lakes.isEmpty) {
      world.lakes.probe(x, y, probe);
      if (probe.s < 1) return 0;
      if (probe.s < 1 + LAKE.bank) return 0.5;
    }
    if (!world.rocks.isEmpty && world.rocks.covers(x, y, ROCK_BARE)) return 0;
    return 1;
  };
}
