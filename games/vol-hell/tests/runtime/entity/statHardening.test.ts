import { describe, it, expect, vi } from 'vitest';
import { StatBlock, Vector2 } from '@volstudio/core';
import { BulletManager } from '@/runtime/entity/BulletManager';
import { Enemy } from '@/runtime/entity/Enemy';
import { ENEMY_CATALOG } from '@/config/enemies/catalog';
import { createEnemyStats } from '@/runtime/entity/enemyStats';
import { bulletConfig } from '@/config/bullet';
import type { Border } from '@/runtime/entity/Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';

/**
 * Kartlar stat'ları serbestçe değiştirebilir. Bu testler,
 * uç modifier değerlerinin oyunu saçma bir duruma sokamayacağını kilitler:
 * negatif hasar iyileştirmemeli, sıfır cooldown mermi seline dönüşmemeli.
 */

function makeScene(): { scene: never; created: { x: number; y: number }[] } {
  const created: { x: number; y: number }[] = [];
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
      destroy: () => {},
    };
    created.push(shape);
    return shape;
  };

  return {
    scene: {
      add: { circle: makeShape, rectangle: makeShape },
    } as never,
    created,
  };
}

function makeEffects(): EffectManager {
  return {
    play: vi.fn(),
    getActiveParticleCount: () => 0,
    destroy: vi.fn(),
  } as unknown as EffectManager;
}

function makeBorder(): Border {
  return {
    bounds: { left: 0, right: 800, top: 0, bottom: 600, width: 800, height: 600 },
    clampX: (x: number) => x,
    clampY: (y: number) => y,
  } as unknown as Border;
}

describe('uç stat değerlerine karşı sağlamlık', () => {
  it('ateş bekleme süresi mutlak alt sınırın altına inmez', () => {
    const { scene } = makeScene();
    const stats = new StatBlock({
      damage: bulletConfig.damage,
      speed: 200,
      health: 100,
      fireRate: bulletConfig.fireCooldownMs,
    });
    // "Ateş hızı sonsuz" veren bozuk bir kart senaryosu.
    stats.addModifier({ id: 'bozuk-kart', stat: 'fireRate', type: 'multiply', value: 0 });

    const bullets = new BulletManager(scene, makeEffects(), stats);
    const origin = new Vector2(100, 100);
    const direction = new Vector2(1, 0);

    expect(bullets.tryFire(origin, direction)).toBe(true);
    // Alt sınırın hemen altındaki bir frame ateş açamaz.
    bullets.update(bulletConfig.minFireCooldownMs - 1, makeBorder());
    expect(bullets.tryFire(origin, direction)).toBe(false);

    bullets.update(1, makeBorder());
    expect(bullets.tryFire(origin, direction)).toBe(true);
  });

  it('negatif hasar modifier’ı mermiyi iyileştiriciye çevirmez', () => {
    const { scene } = makeScene();
    const stats = new StatBlock({
      damage: bulletConfig.damage,
      speed: 200,
      health: 100,
      fireRate: bulletConfig.fireCooldownMs,
    });
    stats.addModifier({ id: 'takas', stat: 'damage', type: 'add', value: -999 });

    const bullets = new BulletManager(scene, makeEffects(), stats);
    bullets.tryFire(new Vector2(0, 0), new Vector2(1, 0));

    expect(bullets.getBullets()[0].damage).toBe(0);
  });

  it('negatif temas hasarı oyuncuyu iyileştirmez', () => {
    const { scene } = makeScene();
    const definition = ENEMY_CATALOG.grunt;
    const stats = createEnemyStats(definition);
    stats.addModifier({ id: 'takas', stat: 'damage', type: 'multiply', value: -1 });

    const enemy = new Enemy(scene, 0, 0, makeEffects(), {
      definition,
      stats,
      scoreValue: definition.scoreValue,
      spawnIndex: 3,
    });

    expect(enemy.tryContactDamage(10_000)).toBe(0);
  });

  it('sıfır hız modifier’ı düşmanı geri geri yürütmez', () => {
    const { scene } = makeScene();
    const definition = ENEMY_CATALOG.grunt;
    const stats = createEnemyStats(definition);
    stats.addModifier({ id: 'yavaslatma', stat: 'speed', type: 'multiply', value: -2 });

    const enemy = new Enemy(scene, 100, 100, makeEffects(), {
      definition,
      stats,
      scoreValue: definition.scoreValue,
      spawnIndex: 4,
    });

    const grid = { queryNearby: () => [] } as never;
    const random = { next: () => 0.5, bipolar: () => 0 };
    enemy.update(16, new Vector2(400, 100), makeBorder(), grid, random);

    // Hız sıfıra kelepçelenir: düşman hedeften UZAKLAŞMAZ.
    expect(enemy.x).toBe(100);
  });

  it('maksimum can en az bir vuruşluk kalır', () => {
    const { scene } = makeScene();
    const definition = ENEMY_CATALOG.grunt;
    const stats = createEnemyStats(definition);
    stats.addModifier({ id: 'cam-kanat', stat: 'health', type: 'multiply', value: 0.001 });

    const enemy = new Enemy(scene, 0, 0, makeEffects(), {
      definition,
      stats,
      scoreValue: definition.scoreValue,
      spawnIndex: 5,
    });

    // Tek mermilik hasar öldürür; sıfır canla doğup anında ölen düşman olmaz.
    expect(enemy.isAlive).toBe(true);
    expect(enemy.takeDamage(bulletConfig.damage)).toBe(true);
  });

  it('NaN hasar ve zaman düşman canını/cooldownunu bozmaz', () => {
    const { scene } = makeScene();
    const definition = ENEMY_CATALOG.grunt;
    const enemy = new Enemy(scene, 0, 0, makeEffects(), {
      definition,
      stats: createEnemyStats(definition),
      scoreValue: definition.scoreValue,
      spawnIndex: 6,
    });
    const initialRatio = enemy.getHealthRatio();

    expect(enemy.takeDamage(Number.NaN)).toBe(false);
    expect(enemy.getHealthRatio()).toBe(initialRatio);
    expect(enemy.tryContactDamage(Number.NaN)).toBe(0);
    expect(Number.isFinite(enemy.getHealthRatio())).toBe(true);
  });

  it('geçersiz mermi yönü doğurulmaz ve cooldown sonsuza kaçmaz', () => {
    const { scene } = makeScene();
    const stats = new StatBlock({
      damage: bulletConfig.damage,
      speed: 200,
      health: 100,
      fireRate: Number.NaN,
    });
    const bullets = new BulletManager(scene, makeEffects(), stats);

    expect(bullets.tryFire(new Vector2(0, 0), new Vector2(Number.NaN, 1))).toBe(false);
    expect(bullets.getBullets()).toHaveLength(0);
  });
});
