import { describe, expect, it } from 'vitest';
import { createRandom } from '@volstudio/core/random';
import { TANK } from '@/config/tank';
import type { TankCommand } from '@/sim/command';
import type { SimEvent } from '@/sim/events';
import type { Simulation } from '@/sim/Simulation';
import type { Tank } from '@/sim/tank/Tank';
import { command, simulation, STEP_MS } from '../support/sim';

/** Dört köşenin dünya sınırına göre en derin taşması (≤ 0: hepsi içeride). */
function worstEscape(tank: Tank, size: number): number {
  const fx = Math.cos(tank.hull);
  const fy = Math.sin(tank.hull);
  let worst = Number.NEGATIVE_INFINITY;
  for (const [along, across] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const x = tank.x + fx * TANK.halfLength * along - fy * TANK.halfWidth * across;
    const y = tank.y + fy * TANK.halfLength * along + fx * TANK.halfWidth * across;
    worst = Math.max(worst, -x, x - size, -y, y - size);
  }
  return worst;
}

/** İki gövde arasındaki en küçük ayırıcı-eksen örtüşmesi (0: ayrık). */
function overlapDepth(a: Tank, b: Tank): number {
  const corners = (tank: Tank) => {
    const fx = Math.cos(tank.hull);
    const fy = Math.sin(tank.hull);
    const out: Array<[number, number]> = [];
    for (const along of [1, -1])
      for (const across of [1, -1])
        out.push([
          tank.x + fx * TANK.halfLength * along - fy * TANK.halfWidth * across,
          tank.y + fy * TANK.halfLength * along + fx * TANK.halfWidth * across,
        ]);
    return out;
  };
  const first = corners(a);
  const second = corners(b);
  let depth = Number.POSITIVE_INFINITY;
  for (const tank of [a, b]) {
    for (const angle of [tank.hull, tank.hull + Math.PI / 2]) {
      const ax = Math.cos(angle);
      const ay = Math.sin(angle);
      const range = (points: Array<[number, number]>) => {
        const values = points.map(([x, y]) => x * ax + y * ay);
        return [Math.min(...values), Math.max(...values)] as const;
      };
      const [a0, a1] = range(first);
      const [b0, b1] = range(second);
      const overlap = Math.min(a1 - b0, b1 - a0);
      if (overlap <= 0) return 0;
      depth = Math.min(depth, overlap);
    }
  }
  return depth;
}

/**
 * Duvar sert sınırdır; araçlar sıkışık kümede tam ayrılamayabilir. Ölçüm
 * (4 tohum × 4000 adım, 48 000 araç çifti ve köşe yığını): en kötü kalan
 * örtüşme ≈0,05 birim; sınır bunun on katıdır.
 */
const MAX_RESIDUAL_OVERLAP = 0.5;

function expectSeparated(sim: Simulation, label: string): void {
  const tanks = sim.vehicles.map((vehicle) => vehicle.tank);
  for (let first = 0; first < tanks.length; first++)
    for (let second = first + 1; second < tanks.length; second++)
      expect(overlapDepth(tanks[first], tanks[second]), label).toBeLessThan(MAX_RESIDUAL_OVERLAP);
}

function expectAllInside(sim: Simulation, size: number, label: string): void {
  for (const vehicle of sim.vehicles) {
    expect(worstEscape(vehicle.tank, size), `${label} araç ${vehicle.id}`).toBeLessThanOrEqual(
      1e-6,
    );
  }
}

describe('duvar ve araç temasının ortak çözümü (B18)', () => {
  it('duvar dibindeki oyuncuyu ikinci araç iterken bütün gövde köşeleri dünyada kalır', () => {
    const size = 1000;
    const sim = simulation(size);
    sim.player.tank.place(26, 500, 0);
    const rammer = sim.spawn(500, 500, Math.PI);
    const drive = (vehicle: { id: number }): TankCommand =>
      vehicle.id === rammer.id
        ? command({ moveX: -1, aimX: -1, boost: true })
        : command({ moveX: -1 });
    for (let step = 0; step < 240; step++) {
      sim.step(drive, STEP_MS);
      expectAllInside(sim, size, `adım ${step}`);
    }
    // Araçlar gerçekten temas etti: düzeltme sınaması boş geçmedi.
    expect(rammer.tank.x).toBeLessThan(200);
  });

  it('köşeye sıkışan üç araçta duvar sert sınırdır; araçlar ayrılmaya çalışır', () => {
    const size = 900;
    const sim = simulation(size);
    sim.player.tank.place(60, 60, Math.PI * 0.75);
    const second = sim.spawn(130, 70, Math.PI * 0.9);
    const third = sim.spawn(90, 140, -Math.PI * 0.8);
    const toCorner = (vehicle: { id: number }): TankCommand =>
      command({
        moveX: vehicle.id === second.id ? -0.9 : -0.6,
        moveY: vehicle.id === third.id ? -1 : -0.4,
        boost: true,
      });
    for (let step = 0; step < 600; step++) {
      sim.step(toCorner, STEP_MS);
      expectAllInside(sim, size, `adım ${step}`);
      expectSeparated(sim, `adım ${step}`);
    }
    for (const vehicle of sim.vehicles) {
      expect(Number.isFinite(vehicle.tank.x + vehicle.tank.y + vehicle.tank.vx)).toBe(true);
    }
  });

  it('duvara iterilen araç hem collision hem wallHit olayı üretir', () => {
    const size = 1000;
    const sim = simulation(size);
    sim.player.tank.place(30, 500, 0);
    const rammer = sim.spawn(300, 500, Math.PI);
    const events: SimEvent[] = [];
    for (let step = 0; step < 240; step++) {
      sim.step(
        (vehicle) =>
          vehicle.id === rammer.id ? command({ moveX: -1, aimX: -1, boost: true }) : command(),
        STEP_MS,
      );
      sim.drainEvents(events);
    }
    expect(events.some((event) => event.kind === 'collision')).toBe(true);
    expect(events.some((event) => event.kind === 'wallHit' && event.source === sim.player.id)).toBe(
      true,
    );
  });

  for (const seed of [3, 19, 2024, 77_001]) {
    it(`tohum ${seed}: üç araç ve sürekli ateşle 4000 adımda köşeler hiç dışarı çıkmaz`, () => {
      const size = 640;
      const random = createRandom(seed);
      const sim = simulation(size);
      sim.spawn(160, 160, 0);
      sim.spawn(480, 420, Math.PI);
      const held = new Map<number, TankCommand>();
      for (let step = 0; step < 4000; step++) {
        sim.step((vehicle) => {
          let current = held.get(vehicle.id) ?? command();
          if (random.next() > 0.9) {
            const angle = random.next() * Math.PI * 2;
            current = command({
              moveX: Math.cos(angle),
              moveY: Math.sin(angle),
              aimX: Math.cos(angle + 1),
              aimY: Math.sin(angle + 1),
              fire: random.next() < 0.3,
              boost: random.next() < 0.5,
              brake: random.next() < 0.1,
            });
            held.set(vehicle.id, current);
          }
          return current;
        }, STEP_MS);
        expectAllInside(sim, size, `adım ${step}`);
        expectSeparated(sim, `adım ${step}`);
      }
      sim.drainEvents([]);
    });
  }
});
