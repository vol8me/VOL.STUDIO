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

function driver(vehicle?: VehicleId): {
  driver: OfflineDriver;
  scope: DisposableScope;
  context: DriverContext;
} {
  const scope = new DisposableScope();
  const services =
    vehicle === undefined
      ? undefined
      : ({
          settings: {
            get: () => ({ scenario: 'empty', seed: 1, vehicle }) as GamePreferences,
            subscribe: () => () => undefined,
          },
          progress: { travel: vi.fn() },
        } as unknown as GameServices);
  const context: DriverContext = {
    scene: {} as Phaser.Scene,
    world: new World(WORLD.width, WORLD.height, WORLD.gridStep),
    weather: undefined as never,
    controls: {} as PlayerControls,
    ...(services ? { services } : {}),
    seed: 1,
    scope,
    restart: vi.fn(),
    toMenu: vi.fn(),
  };
  return { driver: new OfflineDriver(context), scope, context };
}

describe('OfflineDriver', () => {
  it('kayıtlı araç tercihiyle başlar; her araç kendi tanımını sürer', () => {
    for (const id of VEHICLE_IDS) {
      const { driver: offline, scope } = driver(id);
      expect(offline.player.spec).toBe(VEHICLES[id]);
      scope.dispose();
    }
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
