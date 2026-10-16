import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { DisposableScope } from '@volstudio/core';
import type { GameServices } from '@/app/GameServices';
import type { GamePreferences } from '@/app/GameSettings';
import { VEHICLE_IDS, VEHICLES, STRIKER, type VehicleId } from '@/config/vehicles';
import { WORLD } from '@/config/world';
import { OfflineDriver } from '@/scenes/world/OfflineDriver';
import type { PlayerControls } from '@/scenes/world/PlayerControls';
import type { DriverContext } from '@/scenes/world/WorldDriver';
import { World } from '@/sim/world/World';
import { idleCommand } from '@/sim/command';
import { fakeScene } from '../../support/fakeScene';

const online = vi.hoisted(() => ({ createLobby: vi.fn(() => ({ open: vi.fn() })) }));
vi.mock('@/scenes/world/online', () => online);

function driver(vehicle?: VehicleId): {
  driver: OfflineDriver;
  scope: DisposableScope;
  context: DriverContext;
  /** Ayar aboneleri: testler tercih değişimini bunları çağırarak yayar. */
  listeners: Array<(value: GamePreferences) => void>;
} {
  const listeners: Array<(value: GamePreferences) => void> = [];
  const scope = new DisposableScope();
  const services =
    vehicle === undefined
      ? undefined
      : ({
          settings: {
            get: () => ({ scenario: 'empty', seed: 1, chaos: 1.5, vehicle }) as GamePreferences,
            subscribe: (listener: (value: GamePreferences) => void) => {
              listeners.push(listener);
              return () => undefined;
            },
          },
          progress: { travel: vi.fn() },
        } as unknown as GameServices);
  const context: DriverContext = {
    scene: fakeScene() as unknown as Phaser.Scene,
    world: new World(WORLD.width, WORLD.height, WORLD.gridStep),
    weather: undefined as never,
    controls: {} as PlayerControls,
    ...(services ? { services } : {}),
    seed: 1,
    scope,
    restart: vi.fn(),
    toMenu: vi.fn(),
  };
  return { driver: new OfflineDriver(context), scope, context, listeners };
}

describe('OfflineDriver', () => {
  it('yeniden doğuş ışınlanmasını sürülen mesafeye yazmaz', () => {
    const { driver: offline, scope, context } = driver('striker');
    Object.assign(context.controls, { step: idleCommand });
    offline.player.chassis.place(1000, 1000);
    offline.sim.applyDamage(offline.player.id, offline.player.vitality.maxHealth);
    offline.player.vitality.respawnRemainingMs = 1;
    offline.advance(1000 / 60, 1000 / 60, false);
    expect(offline.player.vitality.alive).toBe(true);
    expect(context.services!.progress.travel).not.toHaveBeenCalled();
    scope.dispose();
  });

  it('tembel ağ kodu yüklenirken kapanan sahnede lobi kurulmaz', async () => {
    const { driver: offline, scope } = driver('striker');
    const actions: Array<{ id: string; run: () => void }> = [];
    offline.attachHud({
      setPauseActions: (next: typeof actions) => actions.push(...next),
    } as never);
    online.createLobby.mockClear();
    actions[0].run();
    scope.dispose();
    await vi.dynamicImportSettled();
    expect(online.createLobby).not.toHaveBeenCalled();
  });

  it('kayıtlı araç tercihiyle başlar; her araç kendi tanımını sürer', () => {
    for (const id of VEHICLE_IDS) {
      const { driver: offline, scope } = driver(id);
      expect(offline.player.spec).toBe(VEHICLES[id]);
      scope.dispose();
    }
  });

  it('geliştirici ekranından araç değişince oynanan araç yerinde yeni tanıma geçer', () => {
    const { driver: offline, scope, listeners } = driver('striker');
    const before = offline.player;
    before.chassis.place(1234, 2345, 0.5);
    const preferences = { scenario: 'empty', seed: 1, chaos: 1.5, vehicle: 'goliath' };
    for (const listener of listeners) listener(preferences as GamePreferences);
    expect(offline.player.spec).toBe(VEHICLES.goliath);
    expect(offline.player.id).not.toBe(before.id);
    expect(offline.player.chassis.x).toBeCloseTo(1234);
    expect(offline.player.chassis.y).toBeCloseTo(2345);
    // Aynı araç yeniden seçilirse oyuncu değişmez.
    const current = offline.player;
    for (const listener of listeners) listener(preferences as GamePreferences);
    expect(offline.player).toBe(current);
    scope.dispose();
  });

  it('kaydedilen kaos çarpanı simülasyonun temposu olur', () => {
    const { driver: offline, scope } = driver('striker');
    expect(offline.sim.pace).toBe(1.5);
    scope.dispose();
  });

  it('oyuncudan başka her aracı bot sayar', () => {
    const { driver: offline, scope } = driver('striker');
    expect(offline.isBot(offline.player.id)).toBe(false);
    expect(offline.isBot(offline.player.id + 1)).toBe(true);
    scope.dispose();
  });

  it('duraklatma menüsüne çevrimiçi katılım ve ana menü eylemlerini koyar', () => {
    const { driver: offline, scope, context } = driver('striker');
    const actions: Array<{ id: string; run: () => void }> = [];
    offline.attachHud({
      setPauseActions: (next: typeof actions) => actions.push(...next),
    } as never);
    expect(actions.map((action) => action.id)).toEqual(['online', 'menu']);
    actions[1].run();
    expect(context.toMenu).toHaveBeenCalledTimes(1);
    scope.dispose();
  });

  it('ayar servisi yoksa Striker ile açılır', () => {
    const { driver: offline, scope } = driver();
    expect(offline.player.spec).toBe(STRIKER);
    scope.dispose();
  });
});
