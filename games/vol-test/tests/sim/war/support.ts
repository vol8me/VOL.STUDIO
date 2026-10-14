import { Simulation } from '@/sim/Simulation';
import { War, type WarOptions } from '@/sim/war/War';
import { World } from '@/sim/world/World';

/** Hedef dünya ölçüsü: savaş düzeni bu boyda tasarlanmıştır. */
export const SIZE = 12288;

export function arena(): Simulation {
  return new Simulation({ world: new World(SIZE, SIZE, 128), spawnPlayer: false });
}

export function newWar(options: WarOptions = { populate: false }): War {
  return new War(arena(), options);
}
