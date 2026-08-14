import { describe, it, expect, vi } from 'vitest';
import { createRandom, StatBlock, Vector2 } from '@volstudio/core';
import { RunDirector } from '@/runtime/systems/RunDirector';
import { EnemyManager } from '@/runtime/entity/EnemyManager';
import { BulletManager } from '@/runtime/entity/BulletManager';
import { FluxPickupManager } from '@/runtime/entity/FluxPickupManager';
import { TelegraphManager } from '@/runtime/systems/TelegraphManager';
import { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import { getDifficultyState } from '@/runtime/systems/DifficultyCalculator';
import type { Border } from '@/runtime/entity/Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import { waveConfig } from '@/config/wave';
import { getMaxEnemyRadius } from '@/config/enemies/catalog';
import { physicsConfig } from '@/config/physics';
import { bulletConfig } from '@/config/bullet';

function makeGraphics() {
  return {
    x: 0,
    y: 0,
    setDepth: () => makeGraphics(),
    clear: () => makeGraphics(),
    fillStyle: () => makeGraphics(),
    lineStyle: () => makeGraphics(),
    fillCircle: () => makeGraphics(),
    strokeCircle: () => makeGraphics(),
    fillPath: () => makeGraphics(),
    strokePath: () => makeGraphics(),
    beginPath: () => makeGraphics(),
    moveTo: () => makeGraphics(),
    lineTo: () => makeGraphics(),
    closePath: () => makeGraphics(),
    destroy: () => {},
  };
}

function makeScene(): never {
  const makeShape = (x: number, y: number) => ({
    x,
    y,
    setStrokeStyle: () => makeShape(x, y),
    setOrigin: () => makeShape(x, y),
    setSize: () => makeShape(x, y),
    setVisible: () => makeShape(x, y),
    setScale: () => makeShape(x, y),
    setDepth: () => makeShape(x, y),
    destroy: () => {},
  });

  return {
    add: {
      circle: (x: number, y: number) => makeShape(x, y),
      rectangle: (x: number, y: number) => makeShape(x, y),
      graphics: () => makeGraphics(),
    },
  } as never;
}

function makeBorder(): Border {
  return {
    bounds: {
      left: 0,
      right: 900,
      top: 0,
      bottom: 700,
      width: 900,
      height: 700,
      centerX: 450,
      centerY: 350,
    },
    clampX: (x: number) => x,
    clampY: (y: number) => y,
  } as unknown as Border;
}

function makeEffects(): EffectManager {
  return {
    play: vi.fn(),
    getActiveParticleCount: () => 0,
    destroy: vi.fn(),
  } as unknown as EffectManager;
}

function makeGrid(): SpatialGrid {
  return new SpatialGrid(
    Math.max(getMaxEnemyRadius(), bulletConfig.radius) * physicsConfig.spatialGridCellMultiplier,
  );
}

function makeRunDirector() {
  const scene = makeScene();
  const border = makeBorder();
  const effects = makeEffects();
  const random = createRandom(2025);
  const playerPos = new Vector2(450, 350);
  const playerStats = new StatBlock({ damage: 22, fireRate: 260, health: 100, speed: 220 });
  const bulletStats = new StatBlock({ damage: 22, fireRate: 260, health: 100, speed: 220 });
  const grid = makeGrid();

  const enemyManager = new EnemyManager(scene, effects, random);
  const bulletManager = new BulletManager(scene, effects, bulletStats);
  const telegraphs = new TelegraphManager(scene);
  const pickups = new FluxPickupManager(scene, border, effects, random, { onCollected: vi.fn() });

  const callbacks = {
    onLevelUp: vi.fn(),
    onShopOpen: vi.fn(),
    onWaveStart: vi.fn(),
    onRunComplete: vi.fn(),
  };

  const run = new RunDirector(
    {
      scene,
      border,
      effects,
      telegraphs,
      random,
      enemyManager,
      bulletManager,
      playerStats,
      damagePlayer: vi.fn(),
      getPlayerPosition: () => playerPos,
      getDifficulty: () => getDifficultyState(0),
    },
    callbacks,
  );

  return { run, callbacks, enemyManager, bulletManager, telegraphs, pickups, playerPos, grid };
}

describe('RunDirector', () => {
  it('start ilk dalgayı başlatır ve wave start bildirir', () => {
    const { run, callbacks } = makeRunDirector();
    run.start();

    expect(run.getCurrentWave()).toBe(1);
    expect(callbacks.onWaveStart).toHaveBeenCalledWith(1);
  });

  it('normal dalga sonunda clearArena çağrılır: mermi, telegraph ve Flux temizlenir', () => {
    const { run, callbacks, bulletManager, telegraphs } = makeRunDirector();
    run.start();

    // Sahnede kalan mermi ve telegraph koyalım.
    bulletManager.spawnBullet(100, 100, 1, 0, 10);
    telegraphs.play({
      durationMs: 10_000,
      shape: 'circle',
      x: 200,
      y: 200,
      radius: 40,
    });

    run.update(waveConfig.waveDurationMs, new Vector2(450, 350), makeGrid());

    expect(bulletManager.getBullets()).toHaveLength(0);
    expect(telegraphs.getActiveCount()).toBe(0);
    expect(callbacks.onShopOpen).toHaveBeenCalledWith(1);
    expect(run.getCurrentWave()).toBe(2);
  });

  it('elite dalgasında engel hayattayken dalga uzar; elite ölünce biter', () => {
    const { run, callbacks, playerPos, grid } = makeRunDirector();
    run.start();

    // 9 normal dalgayı geç.
    for (let w = 1; w < waveConfig.eliteWave; w++) {
      run.update(waveConfig.waveDurationMs, playerPos, grid);
    }

    expect(run.getCurrentWave()).toBe(waveConfig.eliteWave);
    expect(callbacks.onWaveStart).toHaveBeenCalledWith(waveConfig.eliteWave);

    const blocker = run.getBlocker();
    expect(blocker).not.toBeNull();
    expect(blocker?.definition.id).toBe('warden');

    // Elite dalgası süresini doldur.
    run.update(waveConfig.waveDurationMs, playerPos, grid);
    expect(run.isAwaitingBlocker()).toBe(true);

    // Eliti öldür — dalga hemen bitsin.
    blocker!.takeDamage(9_999_999);
    callbacks.onShopOpen.mockClear();
    callbacks.onWaveStart.mockClear();

    run.update(16, playerPos, grid);

    expect(run.isAwaitingBlocker()).toBe(false);
    expect(run.getCurrentWave()).toBe(waveConfig.eliteWave + 1);
    expect(callbacks.onShopOpen).toHaveBeenCalledWith(waveConfig.eliteWave);
    expect(callbacks.onWaveStart).toHaveBeenCalledWith(waveConfig.eliteWave + 1);
  });
});
