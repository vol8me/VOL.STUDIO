import { describe, expect, it } from 'vitest';
import { VEHICLE_IDS, VEHICLES, type VehicleSpec } from '@/config/vehicles';
import { rawStats, vehicleStats } from '@/menu/vehicleStats';

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
    const striker = VEHICLES.striker;
    const arachnid = VEHICLES.arachnid;
    const grouped: VehicleSpec = {
      ...arachnid,
      armament: { ...arachnid.armament, salvo: [[0, 1]] },
    };
    // Grup tek atıştır: iki yuva birlikte ateşlenince ateş gücü yuva sayısıyla çarpılır.
    expect(rawStats(grouped).firepower).toBeCloseTo(
      (arachnid.armament.weapon.damage * 2) / (arachnid.armament.weapon.intervalMs / 1000),
    );
    expect(rawStats(arachnid).firepower).toBeCloseTo(
      arachnid.armament.weapon.damage / (arachnid.armament.weapon.intervalMs / 1000),
    );
    // Sırayla ateşleyen iki top Striker'ın tek topuyla aynı sınıftadır.
    expect(rawStats(arachnid).firepower).toBeGreaterThan(rawStats(striker).firepower * 0.8);
  });
});
