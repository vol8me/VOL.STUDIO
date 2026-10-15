import { describe, expect, it } from 'vitest';
import { createRandom } from '@volstudio/core/random';
import type { LakeSpec } from '@/config/lakes';
import type { OutcropSpec } from '@/config/rocks';
import { VEHICLE_IDS, VEHICLES, topSpeedOf } from '@/config/vehicles';
import type { TankCommand } from '@/sim/command';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';
import { command, STEP_MS } from '../support/sim';

/**
 * Her araç kimliği için bulanık girdi değişmezleri. `invariants.test.ts` yalnız Striker'ı sürer; burada
 * kataloğun tamamı göl ve kayalı küçük bir dünyada tohumlu rastgele komutlarla (atılım, sıçrayış,
 * ateş, ani yön) koşar: hiçbir karede sonlu olmayan değer, dünya dışı konum, aralık dışı rezerv, tırmanış
 * ya da sudaki derinlik, geçersiz parça maskesi ya da hız tavanı aşımı olmamalıdır. Katalog büyüdükçe
 * yeni araç bu sınamaya kendiliğinden girer.
 */
const SIZE = 1400;
const STEPS = 1500;
const SEEDS = [3, 29];
const LAKE: LakeSpec = {
  id: 'test-lake',
  x: 0.5,
  y: 0.5,
  rx: 170,
  ry: 120,
  rotation: 0.3,
  shape: [[3, 0.08, 0.4]],
};
const ROCK: OutcropSpec = { id: 'test-rock', x: 0.25, y: 0.7, radius: 110, lobes: 3, seed: 5 };
/** En hızlı atılım çarpanı (2,35) ile geri tepme ve çarpma sekmesi için pay. */
const SPEED_MARGIN = 3.4;
const PARTS_LIMIT = 1 << 8;

function randomCommand(next: () => number, previous: TankCommand): TankCommand {
  // Komutlar bir süre tutulur: gerçek oyuncu her karede yön değiştirmez.
  if (next() < 0.92) return previous;
  const angle = next() * Math.PI * 2;
  const magnitude = next() < 0.12 ? 0 : 0.4 + next() * 0.6;
  const aim = next() * Math.PI * 2;
  return command({
    moveX: Math.cos(angle) * magnitude,
    moveY: Math.sin(angle) * magnitude,
    aimX: Math.cos(aim),
    aimY: Math.sin(aim),
    fire: next() < 0.4,
    boost: next() < 0.4,
    brake: next() < 0.4,
  });
}

describe('araç başına değişmezler (göl ve kayalı dünya)', () => {
  for (const id of VEHICLE_IDS) {
    for (const seed of SEEDS) {
      it(`${id}, tohum ${seed}: ${STEPS} adımda durum geçerli kalır`, () => {
        const spec = VEHICLES[id];
        const world = new World(SIZE, SIZE, 128, [LAKE], [ROCK]);
        const sim = new Simulation({ world, vehicle: spec });
        const random = createRandom(seed);
        const next = (): number => random.next();
        const ceiling = topSpeedOf(spec) * SPEED_MARGIN;
        const found: string[] = [];
        const record = (message: string): void => {
          if (found.length < 5) found.push(message);
        };
        let current = command();
        let travelled = 0;
        for (let step = 0; step < STEPS; step++) {
          current = randomCommand(next, current);
          sim.step(current, STEP_MS);
          const chassis = sim.player.chassis;
          const values = [
            chassis.x,
            chassis.y,
            chassis.vx,
            chassis.vy,
            chassis.hull,
            chassis.angularVelocity,
            chassis.boost,
            chassis.climb,
            chassis.waterDepth,
            sim.player.vitality.health,
          ];
          travelled += chassis.speed * (STEP_MS / 1000);
          if (!values.every(Number.isFinite)) {
            record(`adım ${step}: sonlu olmayan değer ${values.join(', ')}`);
            break;
          }
          if (!(chassis.x >= 0 && chassis.x <= SIZE && chassis.y >= 0 && chassis.y <= SIZE))
            record(`adım ${step}: merkez dünya dışında (${chassis.x}, ${chassis.y})`);
          if (!(chassis.speed <= ceiling))
            record(`adım ${step}: hız ${chassis.speed} > ${ceiling}`);
          if (!(chassis.boost >= 0 && chassis.boost <= chassis.boostCapacity + 1e-6))
            record(`adım ${step}: rezerv aralık dışı ${chassis.boost}`);
          if (!(chassis.climb >= 0 && chassis.climb <= 1))
            record(`adım ${step}: tırmanış aralık dışı ${chassis.climb}`);
          if (!(chassis.waterDepth >= 0 && chassis.waterDepth <= 1.0001))
            record(`adım ${step}: su derinliği aralık dışı ${chassis.waterDepth}`);
          if (!Number.isInteger(chassis.parts) || chassis.parts < 0 || chassis.parts >= PARTS_LIMIT)
            record(`adım ${step}: parça maskesi geçersiz ${chassis.parts}`);
          if (!(sim.player.vitality.health >= 0 && sim.player.vitality.health <= spec.health))
            record(`adım ${step}: can aralık dışı ${sim.player.vitality.health}`);
        }
        expect(found).toEqual([]);
        // Sınama boş durmaz: araç gerçekten yol alır.
        expect(travelled, `${id} yol`).toBeGreaterThan(50);
        sim.drainEvents([]);
      });
    }
  }
});
