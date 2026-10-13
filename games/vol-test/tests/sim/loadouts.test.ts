import { describe, expect, it } from 'vitest';
import { BULWARK, DART, STRIKER, type VehicleSpec } from '@/config/vehicles';
import { WEAPON_STYLES } from '@/config/tank';
import { Simulation } from '@/sim/Simulation';
import type { SimEvent } from '@/sim/events';
import { command, STEP_MS, world } from '../support/sim';

/** İki yan yuvalı deneme aracı: tetik sırasıyla önce ortadaki, sonra iki yandaki ateşlenir. */
const TRIPLE: VehicleSpec = {
  ...STRIKER,
  armament: {
    weapon: STRIKER.armament.weapon,
    mounts: [
      { x: 0, y: 0, reach: 30 },
      { x: 4, y: -12, reach: 26 },
      { x: 4, y: 12, reach: 26 },
    ],
    salvo: [[0], [1, 2]],
    toeInRange: 300,
  },
};

function arena(): Simulation {
  return new Simulation({ world: world(), spawnPlayer: false });
}

/** Ateşin `fired` olayları ve mermi havuzu için tek adım. */
function pull(sim: Simulation, shooterId: number): SimEvent[] {
  sim.step((vehicle) => command(vehicle.id === shooterId ? { fire: true, aimX: 1 } : {}), STEP_MS);
  return sim.drainEvents([]);
}

describe('araç tanımına göre doğuş', () => {
  it('can, şasi ve silah tanımdan gelir; belirtilmeyen araç Striker olur', () => {
    const sim = arena();
    const plain = sim.spawn(1000, 1000, 0);
    const heavy = sim.spawn(1500, 1000, 0, null, undefined, BULWARK);
    const light = sim.spawn(2000, 1000, 0, null, undefined, DART);
    expect(plain.spec).toBe(STRIKER);
    expect(heavy.vitality.maxHealth).toBe(BULWARK.health);
    expect(light.vitality.health).toBe(DART.health);
    expect(heavy.chassis.mass).toBe(BULWARK.tank.mass);
    expect(light.chassis.shape.halfLength).toBe(DART.tank.halfLength);
    expect(heavy.weapon).toBe(BULWARK.armament.weapon);
  });

  it('Simulation seçeneğindeki araç varsayılan doğuşu belirler', () => {
    const sim = new Simulation({ world: world(), vehicle: DART, spawnPlayer: false });
    expect(sim.spawn(1000, 1000, 0).spec).toBe(DART);
    expect(sim.spawn(1500, 1000, 0, null, undefined, STRIKER).spec).toBe(STRIKER);
  });

  it('doğma kelepçesi aracın kendi ayak izine göredir', () => {
    const sim = arena();
    const heavy = sim.spawn(1000, 1000, 0, null, undefined, BULWARK);
    const light = sim.spawn(1000, 1500, 0, null, undefined, DART);
    sim.applyDamage(heavy.id, 1000);
    sim.applyDamage(light.id, 1000);
    sim.respawnVehicle(heavy.id, 0, 0, 0);
    sim.respawnVehicle(light.id, 0, 0, 0);
    const radius = (spec: VehicleSpec) => Math.hypot(spec.tank.halfLength, spec.tank.halfWidth);
    expect(heavy.chassis.x).toBeCloseTo(radius(BULWARK));
    expect(light.chassis.x).toBeCloseTo(radius(DART));
  });
});

