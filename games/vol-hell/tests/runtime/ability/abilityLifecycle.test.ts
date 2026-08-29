import { describe, it, expect, beforeEach } from 'vitest';
import { StatBlock, Vector2, createRandom } from '@volstudio/core';
import { ABILITY_CATALOG } from '@/config/abilities';
import { AbilityRuntime, createAbility } from '@/runtime/ability/AbilityRuntime';
import { bulletConfig } from '@/config/bullet';
import { ENEMY_CATALOG } from '@/config/enemies/catalog';
import { Enemy } from '@/runtime/entity/Enemy';
import { createEnemyStats } from '@/runtime/entity/enemyStats';
import type { BulletManager } from '@/runtime/entity/BulletManager';
import type { Border } from '@/runtime/entity/Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';

interface FakeShape {
  x: number;
  y: number;
  destroyed: boolean;
}

/** Sahnede yaratılan/yok edilen her şekli sayan sahte sahne — sızıntı avı için. */
function makeCountingScene(): { scene: never; shapes: FakeShape[] } {
  const shapes: FakeShape[] = [];

  const makeShape = (x: number, y: number) => {
    const shape = {
      x,
      y,
      destroyed: false,
      setStrokeStyle: () => shape,
      setOrigin: () => shape,
      setSize: () => shape,
      setVisible: () => shape,
      setScale: () => shape,
      setDepth: () => shape,
      setAlpha: () => shape,
      setRotation: () => shape,
      clear: () => shape,
      lineStyle: () => shape,
      beginPath: () => shape,
      moveTo: () => shape,
      lineTo: () => shape,
      strokePath: () => shape,
      destroy: () => {
        shape.destroyed = true;
      },
    };
    shapes.push(shape);
    return shape;
  };

  return {
    scene: {
      add: { circle: makeShape, rectangle: makeShape, graphics: () => makeShape(0, 0) },
    } as never,
    shapes,
  };
}

function makeEffects(): EffectManager & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    play: (id: string) => calls.push(id),
    getActiveParticleCount: () => 0,
    destroy: () => {},
  } as unknown as EffectManager & { calls: string[] };
}

/** Kule mermilerinin saha teması sözleşmesini de taşıyan geniş test arenası. */
function makeBorder(): Border {
  return {
    bounds: {
      left: 0,
      right: 800,
      top: 0,
      bottom: 600,
      width: 800,
      height: 600,
      centerX: 400,
      centerY: 300,
    },
    clampX: (x: number) => x,
    clampY: (y: number) => y,
  } as unknown as Border;
}

/**
 * Ability'lerin ürettiği GameObject'lerin yaşam döngüsü.
 *
 * Bu testler bir sızıntıyı yakaladıktan sonra yazıldı: kule yıkıldığında
 * havadaki mermileri sahipsiz kalıyor, sahnede donmuş halde birikiyordu.
 */
