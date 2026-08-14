import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRandom, Vector2 } from '@volstudio/core';
import { EnemyManager } from '@/runtime/entity/EnemyManager';
import { ENEMY_CATALOG } from '@/config/enemies/catalog';
import { enemyConfig } from '@/config/enemy';
import { getDifficultyState } from '@/runtime/systems/DifficultyCalculator';
import type { Border } from '@/runtime/entity/Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { SpatialGrid } from '@/runtime/systems/SpatialGrid';

/** Sahte Phaser sahnesi — yalnızca Enemy'nin dokunduğu yüzey. */
function makeScene(): { scene: unknown; circles: number } {
  let circles = 0;
  const makeShape = (x: number, y: number) => ({
    x,
    y,
    setStrokeStyle: () => makeShape(x, y),
    setOrigin: () => makeShape(x, y),
    setSize: () => makeShape(x, y),
    setVisible: () => makeShape(x, y),
    setDepth: () => makeShape(x, y),
    destroy: () => {},
  });

  const scene = {
    add: {
      circle: (x: number, y: number) => {
        circles++;
        return makeShape(x, y);
      },
      rectangle: (x: number, y: number) => makeShape(x, y),
    },
  };
  return {
    scene,
    get circles() {
      return circles;
    },
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

function makeGrid(): SpatialGrid {
  return { queryNearby: () => [] } as unknown as SpatialGrid;
}

describe('EnemyManager', () => {
  let manager: EnemyManager;
  let border: Border;
  let grid: SpatialGrid;
  const difficulty = getDifficultyState(0);
  // Spawn kenarlardan olur; oyuncu merkezde durunca minimum mesafe koşulu sağlanır.
  const playerPos = new Vector2(400, 300);

  beforeEach(() => {
    const { scene } = makeScene();
    manager = new EnemyManager(scene as never, makeEffects(), createRandom(11));
    border = makeBorder();
    grid = makeGrid();
  });

  function tick(ms: number): void {
    manager.update(ms, playerPos, border, 0, grid, difficulty);
  }

  it('spawn aralığı dolmadan düşman doğurmaz', () => {
    tick(difficulty.spawnIntervalMs - 1);
    expect(manager.getEnemies()).toHaveLength(0);
  });

  it('spawn aralığı dolunca katalogdan düşman doğurur', () => {
    tick(difficulty.spawnIntervalMs);
    expect(manager.getEnemies()).toHaveLength(1);
    expect(ENEMY_CATALOG[manager.getEnemies()[0].definition.id]).toBeDefined();
  });

  it('1. dalgada yalnızca ilk dalga havuzundaki türler doğar', () => {
    manager.setWave(1);
    for (let i = 0; i < 12; i++) {
      tick(difficulty.spawnIntervalMs);
    }
    expect(manager.getEnemies().length).toBeGreaterThan(0);
    for (const enemy of manager.getEnemies()) {
      expect(enemy.definition.minWave).toBeLessThanOrEqual(1);
    }
  });

  it('ileri dalgada rusher ve swarmer da havuza girer', () => {
    manager.setWave(20);
    const ids = new Set<string>();
    for (let i = 0; i < 60; i++) {
      tick(difficulty.spawnIntervalMs);
      for (const enemy of manager.getEnemies()) {
        ids.add(enemy.definition.id);
      }
    }
    expect(ids.has('lancer') || ids.has('brooder')).toBe(true);
  });

  it('eşzamanlı düşman sayısı zorluk limitini aşmaz', () => {
    for (let i = 0; i < difficulty.maxEnemies * 2; i++) {
      tick(difficulty.spawnIntervalMs);
    }
    expect(manager.getEnemies().length).toBeLessThanOrEqual(difficulty.maxEnemies);
  });

  it('aynı seed aynı spawn dizisini üretir — determinizm korunur', () => {
    const run = (): string[] => {
      const { scene } = makeScene();
      const local = new EnemyManager(scene as never, makeEffects(), createRandom(4242));
      local.setWave(20);
      for (let i = 0; i < 10; i++) {
        local.update(difficulty.spawnIntervalMs, playerPos, border, 0, makeGrid(), difficulty);
      }
      return local
        .getEnemies()
        .map((e) => `${e.definition.id}@${Math.round(e.x)},${Math.round(e.y)}`);
    };

    expect(run()).toEqual(run());
  });

  it('hiçbir düşman oyuncunun minimum spawn mesafesi içinde doğmaz', () => {
    // Oyuncu köşede: kenarların önemli bir kısmı minimum mesafenin içinde
    // kalır, o denemeler reddedilmeli. Küçük delta ile ilerlenir ki düşman
    // doğduğu frame'de kayda değer yol almasın.
    const cornerPlayer = new Vector2(0, 0);
    const stepMs = 16;
    const maxDriftPerFrame = 200 * (stepMs / 1000);
    let spawnCount = 0;
    let previous = 0;

    for (let i = 0; i < 400; i++) {
      manager.update(stepMs, cornerPlayer, border, 0, grid, difficulty);
      const enemies = manager.getEnemies();
      if (enemies.length <= previous) {
        previous = enemies.length;
        continue;
      }

      spawnCount++;
      previous = enemies.length;
      const spawned = enemies[enemies.length - 1];
      expect(Math.hypot(spawned.x, spawned.y)).toBeGreaterThan(
        enemyConfig.spawnMinPlayerDistance - maxDriftPerFrame,
      );
    }

    expect(spawnCount).toBeGreaterThan(0);
  });

  it('swarmer minion doğurur ve kapasitesini aşmaz', () => {
    const { scene } = makeScene();
    const local = new EnemyManager(scene as never, makeEffects(), createRandom(1));
    local.setWave(20);

    // Havuzdan swarmer çıkana kadar spawn et.
    for (
      let i = 0;
      i < 200 && !local.getEnemies().some((e) => e.definition.id === 'brooder');
      i++
    ) {
      local.update(difficulty.spawnIntervalMs, playerPos, border, 0, grid, difficulty);
    }
    const brooder = local.getEnemies().find((e) => e.definition.id === 'brooder');
    expect(brooder).toBeDefined();

    const params = ENEMY_CATALOG.brooder.swarmer!;
    for (let i = 0; i < 20; i++) {
      local.update(params.spawnIntervalMs, playerPos, border, 0, grid, difficulty);
    }

    const minions = local.getEnemies().filter((e) => e.definition.id === params.minionId);
    expect(minions.length).toBeGreaterThan(0);
    // Sahnedeki her swarmer en fazla maxMinions kadar minion tutabilir.
    const swarmerCount = local.getEnemies().filter((e) => e.definition.id === 'brooder').length;
    expect(minions.length).toBeLessThanOrEqual(swarmerCount * params.maxMinions);
  });

  it('destroy tüm düşmanları temizler', () => {
    for (let i = 0; i < 5; i++) tick(difficulty.spawnIntervalMs);
    expect(manager.getEnemies().length).toBeGreaterThan(0);

    manager.destroy();
    expect(manager.getEnemies()).toHaveLength(0);
  });

  it('ölen düşman için onEnemyDeath callback çağrılır', () => {
    const onEnemyDeath = vi.fn();
    const { scene } = makeScene();
    const local = new EnemyManager(scene as never, makeEffects(), createRandom(11), {
      onEnemyDeath,
    });
    local.setWave(1);
    local.update(difficulty.spawnIntervalMs, playerPos, border, 0, grid, difficulty);
    const enemy = local.getEnemies()[0];
    enemy.takeDamage(9999);

    expect(onEnemyDeath).toHaveBeenCalledWith(enemy);
  });

  it('spawnSpecial dışarıdan sürülen düşman doğurur; update hareket ettirmez', () => {
    const { scene } = makeScene();
    const local = new EnemyManager(scene as never, makeEffects(), createRandom(11));
    const elite = local.spawnSpecial(ENEMY_CATALOG.warden, 400, 100, difficulty);

    expect(local.getEnemies()).toContain(elite);

    const beforeX = elite.x;
    const beforeY = elite.y;
    local.update(1000, playerPos, border, 0, grid, difficulty);

    expect(elite.x).toBe(beforeX);
    expect(elite.y).toBe(beforeY);
  });

  it('clearRegularEnemies normal düşmanları temizler, Elite/Boss korur', () => {
    const { scene } = makeScene();
    const local = new EnemyManager(scene as never, makeEffects(), createRandom(11));
    local.setWave(1);
    local.update(difficulty.spawnIntervalMs, playerPos, border, 0, grid, difficulty);
    const grunt = local.getEnemies()[0];
    const elite = local.spawnSpecial(ENEMY_CATALOG.warden, 400, 100, difficulty);

    const cleared = local.clearRegularEnemies();

    expect(cleared).toBe(1);
    expect(local.getEnemies()).toContain(elite);
    expect(local.getEnemies()).not.toContain(grunt);
    expect(grunt.isAlive).toBe(false);
    expect(elite.isAlive).toBe(true);
  });

  it('spawnMinionsFor zorluk limitine saygı gösterir', () => {
    const { scene } = makeScene();
    const local = new EnemyManager(scene as never, makeEffects(), createRandom(11));
    local.setWave(20);
    const brooder = local.spawnSpecial(ENEMY_CATALOG.brooder, 400, 100, difficulty);

    local.spawnMinionsFor(
      brooder,
      {
        minionId: 'swarmling',
        count: 100,
        angles: Array.from({ length: 100 }, (_, i) => (i * Math.PI) / 50),
        radius: 20,
      },
      difficulty,
    );

    expect(local.getEnemies().length).toBeLessThanOrEqual(difficulty.maxEnemies);
  });
});
