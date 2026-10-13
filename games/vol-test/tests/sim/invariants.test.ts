import { describe, expect, it } from 'vitest';
import { createRandom } from '@volstudio/core/random';
import { SUSPENSION, TANK, WEAPON } from '@/config/tank';
import type { TankCommand } from '@/sim/command';
import { command, simulation, STEP_MS } from '../support/sim';

/**
 * Bulanık girdi altında simülasyonun değişmezleri. Örnek tabanlı testler
 * yazarın aklına gelen durumları sınar; burada tohumlu rastgele komutlar
 * (ani yön değişimi, duvara dayanma, sürekli ateş, hızlanma aç/kapa, fren) binlerce
 * adım boyunca koşar ve hiçbir karede fiziksel olarak imkânsız bir durum
 * oluşmamalıdır.
 */
const SEEDS = [1, 7, 42, 1337, 90210, 424242];
const STEPS = 3000;

/**
 * Kare başına onlarca `expect` çağrısı, kapsam ölçümü ve paralel koşu altında 5 sn'lik varsayılan
 * sınama bütçesini aşıyordu (tek başına ~2 sn, yük altında 5–7 sn). Karşılaştırmalar düz koşulda
 * yapılır, ihlaller toplanır ve sınama sonunda tek `expect` ile raporlanır; `!(x >= a)` biçimi
 * NaN'ı da ihlal sayar.
 */
class Violations {
  readonly found: string[] = [];

  /** Yalnız ilk birkaç ihlal tutulur: bozuk bir durum binlerce satır üretmesin. */
  record(message: string): void {
    if (this.found.length < 5) this.found.push(message);
  }
}

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
    brake: next() < 0.15,
  });
}

describe('simülasyon değişmezleri', () => {
  for (const seed of SEEDS) {
    it(`tohum ${seed}: ${STEPS} adımda durum fiziksel olarak geçerli kalır`, () => {
      const random = createRandom(seed);
      const next = () => random.next();
      // Küçük dünya: duvar temasları sık olsun.
      const sim = simulation(900);
      const violations = new Violations();
      let current = command();
      const speedCeiling =
        TANK.maxSpeed * TANK.boostMultiplier * 1.05 + WEAPON.recoilImpulse / TANK.mass;
      for (let step = 0; step < STEPS; step++) {
        current = randomCommand(next, current);
        sim.step(current, STEP_MS);
        const tank = sim.player.chassis;
        const values = [tank.x, tank.y, tank.vx, tank.vy, tank.hull, tank.angularVelocity];
        if (!values.every(Number.isFinite)) {
          violations.record(`adım ${step}: sonlu olmayan değer ${values.join(', ')}`);
          continue;
        }

        const fx = Math.cos(tank.hull);
        const fy = Math.sin(tank.hull);
        for (let corner = 0; corner < 4; corner++) {
          const a = corner < 2 ? 1 : -1;
          const b = corner % 2 === 0 ? 1 : -1;
          const px = tank.x + fx * TANK.halfLength * a - fy * TANK.halfWidth * b;
          const py = tank.y + fy * TANK.halfLength * a + fx * TANK.halfWidth * b;
          if (!(px >= -0.5 && px <= 900.5 && py >= -0.5 && py <= 900.5)) {
            violations.record(`adım ${step}: köşe dünya dışında (${px}, ${py})`);
          }
        }
        if (!(tank.speed <= speedCeiling)) {
          violations.record(`adım ${step}: hız ${tank.speed} > ${speedCeiling}`);
        }
        if (!(Math.abs(tank.angularVelocity) < 12)) {
          violations.record(`adım ${step}: açısal hız ${tank.angularVelocity}`);
        }
        if (!(tank.hull > -Math.PI - 1e-9 && tank.hull <= Math.PI + 1e-9)) {
          violations.record(`adım ${step}: gövde açısı aralık dışı ${tank.hull}`);
        }
        if (!(tank.turret > -Math.PI - 1e-9 && tank.turret <= Math.PI + 1e-9)) {
          violations.record(`adım ${step}: kule açısı aralık dışı ${tank.turret}`);
        }
        if (!(tank.boost >= 0 && tank.boost <= TANK.boostCapacity)) {
          violations.record(`adım ${step}: takviye aralık dışı ${tank.boost}`);
        }
        const { pitch, roll } = tank.suspension;
        if (!(Math.abs(pitch) <= SUSPENSION.maxOffset && Math.abs(roll) <= SUSPENSION.maxOffset)) {
          violations.record(`adım ${step}: süspansiyon aralık dışı (${pitch}, ${roll})`);
        }
        if (!(sim.projectiles.count <= WEAPON.capacity)) {
          violations.record(`adım ${step}: mermi sayısı ${sim.projectiles.count}`);
        }
      }
      expect(violations.found).toEqual([]);
      sim.drainEvents([]);
    });
  }

  it('palet izleri yalnız ileri akar: yer yolu azalmaz', () => {
    const random = createRandom(5);
    const sim = simulation(900);
    let current = command();
    const violations = new Violations();
    let left = 0;
    let right = 0;
    for (let step = 0; step < 2000; step++) {
      current = randomCommand(() => random.next(), current);
      sim.step(current, STEP_MS);
      const { groundLeft, groundRight } = sim.player.chassis;
      if (!(groundLeft >= left && groundRight >= right)) {
        violations.record(
          `adım ${step}: yer yolu geri gitti (sol ${left} → ${groundLeft}, sağ ${right} → ${groundRight})`,
        );
      }
      left = groundLeft;
      right = groundRight;
    }
    expect(violations.found).toEqual([]);
  });

  it('üç araç rastgele sürülüp çarpışırken iç içe geçmez ve dünyada kalır', () => {
    const random = createRandom(2024);
    const sim = simulation(700);
    const others = [sim.spawn(250, 250, 0), sim.spawn(450, 450, Math.PI)];
    const commands = new Map<number, TankCommand>();
    for (const vehicle of sim.vehicles) commands.set(vehicle.id, command());
    const violations = new Violations();
    for (let step = 0; step < STEPS; step++) {
      for (const vehicle of sim.vehicles) {
        commands.set(
          vehicle.id,
          randomCommand(() => random.next(), commands.get(vehicle.id)!),
        );
      }
      sim.step((vehicle) => commands.get(vehicle.id)!, STEP_MS);
      const tanks = sim.vehicles.map((vehicle) => vehicle.chassis);
      for (const tank of tanks) {
        if (!(
          Number.isFinite(tank.x) &&
          Number.isFinite(tank.vx) &&
          tank.x >= 0 &&
          tank.x <= 700
        )) {
          violations.record(
            `adım ${step}: araç dünya dışında ya da sonsuz (x ${tank.x}, vx ${tank.vx})`,
          );
        }
      }
      for (let a = 0; a < tanks.length; a++) {
        for (let b = a + 1; b < tanks.length; b++) {
          const gap = Math.hypot(tanks[a].x - tanks[b].x, tanks[a].y - tanks[b].y);
          // İki ayak izinin iç çemberleri (yarı en) hiçbir karede derin örtüşmez.
          if (!(gap > TANK.halfWidth * 2 * 0.8)) {
            violations.record(`adım ${step}: araçlar iç içe geçti (mesafe ${gap})`);
          }
        }
      }
    }
    expect(violations.found).toEqual([]);
    expect(others).toHaveLength(2);
    sim.drainEvents([]);
  });
});
