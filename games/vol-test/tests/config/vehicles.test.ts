import { describe, expect, it } from 'vitest';
import { WEAPON_STYLES } from '@/config/tank';
import {
  chassisConfigOf,
  MAX_MOUNTS,
  VEHICLE_IDS,
  VEHICLES,
  isVehicleId,
  modelOf,
  vehicleAt,
} from '@/config/vehicles';

describe('araç kayıt defteri', () => {
  it('her kimlik kendi tanımına gider ve ağ indeksi gidiş dönüş tutarlıdır', () => {
    expect(VEHICLE_IDS[0]).toBe('striker');
    VEHICLE_IDS.forEach((id, index) => {
      expect(VEHICLES[id].id).toBe(id);
      expect(modelOf(VEHICLES[id])).toBe(index);
      expect(vehicleAt(index)).toBe(VEHICLES[id]);
    });
    expect(Object.keys(VEHICLES).sort()).toEqual([...VEHICLE_IDS].sort());
  });

  it('tanımsız indeks ve kimlik kabul edilmez', () => {
    for (const bad of [-1, VEHICLE_IDS.length, 1.5, Number.NaN, Infinity]) {
      expect(vehicleAt(bad), String(bad)).toBeUndefined();
    }
    expect(isVehicleId('dart')).toBe(true);
    expect(isVehicleId('tiger')).toBe(false);
    expect(isVehicleId(2)).toBe(false);
  });
});

describe('araç tanımı geçerliliği', () => {
  for (const spec of Object.values(VEHICLES)) {
    describe(spec.id, () => {
      const { armament } = spec;

      it('sayılar sonlu ve pozitiftir', () => {
        expect(spec.health).toBeGreaterThan(0);
        const numbers = [
          // `dashPull` 0 olabilir (yürüyüşü zorlamayan yetenek); öteki sayılar pozitiftir.
          ...Object.entries(chassisConfigOf(spec))
            .filter(([key]) => key !== 'dashPull')
            .map(([, value]) => value),
          ...Object.values(spec.suspension),
          armament.weapon.intervalMs,
          armament.weapon.projectileSpeed,
          armament.weapon.projectileLifeMs,
          armament.weapon.damage,
          armament.weapon.recoilImpulse,
          armament.weapon.hitImpulse,
          armament.toeInRange,
        ];
        for (const value of numbers) {
          expect(Number.isFinite(value) && value > 0, String(value)).toBe(true);
        }
      });

      it('silah stili tanımlıdır ve menzil ömre sığar', () => {
        expect(WEAPON_STYLES).toContain(armament.weapon.style);
        const { flight, projectileSpeed, projectileLifeMs } = armament.weapon;
        // Mermi ömrü içinde en azından menzile yakın uçabilmeli, yoksa menzil değeri anlamsızdır.
        expect((projectileSpeed * projectileLifeMs) / 1000).toBeGreaterThan(flight.maxRange * 0.7);
      });

      it('yuvalar ve atış grupları tutarlıdır', () => {
        expect(armament.mounts.length).toBeGreaterThan(0);
        expect(armament.mounts.length).toBeLessThanOrEqual(MAX_MOUNTS);
        expect(armament.salvo.length).toBeGreaterThan(0);
        const used = new Set<number>();
        for (const group of armament.salvo) {
          expect(group.length).toBeGreaterThan(0);
          for (const mount of group) {
            expect(Number.isInteger(mount) && mount >= 0 && mount < armament.mounts.length).toBe(
              true,
            );
            used.add(mount);
          }
          expect(new Set(group).size, 'grupta yinelenen yuva').toBe(group.length);
        }
        // Hiçbir yuva ateşsiz kalmaz.
        expect(used.size).toBe(armament.mounts.length);
        for (const mount of armament.mounts) expect(mount.reach).toBeGreaterThan(0);
      });

      it('namlu ucu ayak izinin dışında başlar ama yakın kalır', () => {
        for (const mount of armament.mounts) {
          const tip = Math.hypot(mount.x + mount.reach, mount.y);
          expect(tip).toBeGreaterThan(chassisConfigOf(spec).halfWidth);
          expect(tip).toBeLessThan(chassisConfigOf(spec).halfLength * 2.4);
        }
      });

      it('doğma kelepçesi için ayak izi paletleri kapsar', () => {
        const chassis = chassisConfigOf(spec);
        expect(chassis.halfWidth).toBeGreaterThan(chassis.trackOffset);
        expect(chassis.halfLength).toBeGreaterThan(chassis.halfWidth * 0.9);
      });
    });
  }
});