describe('ability yaşam döngüsü — sahnede artık kalmaz', () => {
  let shapes: FakeShape[];
  let runtime: AbilityRuntime;
  let effects: EffectManager & { calls: string[] };
  let scene: never;
  const playerPos = new Vector2(400, 300);
  const aim = new Vector2(1, 0);

  function makeEnemyAt(x: number, y: number): Enemy {
    const definition = ENEMY_CATALOG.grunt;
    return new Enemy(scene, x, y, effects, {
      definition,
      stats: createEnemyStats(definition),
      scoreValue: definition.scoreValue,
    });
  }

  function liveShapes(): number {
    return shapes.filter((shape) => !shape.destroyed).length;
  }

  beforeEach(() => {
    const made = makeCountingScene();
    scene = made.scene;
    shapes = made.shapes;
    effects = makeEffects();

    runtime = new AbilityRuntime({
      scene,
      effects,
      border: makeBorder(),
      random: createRandom(5),
      bullets: { spawnBullet: () => {} } as unknown as BulletManager,
      playerStats: new StatBlock({
        damage: bulletConfig.damage,
        speed: 220,
        health: 100,
        fireRate: bulletConfig.fireCooldownMs,
      }),
    });
  });

  it('kule yıkılınca havadaki mermileri de sahneden kalkar', () => {
    runtime.assign('primary', createAbility('turret'));
    const enemy = makeEnemyAt(playerPos.x + 200, playerPos.y);

    runtime.update(16, playerPos, aim, [enemy]);
    runtime.tryActivate('primary');
    // Mermi doğsun ama hedefe varmasın (uzak düşman).
    runtime.update(ABILITY_CATALOG.turret.turret!.fireIntervalMs, playerPos, aim, [enemy]);
    const turret = runtime.getTurret()!;
    expect(turret.activeShotCount).toBe(1);

    const beforeLive = liveShapes();
    turret.takeDamage(ABILITY_CATALOG.turret.turret!.health);
    runtime.update(16, playerPos, aim, [enemy]);

    expect(runtime.getTurret()).toBeNull();
    // Gövde + namlu + menzil + can barı (2) + mermi = en az 6 şekil kapanmalı.
    expect(liveShapes()).toBeLessThan(beforeLive);
    expect(shapes.filter((shape) => !shape.destroyed && shape !== undefined).length).toBeLessThan(
      beforeLive,
    );
  });

  it('yeni kule eskisini ve onun mermilerini temizler', () => {
    runtime.assign('primary', createAbility('turret'));
    const enemy = makeEnemyAt(playerPos.x + 200, playerPos.y);

    runtime.update(16, playerPos, aim, [enemy]);
    runtime.tryActivate('primary');
    runtime.update(ABILITY_CATALOG.turret.turret!.fireIntervalMs, playerPos, aim, [enemy]);

    const first = runtime.getTurret()!;
    expect(first.activeShotCount).toBe(1);

    // Cooldown dolsun ve ikinci kule kurulsun.
    runtime.update(ABILITY_CATALOG.turret.cooldownMs, playerPos, aim, [enemy]);
    runtime.tryActivate('primary');

    expect(first.isAlive).toBe(false);
    expect(first.activeShotCount).toBe(0);
    expect(runtime.getTurret()).not.toBe(first);
  });

  it('runtime destroy edilince hiçbir ability şekli sahnede kalmaz', () => {
    runtime.assign('primary', createAbility('turret'));
    runtime.assign('secondary', createAbility('fireZone'));
    const enemy = makeEnemyAt(playerPos.x + 200, playerPos.y);

    runtime.update(16, playerPos, aim, [enemy]);
    runtime.tryActivate('primary');
    runtime.tryActivate('secondary');
    runtime.update(ABILITY_CATALOG.turret.turret!.fireIntervalMs, playerPos, aim, [enemy]);

    runtime.destroy();

    // Düşmanın kendi şekilleri hariç her şey kapanmış olmalı.
    const enemyShapes = 3; // gövde + can barı arka planı + dolgusu
    expect(liveShapes()).toBeLessThanOrEqual(enemyShapes);
  });

  it('clearTransientState slotları korurken sahadaki ability varlıklarını siler', () => {
    runtime.assign('primary', createAbility('turret'));
    runtime.assign('secondary', createAbility('fireZone'));
    runtime.update(16, playerPos, aim, []);
    runtime.tryActivate('primary');
    runtime.tryActivate('secondary');

    runtime.clearTransientState();

    expect(runtime.getAbility('primary')).not.toBeNull();
    expect(runtime.getAbility('secondary')).not.toBeNull();
    expect(runtime.getTurret()).toBeNull();
    expect(runtime.getActiveZoneCount()).toBe(0);
  });

  it('zincir yıldırım söndükten sonra grafiği kapanır', () => {
    runtime.assign('primary', createAbility('chainLightning'));
    const enemy = makeEnemyAt(playerPos.x + 60, playerPos.y);

    runtime.update(16, playerPos, aim, [enemy]);
    runtime.tryActivate('primary');
    expect(runtime.getActiveStrikeCount()).toBe(1);

    // Zincir biter, kollar söner.
    for (let i = 0; i < 60; i++) {
      runtime.update(16, playerPos, aim, [enemy]);
    }

    expect(runtime.getActiveStrikeCount()).toBe(0);
  });

  it('ateş alanı süresi dolunca sahneden kalkar', () => {
    runtime.assign('primary', createAbility('fireZone'));
    runtime.update(16, playerPos, aim, []);
    runtime.tryActivate('primary');

    const zoneShapes = shapes.filter((shape) => !shape.destroyed).length;
    runtime.update(ABILITY_CATALOG.fireZone.fire!.durationMs, playerPos, aim, []);

    expect(runtime.getActiveZoneCount()).toBe(0);
    expect(liveShapes()).toBeLessThan(zoneShapes);
  });

  it('kule mermisi hedefini kaybederse ömrü dolunca söner', () => {
    runtime.assign('primary', createAbility('turret'));
    const enemy = makeEnemyAt(playerPos.x + 220, playerPos.y);

    runtime.update(16, playerPos, aim, [enemy]);
    runtime.tryActivate('primary');
    runtime.update(ABILITY_CATALOG.turret.turret!.fireIntervalMs, playerPos, aim, [enemy]);
    expect(runtime.getTurret()!.activeShotCount).toBe(1);

    // Düşman ölür; mermi hedefsiz kalır ama sonsuza kadar uçmaz.
    enemy.takeDamage(9999);
    for (let i = 0; i < 200; i++) {
      runtime.update(16, playerPos, aim, []);
    }

    expect(runtime.getTurret()!.activeShotCount).toBe(0);
  });
});
