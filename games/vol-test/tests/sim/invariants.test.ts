import { describe, expect, it } from 'vitest';
import { createRandom } from '@volstudio/core/random';
import { SUSPENSION, TANK, WEAPON } from '@/config/tank';
import type { TankCommand } from '@/sim/command';
import { command, simulation, STEP_MS } from '../support/sim';

/**
 * Bulanık girdi altında simülasyonun değişmezleri. Örnek tabanlı testler
 * yazarın aklına gelen durumları sınar; burada tohumlu rastgele komutlar
 * (ani yön değişimi, duvara dayanma, sürekli ateş, hızlanma aç/kapa) binlerce
 * adım boyunca koşar ve hiçbir karede fiziksel olarak imkânsız bir durum
 * oluşmamalıdır.
 */
const SEEDS = [1, 7, 42, 1337, 90210, 424242];
const STEPS = 3000;

function randomCommand(next: () => number, previous: TankCommand): TankCommand {
  // Komutlar bir süre tutulur: gerçek oyuncu her karede yön değiştirmez.
  if (next() < 0.9) return previous;
  const angle = next() * Math.PI * 2;
  const magnitude = next() < 0.15 ? 0 : 0.3 + next() * 0.7;
  const aimAngle = next() * Math.PI * 2;
  return command({
    moveX: Math.cos(angle) * magnitude,
    moveY: Math.sin(angle) * magnitude,
    aimX: next() < 0.2 ? 0 : Math.cos(aimAngle),
    aimY: next() < 0.2 ? 0 : Math.sin(aimAngle),
    fire: next() < 0.35,
    boost: next() < 0.4,
  });
}

describe('simülasyon değişmezleri', () => {
  for (const seed of SEEDS) {
    it(`tohum ${seed}: ${STEPS} adımda durum fiziksel olarak geçerli kalır`, () => {
      const random = createRandom(seed);
      const next = () => random.next();
      // Küçük dünya: duvar temasları sık olsun.
      const sim = simulation(900);
      let current = command();
      const speedCeiling =
        TANK.maxSpeed * TANK.boostMultiplier * 1.05 + WEAPON.recoilImpulse / TANK.mass;
      for (let step = 0; step < STEPS; step++) {
        current = randomCommand(next, current);
        sim.step(current, STEP_MS);
        const tank = sim.tank;
        const values = [tank.x, tank.y, tank.vx, tank.vy, tank.hull, tank.angularVelocity];
        for (const value of values) expect(Number.isFinite(value), `adım ${step}`).toBe(true);

        const fx = Math.cos(tank.hull);
        const fy = Math.sin(tank.hull);
        for (const [a, b] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ] as const) {
          const px = tank.x + fx * TANK.halfLength * a - fy * TANK.halfWidth * b;
          const py = tank.y + fy * TANK.halfLength * a + fx * TANK.halfWidth * b;
          expect(px, `adım ${step} köşe x`).toBeGreaterThanOrEqual(-0.5);
          expect(px).toBeLessThanOrEqual(900.5);
          expect(py, `adım ${step} köşe y`).toBeGreaterThanOrEqual(-0.5);
          expect(py).toBeLessThanOrEqual(900.5);
        }
        expect(tank.speed, `adım ${step} hız`).toBeLessThanOrEqual(speedCeiling);
        expect(Math.abs(tank.angularVelocity)).toBeLessThan(12);
        expect(tank.hull).toBeGreaterThan(-Math.PI - 1e-9);
        expect(tank.hull).toBeLessThanOrEqual(Math.PI + 1e-9);
        expect(tank.turret).toBeGreaterThan(-Math.PI - 1e-9);
        expect(tank.turret).toBeLessThanOrEqual(Math.PI + 1e-9);
        expect(tank.boost).toBeGreaterThanOrEqual(0);
        expect(tank.boost).toBeLessThanOrEqual(TANK.boostCapacity);
        expect(Math.abs(tank.suspension.pitch)).toBeLessThanOrEqual(SUSPENSION.maxOffset);
        expect(Math.abs(tank.suspension.roll)).toBeLessThanOrEqual(SUSPENSION.maxOffset);
        expect(sim.projectiles.count).toBeLessThanOrEqual(WEAPON.capacity);
      }
      sim.drainEvents([]);
    });
  }

  it('palet izleri yalnız ileri akar: yer yolu azalmaz', () => {
    const random = createRandom(5);
    const sim = simulation(900);
    let current = command();
    let left = 0;
    let right = 0;
    for (let step = 0; step < 2000; step++) {
      current = randomCommand(() => random.next(), current);
      sim.step(current, STEP_MS);
      expect(sim.tank.groundLeft).toBeGreaterThanOrEqual(left);
      expect(sim.tank.groundRight).toBeGreaterThanOrEqual(right);
      left = sim.tank.groundLeft;
      right = sim.tank.groundRight;
    }
  });
});
