import { describe, expect, it } from 'vitest';
import { BACKDROP } from '@/config/backdrop';
import { GAME } from '@/config/game';
import { VEHICLE_IDS } from '@/config/vehicles';
import { WEATHER } from '@/config/weather';
import { BackdropParade } from '@/sim/backdrop/BackdropParade';
import type { SimEvent } from '@/sim/events';
import { WeatherSystem } from '@/sim/weather/WeatherSystem';
import { World } from '@/sim/world/World';

function parade(units = 4, seed = 11): BackdropParade {
  const world = new World(12_288, 12_288, 128);
  const weather = new WeatherSystem(world.width, world.height, { seed: WEATHER.seed });
  return new BackdropParade({ world, weather, seed, units });
}

/** Alayı `seconds` saniye ilerletir; her adımda `visit` çağrılır. */
function run(instance: BackdropParade, seconds: number, visit?: () => void): void {
  const frames = Math.round((seconds * 1000) / GAME.simulationStepMs);
  for (let frame = 0; frame < frames; frame++) {
    instance.advance(GAME.simulationStepMs);
    visit?.();
  }
}

describe('BackdropParade', () => {
  it('ilk karede her şerit dolu, araçlar takımsız ve dokunulmazdır; savaş yoktur', () => {
    const instance = parade(5);
    expect(instance.vehicles).toHaveLength(5);
    for (const vehicle of instance.vehicles) {
      expect(vehicle.team).toBeNull();
      expect(vehicle.vitality.protectionRemainingMs).toBe(Number.POSITIVE_INFINITY);
    }
    // Açılışta araçlar birbirinden uzak durur.
    const cars = instance.vehicles.map((vehicle) => vehicle.chassis);
    for (const [index, a] of cars.entries())
      for (const b of cars.slice(index + 1))
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(BACKDROP.parade.spawnGap / 2);
  });

  it('araçlar hedefe yürür, çıkınca yenisi başlar; sayı sabit kalır ve bütün modeller sırayla gelir', () => {
    const instance = parade(4);
    const seen = new Set<string>();
    const ids = new Set<number>();
    const events: SimEvent[] = [];
    const record = (): void => {
      for (const vehicle of instance.vehicles) {
        seen.add(vehicle.spec.id);
        ids.add(vehicle.id);
      }
      instance.drainEvents(events);
    };
    record();
    run(instance, 400, record);
    // Dört şerit 400 sn'de birçok kez döner: yeni kimlikler doğar, eski araçlar kaldırılır.
    expect(ids.size).toBeGreaterThan(VEHICLE_IDS.length);
    expect(seen.size).toBe(VEHICLE_IDS.length);
    // Araçlar dünya içinde kalır, hiç ölmez ve hasar almaz.
    for (const vehicle of instance.vehicles) {
      expect(vehicle.vitality.alive).toBe(true);
      expect(vehicle.vitality.health).toBe(vehicle.vitality.maxHealth);
      expect(instance.sim.world.contains(vehicle.chassis.x, vehicle.chassis.y)).toBe(true);
    }
    // Atış yok: ne ateş ne vuruş olayı.
    const kinds = new Set(events.map((event) => event.kind as string));
    expect(kinds.has('fired')).toBe(false);
    expect(kinds.has('hit')).toBe(false);
    expect(kinds.has('damaged')).toBe(false);
  });

  it('araç hedefine doğru ilerler: kısa sürede çevre noktasından sahneye yaklaşır', () => {
    const instance = parade(2);
    const center = instance.sim.world.center;
    const distance = (): number =>
      Math.min(
        ...instance.vehicles.map((vehicle) =>
          Math.hypot(vehicle.chassis.x - center.x, vehicle.chassis.y - center.y),
        ),
      );
    // Açılışta yolun 0,1-0,9'unda başlarlar; hepsi zaten ekranın dışına çıkmış değildir.
    expect(distance()).toBeLessThan(BACKDROP.parade.radius);
    const before = instance.vehicles.map((vehicle) => vehicle.id);
    run(instance, 3);
    // Aynı araçlar yürümeye devam eder (hareketsiz değil).
    const moved = instance.vehicles.filter((vehicle) => before.includes(vehicle.id));
    expect(moved.some((vehicle) => vehicle.chassis.speed > 5)).toBe(true);
  });

  it('aynı tohum aynı alayı üretir; farklı tohum farklı sırayı', () => {
    const snapshot = (seed: number): string => {
      const instance = parade(3, seed);
      run(instance, 30);
      return instance.vehicles
        .map((vehicle) => `${vehicle.spec.id}:${vehicle.chassis.x.toFixed(2)}`)
        .join('|');
    };
    expect(snapshot(5)).toBe(snapshot(5));
    expect(snapshot(5)).not.toBe(snapshot(6));
  });
});
