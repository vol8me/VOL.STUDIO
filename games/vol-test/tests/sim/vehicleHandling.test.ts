import { describe, expect, it } from 'vitest';
import {
  BULWARK,
  chassisConfigOf,
  DART,
  STRIKER,
  VEHICLES,
  type TankSpec,
  type VehicleSpec,
} from '@/config/vehicles';
import { Tank } from '@/sim/tank/Tank';
import { drive, world } from '../support/sim';

const space = world(8192);

interface Handling {
  /** Duruştan azami hızın %90'ına varış süresi (s). */
  secondsToCruise: number;
  topSpeed: number;
  /** Yerinde dönüşte ulaşılan en yüksek açısal hız (rad/s). */
  peakYaw: number;
  /** Azami hızdan tam frende alınan yol (birim). */
  brakeDistance: number;
}

function measure(spec: TankSpec): Handling {
  const accelerate = new Tank(spec.tank, spec.suspension);
  accelerate.place(1000, 4096, 0);
  let secondsToCruise = Infinity;
  for (let step = 0; step < 900 && secondsToCruise === Infinity; step++) {
    drive(accelerate, space, { moveX: 1, aimX: 1 }, 1 / 60);
    if (Math.hypot(accelerate.vx, accelerate.vy) >= 0.9 * spec.tank.maxSpeed)
      secondsToCruise = step / 60;
  }
  drive(accelerate, space, { moveX: 1, aimX: 1 }, 4);
  const topSpeed = Math.hypot(accelerate.vx, accelerate.vy);

  const spin = new Tank(spec.tank, spec.suspension);
  spin.place(4096, 4096, 0);
  let peakYaw = 0;
  for (let step = 0; step < 180; step++) {
    drive(spin, space, { moveY: 1, aimX: 1 }, 1 / 60);
    peakYaw = Math.max(peakYaw, Math.abs(spin.angularVelocity));
  }

  const stop = new Tank(spec.tank, spec.suspension);
  stop.place(1000, 4096, 0);
  drive(stop, space, { moveX: 1, aimX: 1 }, 4);
  const before = stop.x;
  drive(stop, space, { brake: true }, 3);
  return { secondsToCruise, topSpeed, peakYaw, brakeDistance: stop.x - before };
}

const handling = {
  striker: measure(STRIKER),
  bulwark: measure(BULWARK),
  dart: measure(DART),
};

describe('araç sürüş karakteri', () => {
  it('azami hız Dart > Striker > Bulwark sırasındadır ve her biri tanımının hedefine varır', () => {
    expect(handling.dart.topSpeed).toBeGreaterThan(handling.striker.topSpeed * 1.25);
    expect(handling.striker.topSpeed).toBeGreaterThan(handling.bulwark.topSpeed * 1.3);
    for (const spec of [STRIKER, BULWARK, DART]) {
      const reached = handling[spec.id].topSpeed;
      expect(reached).toBeGreaterThan(spec.tank.maxSpeed * 0.95);
      expect(reached).toBeLessThan(spec.tank.maxSpeed * 1.08);
    }
  });

  it('Bulwark ağır hızlanır, Dart ve Striker çevik: azami hıza varış süresi ayrışır', () => {
    expect(handling.bulwark.secondsToCruise).toBeGreaterThan(
      handling.striker.secondsToCruise * 1.6,
    );
    expect(handling.bulwark.secondsToCruise).toBeGreaterThan(1.8);
    expect(handling.dart.secondsToCruise).toBeLessThan(1.3);
  });

  it('dönüş çevikliği Dart > Striker > Bulwark sırasındadır', () => {
    expect(handling.dart.peakYaw).toBeGreaterThan(handling.striker.peakYaw * 1.3);
    expect(handling.striker.peakYaw).toBeGreaterThan(handling.bulwark.peakYaw * 1.5);
  });

  it('frenleme yolu hıza orantılıdır: hızlı Dart daha uzağa kayar', () => {
    expect(handling.dart.brakeDistance).toBeGreaterThan(handling.striker.brakeDistance * 1.5);
    expect(handling.bulwark.brakeDistance).toBeGreaterThan(0);
  });
});

describe('araç silah dengesi', () => {
  /** Tetik başına ortalama mermi sayısıyla saniyelik hasar. */
  const dps = (spec: VehicleSpec) => {
    const { weapon, salvo } = spec.armament;
    const shots = salvo.reduce((sum, group) => sum + group.length, 0) / salvo.length;
    return (weapon.damage * shots * 1000) / weapon.intervalMs;
  };

  it('tek vuruşluk hasar ve can Bulwark > Striker > Dart; ateş hızı tersine', () => {
    const order = [BULWARK, STRIKER, DART];
    for (let index = 1; index < order.length; index++) {
      const heavier = order[index - 1];
      const lighter = order[index];
      expect(heavier.armament.weapon.damage).toBeGreaterThan(lighter.armament.weapon.damage);
      expect(heavier.health).toBeGreaterThan(lighter.health);
      expect(heavier.armament.weapon.intervalMs).toBeGreaterThan(
        lighter.armament.weapon.intervalMs,
      );
      expect(chassisConfigOf(heavier).mass).toBeGreaterThan(chassisConfigOf(lighter).mass);
    }
  });

  it('anma hasarı/s araçlar arasında yakındır (en çok %70 fark); gerisini isabet, menzil ve hız dengeler', () => {
    // Hızlı ve uzun menzilli Widow düşük anma hasarını isabetle, Goliath ağır mermisini canıyla öder: gerçek
    // denge `balance.test.ts` düellolarında ölçülür.
    const values = Object.values(VEHICLES).map(dps);
    expect(Math.max(...values) / Math.min(...values)).toBeLessThan(1.7);
  });

  it('geri tepme hız farkı olarak ölçülür: ağır araç daha az sarsılır, ama ağır top daha çok vurur', () => {
    const kick = (spec: VehicleSpec) =>
      spec.armament.weapon.recoilImpulse / chassisConfigOf(spec).mass;
    expect(kick(DART)).toBeLessThan(kick(STRIKER));
    expect(kick(BULWARK)).toBeGreaterThan(kick(STRIKER));
  });
});
