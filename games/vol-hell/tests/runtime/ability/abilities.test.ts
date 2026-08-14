import { describe, it, expect, beforeEach } from 'vitest';
import { StatBlock, Vector2, createRandom } from '@volstudio/core';
import { ABILITY_CATALOG, MIN_ABILITY_COOLDOWN_MS, getAbilityDefinition } from '@/config/abilities';
import { AbilityRuntime, createAbility } from '@/runtime/ability/AbilityRuntime';
import type { ChainLightningAbility } from '@/runtime/ability/ChainLightningAbility';
import type { MultiShotAbility } from '@/runtime/ability/MultiShotAbility';
import { bulletConfig } from '@/config/bullet';
import { ENEMY_CATALOG } from '@/config/enemies/catalog';
import { Enemy } from '@/runtime/entity/Enemy';
import { createEnemyStats } from '@/runtime/entity/enemyStats';
import type { BulletManager } from '@/runtime/entity/BulletManager';
import type { Border } from '@/runtime/entity/Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';

function makeScene(): never {
  const makeShape = (x: number, y: number) => {
    const shape = {
      x,
      y,
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
      lineBetween: () => shape,
      beginPath: () => shape,
      moveTo: () => shape,
      lineTo: () => shape,
      strokePath: () => shape,
      destroy: () => {},
    };
    return shape;
  };

  return {
    add: {
      circle: makeShape,
      rectangle: makeShape,
      graphics: () => makeShape(0, 0),
    },
  } as never;
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

function makeBorder(): Border {
  return {
    bounds: { left: 0, right: 800, top: 0, bottom: 600, width: 800, height: 600 },
    clampX: (x: number) => x,
    clampY: (y: number) => y,
  } as unknown as Border;
}

interface SpawnedBullet {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  damage: number;
}

function makeBullets(spawned: SpawnedBullet[]): BulletManager {
  return {
    spawnBullet: (x: number, y: number, dirX: number, dirY: number, damage: number) =>
      spawned.push({ x, y, dirX, dirY, damage }),
  } as unknown as BulletManager;
}

function makePlayerStats(): StatBlock {
  return new StatBlock({
    damage: bulletConfig.damage,
    speed: 220,
    health: 100,
    fireRate: bulletConfig.fireCooldownMs,
  });
}

describe('Ability sistemi', () => {
  let effects: EffectManager & { calls: string[] };
  let spawned: SpawnedBullet[];
  let stats: StatBlock;
  let runtime: AbilityRuntime;
  const playerPos = new Vector2(400, 300);
  const aim = new Vector2(1, 0);

  function makeEnemyAt(x: number, y: number): Enemy {
    const definition = ENEMY_CATALOG.grunt;
    return new Enemy(makeScene(), x, y, effects, {
      definition,
      stats: createEnemyStats(definition),
      scoreValue: definition.scoreValue,
    });
  }

  beforeEach(() => {
    effects = makeEffects();
    spawned = [];
    stats = makePlayerStats();
    runtime = new AbilityRuntime({
      scene: makeScene(),
      effects,
      border: makeBorder(),
      random: createRandom(1),
      bullets: makeBullets(spawned),
      playerStats: stats,
    });
  });

  describe('slotlar ve cooldown', () => {
    it('boş slotta tuşa basmak sessizce hiçbir şey yapmaz', () => {
      runtime.update(16, playerPos, aim, []);
      expect(runtime.tryActivate('primary')).toBe(false);
      expect(effects.calls).toHaveLength(0);
    });

    it('atanan ability aktive edilir ve cooldown’a girer', () => {
      runtime.assign('primary', createAbility('turret'));
      runtime.update(16, playerPos, aim, []);

      expect(runtime.tryActivate('primary')).toBe(true);
      expect(runtime.tryActivate('primary')).toBe(false);
    });

    it('cooldown dolunca yeniden kullanılabilir', () => {
      const ability = createAbility('chainLightning');
      runtime.assign('primary', ability);
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      runtime.update(getAbilityDefinition('chainLightning').cooldownMs, playerPos, aim, []);
      expect(ability.isReady()).toBe(true);
      expect(runtime.tryActivate('primary')).toBe(true);
    });

    it('hazır olma oranı cooldown boyunca artar', () => {
      const ability = createAbility('chainLightning');
      runtime.assign('primary', ability);
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');
      expect(ability.getReadyRatio()).toBeLessThan(0.5);

      runtime.update(getAbilityDefinition('chainLightning').cooldownMs / 2, playerPos, aim, []);
      const half = ability.getReadyRatio();
      expect(half).toBeGreaterThan(0.4);
      expect(half).toBeLessThan(1);
    });

    it('ateş hızı stat’ı cooldown’u kısaltır', () => {
      const ability = createAbility('chainLightning');
      runtime.assign('primary', ability);
      // fireRate = bekleme süresi; yarıya inince ability de iki kat hızlanır.
      stats.addModifier({ id: 'kart', stat: 'fireRate', type: 'multiply', value: 0.5 });

      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');
      runtime.update(getAbilityDefinition('chainLightning').cooldownMs * 0.5, playerPos, aim, []);

      expect(ability.isReady()).toBe(true);
    });

    it('cooldown mutlak alt sınırın altına inmez', () => {
      const ability = createAbility('multiShot');
      runtime.assign('primary', ability);
      stats.addModifier({ id: 'kart', stat: 'fireRate', type: 'multiply', value: 0 });

      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');
      runtime.update(MIN_ABILITY_COOLDOWN_MS - 1, playerPos, aim, []);
      expect(ability.isReady()).toBe(false);

      runtime.update(1, playerPos, aim, []);
      expect(ability.isReady()).toBe(true);
    });

    it('slot değiştirince eski ability bırakılır', () => {
      runtime.assign('primary', createAbility('turret'));
      runtime.assign('primary', createAbility('fireZone'));
      expect(runtime.getAbility('primary')?.id).toBe('fireZone');

      runtime.assign('primary', null);
      expect(runtime.getAbility('primary')).toBeNull();
    });
  });

  describe('kule', () => {
    it('aktivasyon kuleyi oyuncunun konumuna diker', () => {
      runtime.assign('primary', createAbility('turret'));
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      const turret = runtime.getTurret();
      expect(turret).not.toBeNull();
      expect(turret!.x).toBe(playerPos.x);
      expect(effects.calls).toContain('turretPlace');
    });

    it('TEK KULE kuralı: ikinci kule öncekini yıkar', () => {
      runtime.assign('primary', createAbility('turret'));
      runtime.assign('secondary', createAbility('turretSiege'));
      runtime.update(16, playerPos, aim, []);

      runtime.tryActivate('primary');
      const first = runtime.getTurret();
      runtime.tryActivate('secondary');
      const second = runtime.getTurret();

      expect(first).not.toBe(second);
      expect(first!.isAlive).toBe(false);
      expect(second!.isAlive).toBe(true);
      expect(effects.calls).toContain('turretDestroy');
    });

    it('kule menzilindeki düşmanı vurur', () => {
      runtime.assign('primary', createAbility('turret'));
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      const enemy = makeEnemyAt(playerPos.x + 40, playerPos.y);
      const params = ABILITY_CATALOG.turret.turret!;
      runtime.update(params.fireIntervalMs, playerPos, aim, [enemy]);

      // Namludan mermi çıkar…
      expect(effects.calls).toContain('turretShot');
      expect(runtime.getTurret()!.activeShotCount).toBe(1);

      // …ve mermi hedefe varınca hasar verir.
      for (let i = 0; i < 10 && runtime.getTurret()!.activeShotCount > 0; i++) {
        runtime.update(16, playerPos, aim, [enemy]);
      }
      expect(effects.calls).toContain('turretImpact');
    });

    it('kule canı bitince sahneden kalkar', () => {
      runtime.assign('primary', createAbility('turret'));
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      const turret = runtime.getTurret()!;
      expect(turret.takeDamage(ABILITY_CATALOG.turret.turret!.health)).toBe(true);
      runtime.update(16, playerPos, aim, []);
      expect(runtime.getTurret()).toBeNull();
    });

    it('kule hasarı yükseltme kartıyla artar', () => {
      runtime.upgrades.add('turretDamage', 50);
      runtime.assign('primary', createAbility('turret'));
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      const enemy = makeEnemyAt(playerPos.x + 30, playerPos.y);
      // Taban hasar 12; +50 ile tek mermide grunt'ı devirir. Mermi artık
      // gerçek bir cisim: yolu almasi icin birkac kare gerekir.
      runtime.update(ABILITY_CATALOG.turret.turret!.fireIntervalMs, playerPos, aim, [enemy]);
      for (let i = 0; i < 10 && enemy.isAlive; i++) {
        runtime.update(16, playerPos, aim, [enemy]);
      }
      expect(enemy.isAlive).toBe(false);
    });
  });

  describe('zincir yıldırım', () => {
    it('sıçrama sayısı kadar farklı düşmana sabit hasar verir', () => {
      runtime.assign('primary', createAbility('chainLightning'));
      const enemies = [
        makeEnemyAt(playerPos.x + 40, playerPos.y),
        makeEnemyAt(playerPos.x + 80, playerPos.y),
        makeEnemyAt(playerPos.x + 120, playerPos.y),
        makeEnemyAt(playerPos.x + 160, playerPos.y),
      ];

      runtime.update(16, playerPos, aim, enemies);
      runtime.tryActivate('primary');

      const params = ABILITY_CATALOG.chainLightning.chain!;
      for (let i = 0; i <= params.bounces + 1; i++) {
        runtime.update(params.hopIntervalMs, playerPos, aim, enemies);
      }

      // İlk hedef + bounces kadar sıçrama = toplam vurulan düşman.
      const damaged = enemies.filter((enemy) => !enemy.isAlive || enemy.getStats() !== null);
      expect(damaged.length).toBeGreaterThan(0);
      expect(effects.calls.filter((id) => id === 'chainHop')).toHaveLength(params.bounces + 1);
    });

    it('yükseltme kartı sıçrama sayısını artırır', () => {
      runtime.upgrades.add('chainBounces', 2);
      const ability = createAbility('chainLightning') as ChainLightningAbility;
      runtime.assign('primary', ability);

      const enemies = Array.from({ length: 8 }, (_, i) =>
        makeEnemyAt(playerPos.x + 40 + i * 30, playerPos.y),
      );
      runtime.update(16, playerPos, aim, enemies);
      runtime.tryActivate('primary');

      const params = ABILITY_CATALOG.chainLightning.chain!;
      for (let i = 0; i < params.bounces + 4; i++) {
        runtime.update(params.hopIntervalMs, playerPos, aim, enemies);
      }

      expect(effects.calls.filter((id) => id === 'chainHop')).toHaveLength(params.bounces + 3);
    });

    it('menzilde düşman yoksa zincir sessizce biter', () => {
      runtime.assign('primary', createAbility('chainLightning'));
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');
      runtime.update(1000, playerPos, aim, []);

      expect(effects.calls).not.toContain('chainHop');
      expect(runtime.getActiveStrikeCount()).toBe(0);
    });
  });

  describe('ateş alanı', () => {
    it('alan serilir ve içindeki düşmana tick başına hasar verir', () => {
      runtime.assign('primary', createAbility('fireZone'));
      const enemy = makeEnemyAt(playerPos.x + 30, playerPos.y);

      runtime.update(16, playerPos, aim, [enemy]);
      runtime.tryActivate('primary');
      expect(runtime.getActiveZoneCount()).toBe(1);

      const params = ABILITY_CATALOG.fireZone.fire!;
      runtime.update(params.tickMs, playerPos, aim, [enemy]);
      expect(effects.calls).toContain('fireZoneTick');
    });

    it('süresi dolunca alan kaybolur', () => {
      runtime.assign('primary', createAbility('fireZone'));
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      runtime.update(ABILITY_CATALOG.fireZone.fire!.durationMs, playerPos, aim, []);
      expect(runtime.getActiveZoneCount()).toBe(0);
    });

    it('yükseltme kartı alanın süresini uzatır', () => {
      runtime.upgrades.add('fireZoneDurationMs', 2000);
      runtime.assign('primary', createAbility('fireZone'));
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      runtime.update(ABILITY_CATALOG.fireZone.fire!.durationMs, playerPos, aim, []);
      expect(runtime.getActiveZoneCount()).toBe(1);
    });
  });

  describe('çoklu mermi', () => {
    it('tanımdaki sayıda mermi fırlatır', () => {
      runtime.assign('primary', createAbility('multiShot'));
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      expect(spawned).toHaveLength(ABILITY_CATALOG.multiShot.multiShot!.projectiles);
    });

    it('mermi hasarı oyuncu hasarının ölçeklenmiş hali', () => {
      runtime.assign('primary', createAbility('multiShot'));
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      const expected = stats.getValue('damage') * ABILITY_CATALOG.multiShot.multiShot!.damageScale;
      expect(spawned[0].damage).toBeCloseTo(expected, 6);
    });

    it('yükseltme kartı mermi sayısını artırır', () => {
      runtime.upgrades.add('multiShotProjectiles', 3);
      const ability = createAbility('multiShot') as MultiShotAbility;
      runtime.assign('primary', ability);
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      expect(spawned).toHaveLength(ABILITY_CATALOG.multiShot.multiShot!.projectiles + 3);
    });

    it('mermiler nişan yönünün etrafına yayılır', () => {
      runtime.assign('primary', createAbility('multiShot'));
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      const angles = spawned.map((bullet) => Math.atan2(bullet.dirY, bullet.dirX));
      expect(new Set(angles.map((a) => a.toFixed(4))).size).toBe(angles.length);
      // Yelpazenin ortası nişan yönü (0 radyan).
      expect(Math.min(...angles.map(Math.abs))).toBeLessThan(0.01);
    });

    it('tam daire varyantında mermiler eşit aralıklı dağılır', () => {
      runtime.assign('primary', createAbility('bulletStorm'));
      runtime.update(16, playerPos, aim, []);
      runtime.tryActivate('primary');

      const count = ABILITY_CATALOG.bulletStorm.multiShot!.projectiles;
      expect(spawned).toHaveLength(count);
      const angles = spawned.map((bullet) => Math.atan2(bullet.dirY, bullet.dirX));
      expect(new Set(angles.map((a) => a.toFixed(3))).size).toBe(count);
    });
  });

  it('destroy her şeyi temizler', () => {
    runtime.assign('primary', createAbility('turret'));
    runtime.assign('secondary', createAbility('fireZone'));
    runtime.update(16, playerPos, aim, []);
    runtime.tryActivate('primary');
    runtime.tryActivate('secondary');

    runtime.destroy();

    expect(runtime.getTurret()).toBeNull();
    expect(runtime.getActiveZoneCount()).toBe(0);
    expect(runtime.getAbility('primary')).toBeNull();
  });
});
