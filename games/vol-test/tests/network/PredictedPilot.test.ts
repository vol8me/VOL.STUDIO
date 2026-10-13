import type { Predict, Room } from '@volstudio/network/client';
import { describe, expect, it, vi } from 'vitest';
import { COMBAT } from '@/config/combat';
import { GAME } from '@/config/game';
import { SUSPENSION, TANK, WEAPON } from '@/config/tank';
import { Vehicle } from '@/sim/entities/Vehicle';
import { WORLD } from '@/config/world';
import { PredictedPilot, type PilotPose } from '@/network/PredictedPilot';
import { NO_TEAM, PlayerState, type MatchSnapshot, type PlayerSnapshot } from '@/network/schema';
import type { Launch } from '@/sim/vehicleStep';
import { World } from '@/sim/world/World';
import { command } from '../support/sim';

interface SimConfig {
  readonly snap: number;
  readonly warnOnDivergence: number | undefined;
  step(ctx: { isReplay: boolean }, world: { vehicle: Vehicle; space: World }, input: unknown): void;
  adopt(world: { vehicle: Vehicle; space: World }): void;
  pose(world: { vehicle: Vehicle; space: World }): PilotPose;
  interpolate(a: PilotPose, b: PilotPose, t: number): PilotPose;
}

function recordOf(patch: Partial<PlayerSnapshot> = {}) {
  const record = new PlayerState();
  record.vehicleId = 3;
  record.team = NO_TEAM;
  record.x = 1000;
  record.y = 1200;
  record.hull = 0.5;
  record.health = 100;
  record.alive = true;
  Object.assign(record, patch);
  return record;
}

/** Colyseus yerine geçen kuru bağlar: pilotun SDK'ya verdiği yapılandırmayı yakalar. */
function wire(stepMs = GAME.simulationStepMs, record = recordOf()) {
  const handle = {
    stepMs,
    data: { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, boost: false, brake: false },
    send: vi.fn(() => 42),
  };
  const reconciler = {
    drift: { ema: 0.25, peak: 1 },
    pose: vi.fn(() => ({ x: 7, y: 8, hull: 0, turret: 0, pitch: 0, roll: 0 })),
    dispose: vi.fn(),
  };
  let config: SimConfig | undefined;
  const predict = {
    sim: vi.fn((given: SimConfig) => {
      config = given;
      return reconciler;
    }),
  };
  const room = { input: vi.fn(() => handle) };
  const fired = vi.fn();
  const build = () =>
    new PredictedPilot({
      room: room as unknown as Room<MatchSnapshot>,
      predict: predict as unknown as Predict,
      self: record,
      space: new World(WORLD.width, WORLD.height, WORLD.gridStep),
      divergenceTolerance: 0.5,
      onFired: fired,
    });
  return { build, handle, reconciler, predict, fired, record, config: () => config! };
}

describe('PredictedPilot kurulum', () => {
  it('sunucunun yetkili durumunu araca kurar', () => {
    const { build, record } = wire(
      undefined,
      recordOf({ gunMs: 123.5, protectionMs: 800, respawnMs: 0 }),
    );
    const pilot = build();
    const { chassis, vitality, gun } = pilot.vehicle;
    expect(pilot.vehicle.id).toBe(record.vehicleId);
    expect(pilot.vehicle.team).toBeNull();
    expect(chassis.x).toBe(1000);
    expect(chassis.y).toBe(1200);
    expect(chassis.hull).toBe(0.5);
    expect(vitality.health).toBe(100);
    expect(vitality.protectionRemainingMs).toBe(800);
    expect(gun.getRemaining()).toBe(123.5);
  });

  it('dışarıdan verilen aracı sürer ve kendisi yenisini kurmaz', () => {
    const { build, record } = wire();
    const supplied = new Vehicle(record.vehicleId, TANK, SUSPENSION, WEAPON, COMBAT);
    const wired = wire();
    const pilot = new PredictedPilot({
      room: { input: () => wired.handle } as unknown as Room<MatchSnapshot>,
      predict: wired.predict as unknown as Predict,
      self: wired.record,
      space: new World(WORLD.width, WORLD.height, WORLD.gridStep),
      vehicle: supplied,
    });
    expect(pilot.vehicle).toBe(supplied);
    expect(supplied.chassis.x).toBe(1000);
    expect(build().vehicle).not.toBe(supplied);
  });

  it('takımlı oyuncunun aracı takım taşır', () => {
    const { build } = wire(undefined, recordOf({ team: 1 }));
    expect(build().vehicle.team).toBe(1);
  });

  it('sunucu adımı istemci adımından farklıysa kurulum reddedilir', () => {
    const { build, predict } = wire(GAME.simulationStepMs * 2);
    expect(build).toThrow(/Sunucu adımı/);
    expect(predict.sim).not.toHaveBeenCalled();
  });

  it('sapma ölçümü eşiği ve ışınlanma sınırı SDK yapılandırmasına geçer', () => {
    const { build, config } = wire();
    build();
    expect(config().warnOnDivergence).toBe(0.5);
    expect(config().snap).toBeGreaterThan(0);
  });
});

