import { describe, expect, it } from 'vitest';
import { VEHICLE_IDS } from '@/config/vehicles';
import { rawStats, vehicleStats } from '@/menu/vehicleStats';
import { VEHICLES } from '@/config/vehicles';

describe('vehicleStats', () => {
  it('her ölçüde katalogun en iyisi 1 olur ve hiçbiri 0 ile 1 dışına çıkmaz', () => {
    for (const key of ['durability', 'speed', 'firepower'] as const) {
      const values = VEHICLE_IDS.map((id) => vehicleStats(id)[key]);
      expect(Math.max(...values)).toBeCloseTo(1);
      for (const value of values) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('araç kimliği karakterini yansıtır: Bulwark en dayanıklı, Dart en hızlı', () => {
    expect(vehicleStats('bulwark').durability).toBe(1);
    expect(vehicleStats('dart').speed).toBe(1);
    expect(vehicleStats('dart').durability).toBeLessThan(vehicleStats('striker').durability);
    expect(vehicleStats('bulwark').speed).toBeLessThan(vehicleStats('striker').speed);
  });

  it('çok yuvalı salvo ateş gücünü yuva ortalamasıyla çarpar', () => {
    const arachnid = VEHICLES.arachnid;
    const { weapon } = arachnid.armament;
    // Salvo [[0], [1, 2]]: atış başına ortalama 1,5 yuva.
    expect(rawStats(arachnid).firepower).toBeCloseTo(
      (weapon.damage * 1.5) / (weapon.intervalMs / 1000),
    );
  });
});