describe('silah profili', () => {
  it('her silahın mermisi kendi hızı, ömrü ve stiliyle uçar', () => {
    const sim = arena();
    const heavy = sim.spawn(500, 2048, 0, null, undefined, BULWARK);
    const light = sim.spawn(500, 2400, 0, null, undefined, DART);
    pull(sim, heavy.id);
    pull(sim, light.id);
    const shells = sim.projectiles.items.slice(0, sim.projectiles.count);
    const byOwner = (id: number) => shells.find((shell) => shell.owner === id)!;
    const heavyShell = byOwner(heavy.id);
    const lightShell = byOwner(light.id);
    expect(Math.hypot(lightShell.vx, lightShell.vy)).toBeGreaterThan(
      Math.hypot(heavyShell.vx, heavyShell.vy) * 1.4,
    );
    expect(WEAPON_STYLES[sim.projectiles.styleOf(heavyShell)]).toBe('slug');
    expect(WEAPON_STYLES[sim.projectiles.styleOf(lightShell)]).toBe('rail');
    expect(sim.profileFor(heavy.weapon)).toBe(heavyShell.profile);
    expect(sim.profileFor(heavy.weapon)).not.toBe(sim.profileFor(light.weapon));
    // Aynı silah aynı profili paylaşır.
    expect(sim.profileFor(BULWARK.armament.weapon)).toBe(sim.profileFor(heavy.weapon));
  });

  it('isabet hasarı ve itkisi atan silahın tanımından gelir', () => {
    for (const [spec, expected] of [
      [BULWARK, BULWARK.armament.weapon.damage],
      [DART, DART.armament.weapon.damage],
      [STRIKER, STRIKER.armament.weapon.damage],
    ] as const) {
      const sim = arena();
      const shooter = sim.spawn(1000, 2048, 0, null, undefined, spec);
      const victim = sim.spawn(1300, 2048, 0, null, undefined, STRIKER);
      victim.vitality.protectionRemainingMs = 0;
      let events: SimEvent[] = [];
      for (let step = 0; step < 60 && !events.some((event) => event.kind === 'hit'); step++)
        events = events.concat(pull(sim, shooter.id));
      expect(
        events.some((event) => event.kind === 'hit'),
        spec.id,
      ).toBe(true);
      expect(victim.vitality.maxHealth - victim.vitality.health, spec.id).toBeCloseTo(expected);
      expect(victim.chassis.vx, spec.id).toBeGreaterThan(0);
    }
  });

  it('ağır silahın itkisi hafif silahınkinden büyüktür', () => {
    const impulse = (spec: VehicleSpec) => {
      const sim = arena();
      const shooter = sim.spawn(1000, 2048, 0, null, undefined, spec);
      const victim = sim.spawn(1300, 2048, 0, null, undefined, STRIKER);
      victim.vitality.protectionRemainingMs = 0;
      for (let step = 0; step < 60 && victim.vitality.health === victim.vitality.maxHealth; step++)
        pull(sim, shooter.id);
      return victim.chassis.vx * victim.chassis.mass;
    };
    expect(impulse(BULWARK)).toBeGreaterThan(impulse(DART) * 2);
  });
});

describe('çok namlulu ateş', () => {
  it('her tetik çekişi sıradaki yuva grubunu ateşler; olaylar yuva numarasını taşır', () => {
    const sim = arena();
    const shooter = sim.spawn(1000, 2048, 0, null, undefined, TRIPLE);
    const mounts: number[][] = [];
    for (let trigger = 0; trigger < 3; trigger++) {
      shooter.gun.reset();
      const fired = pull(sim, shooter.id).filter((event) => event.kind === 'fired');
      mounts.push(fired.map((event) => (event as { mount: number }).mount));
    }
    expect(mounts).toEqual([[0], [1, 2], [0]]);
    expect(sim.projectiles.count).toBe(4);
  });

  it('aynı gruptaki mermiler farklı yuvalardan, nişan noktasına doğru çıkar', () => {
    const sim = arena();
    const shooter = sim.spawn(1000, 2048, 0, null, undefined, TRIPLE);
    shooter.salvo = 1;
    const fired = pull(sim, shooter.id).filter((event) => event.kind === 'fired');
    expect(fired).toHaveLength(2);
    const [left, right] = fired as { x: number; y: number; angle: number }[];
    expect(left.y).not.toBeCloseTo(right.y, 3);
    // İçe bakarlar: soldaki sağa, sağdaki sola döner.
    expect(Math.sign(left.angle)).toBe(-Math.sign(right.angle));
  });

  it('yeniden doğuş atış sırasını başa alır', () => {
    const sim = arena();
    const shooter = sim.spawn(1000, 2048, 0, null, undefined, TRIPLE);
    shooter.salvo = 1;
    sim.applyDamage(shooter.id, 1000);
    sim.respawnVehicle(shooter.id);
    expect(shooter.salvo).toBe(0);
  });
});