describe('PredictedPilot adım', () => {
  it('adım komutu aracı sürer; canlı atış bildirilir, yeniden oynatılan atış bildirilmez', () => {
    const { build, config, fired } = wire();
    const pilot = build();
    const before = { x: pilot.vehicle.chassis.x, y: pilot.vehicle.chassis.y };
    const world = { vehicle: pilot.vehicle, space: new World(WORLD.width, WORLD.height, 128) };
    const live = { moveY: -1, fire: true };

    config().step({ isReplay: false }, world, { ...command(live) });
    expect(fired).toHaveBeenCalledTimes(1);
    // Atış değerleri geri tepmeden ÖNCE alınır: namlu ucu ve tankın hızını devralan ilk hız.
    const launch = fired.mock.calls[0]?.[0] as Launch;
    expect(Object.keys(launch).sort()).toEqual(['angle', 'vx', 'vy', 'x', 'y']);
    for (const value of Object.values(launch)) expect(Number.isFinite(value)).toBe(true);
    expect(pilot.vehicle.gun.getRemaining()).toBeGreaterThan(0);

    for (let step = 0; step < 30; step++) {
      config().step({ isReplay: true }, world, { ...command({ moveY: -1, fire: true }) });
    }
    expect(fired).toHaveBeenCalledTimes(1);
    expect(
      Math.hypot(pilot.vehicle.chassis.x - before.x, pilot.vehicle.chassis.y - before.y),
    ).toBeGreaterThan(0.5);
  });

  it('adopt sunucu durumunu yeniden yükler: öngörülen sapma silinir', () => {
    const { build, config, record } = wire();
    const pilot = build();
    pilot.vehicle.chassis.x = 5;
    pilot.vehicle.vitality.health = 1;
    record.x = 1500;
    record.health = 60;
    config().adopt({ vehicle: pilot.vehicle, space: new World(WORLD.width, WORLD.height, 128) });
    expect(pilot.vehicle.chassis.x).toBe(1500);
    expect(pilot.vehicle.vitality.health).toBe(60);
  });

  it('pose aracın çizim alanlarını okur', () => {
    const { build, config } = wire();
    const pilot = build();
    const pose = config().pose({
      vehicle: pilot.vehicle,
      space: new World(WORLD.width, WORLD.height, 128),
    });
    expect(pose).toEqual({
      x: 1000,
      y: 1200,
      hull: 0.5,
      turret: pilot.vehicle.chassis.turret,
      pitch: pilot.vehicle.chassis.suspension.pitch,
      roll: pilot.vehicle.chassis.suspension.roll,
    });
  });

  it('ara değer açıları en kısa yoldan, konumu doğrusal birleştirir', () => {
    const { build, config } = wire();
    build();
    const a: PilotPose = { x: 0, y: 10, hull: 3, turret: -3, pitch: 0, roll: 1 };
    const b: PilotPose = { x: 10, y: 20, hull: -3, turret: 3, pitch: 2, roll: 3 };
    const mid = config().interpolate(a, b, 0.5);
    expect(mid.x).toBe(5);
    expect(mid.y).toBe(15);
    expect(mid.pitch).toBe(1);
    expect(mid.roll).toBe(2);
    // 3 rad ile -3 rad arasının kısa yolu π üzerinden geçer, 0 üzerinden değil.
    expect(Math.cos(mid.hull)).toBeLessThan(-0.99);
    expect(Math.cos(mid.turret)).toBeLessThan(-0.99);
  });
});

describe('PredictedPilot gönderim', () => {
  it('eksenleri float32 kesinliğine yuvarlar ve gönderim sayısını döndürür', () => {
    const { build, handle } = wire();
    const pilot = build();
    const sent = pilot.send(
      command({ moveX: 0.1, moveY: -0.7, aimX: 0.3, aimY: 0.2, fire: true, boost: true }),
    );
    expect(sent).toBe(42);
    expect(handle.send).toHaveBeenCalledTimes(1);
    expect(handle.data.moveX).toBe(Math.fround(0.1));
    expect(handle.data.moveY).toBe(Math.fround(-0.7));
    expect(handle.data.aimX).toBe(Math.fround(0.3));
    expect(handle.data.aimY).toBe(Math.fround(0.2));
    expect(handle.data).toMatchObject({ fire: true, boost: true, brake: false });
    expect(handle.data.moveX).not.toBe(0.1);
  });

  it('poz ve sapma ölçümü uzlaştırıcıdan okunur, dispose onu serbest bırakır', () => {
    const { build, reconciler } = wire();
    const pilot = build();
    expect(pilot.pose()).toEqual({ x: 7, y: 8, hull: 0, turret: 0, pitch: 0, roll: 0 });
    expect(pilot.drift).toEqual({ ema: 0.25, peak: 1 });
    pilot.dispose();
    expect(reconciler.dispose).toHaveBeenCalledTimes(1);
  });

  it('uzlaştırıcı dispose sunmuyorsa kapanış hata vermez', () => {
    const { build, reconciler } = wire();
    const pilot = build();
    delete (reconciler as { dispose?: () => void }).dispose;
    expect(() => pilot.dispose()).not.toThrow();
  });
});
