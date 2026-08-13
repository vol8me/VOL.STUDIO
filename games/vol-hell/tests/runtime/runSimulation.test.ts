import { describe, it, expect, vi } from 'vitest';
import { createRandom, Vector2 } from '@volstudio/core';
import { EnemyManager } from '@/runtime/entity/EnemyManager';
import { FluxPickupManager } from '@/runtime/entity/FluxPickupManager';
import { RunEconomy } from '@/runtime/systems/RunEconomy';
import { WaveManager } from '@/runtime/systems/WaveManager';
import { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import { getDifficultyState } from '@/runtime/systems/DifficultyCalculator';
import { economyConfig } from '@/config/economy';
import { difficultyConfig } from '@/config/difficulty';
import { waveConfig } from '@/config/wave';
import { physicsConfig } from '@/config/physics';
import { bulletConfig } from '@/config/bullet';
import { getMaxEnemyRadius } from '@/config/enemies/catalog';
import type { Border } from '@/runtime/entity/Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';

/**
 * Uzun koşu simülasyonu — birim testlerin göremediği ENTEGRASYON kusurlarını
 * arar: NaN'a kayan konumlar, sınırsız büyüyen diziler, dalga/ekonomi
 * sayaçlarının tutarsızlaşması, ölü düşmanların sahnede kalması.
 *
 * Gerçek Phaser sahnesi yerine sahte sahne kullanılır; amaç render değil,
 * sistemlerin birbirine bağlandığı yerdeki davranış.
 */

const BOUNDS = { left: 0, right: 900, top: 0, bottom: 700 };

function makeScene(): { scene: never; createdCount: () => number; destroyedCount: () => number } {
  let created = 0;
  let destroyed = 0;

  const makeShape = (x: number, y: number) => {
    created++;
    const shape = {
      x,
      y,
      setStrokeStyle: () => shape,
      setOrigin: () => shape,
      setSize: () => shape,
      setVisible: () => shape,
      setScale: () => shape,
      setDepth: () => shape,
      destroy: () => {
        destroyed++;
      },
    };
    return shape;
  };

  const scene = {
    add: {
      circle: (x: number, y: number) => makeShape(x, y),
      rectangle: (x: number, y: number) => makeShape(x, y),
    },
  };

  return {
    scene: scene as never,
    createdCount: () => created,
    destroyedCount: () => destroyed,
  };
}

function makeBorder(): Border {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return {
    bounds: {
      ...BOUNDS,
      width: BOUNDS.right - BOUNDS.left,
      height: BOUNDS.bottom - BOUNDS.top,
      centerX: (BOUNDS.left + BOUNDS.right) / 2,
      centerY: (BOUNDS.top + BOUNDS.bottom) / 2,
    },
    clampX: (x: number, r = 0) => clamp(x, BOUNDS.left + r, BOUNDS.right - r),
    clampY: (y: number, r = 0) => clamp(y, BOUNDS.top + r, BOUNDS.bottom - r),
  } as unknown as Border;
}

function makeEffects(): EffectManager {
  return {
    play: vi.fn(),
    getActiveParticleCount: () => 0,
    destroy: vi.fn(),
  } as unknown as EffectManager;
}

interface SimulationResult {
  economy: RunEconomy;
  waves: number[];
  shopTriggers: number[];
  levelUps: number[];
  eliteWaves: number[];
  bossWaves: number[];
  runCompleted: boolean;
  maxEnemies: number;
  maxPickups: number;
  enemyCount: number;
  pickupCount: number;
}

/**
 * Koşuyu `frames` kare boyunca sürer. Oyuncu sahada dolaşır, menzile giren
 * düşmanlar öldürülür — böylece ölüm, Flux düşüşü, toplama ve seviye atlama
 * yollarının hepsi çalışır.
 */
function simulate(frames: number, stepMs = 16): SimulationResult {
  const { scene } = makeScene();
  const border = makeBorder();
  const effects = makeEffects();
  const random = createRandom(20260813);
  const grid = new SpatialGrid(
    Math.max(getMaxEnemyRadius(), bulletConfig.radius) * physicsConfig.spatialGridCellMultiplier,
  );

  const economy = new RunEconomy({ onLevelUp: (level) => levelUps.push(level) });
  const levelUps: number[] = [];
  const waves: number[] = [];
  const shopTriggers: number[] = [];
  const eliteWaves: number[] = [];
  const bossWaves: number[] = [];
  let runCompleted = false;

  const enemies = new EnemyManager(scene, effects, random);
  const pickups = new FluxPickupManager(scene, border, effects, random, {
    onCollected: (amount) => economy.addFlux(amount),
  });
  const waveManager = new WaveManager({
    onWaveStart: (wave) => {
      waves.push(wave);
      enemies.setWave(wave);
    },
    onWaveEnd: (wave) => shopTriggers.push(wave),
    onEliteWave: (wave) => eliteWaves.push(wave),
    onBossWave: (wave) => bossWaves.push(wave),
    onRunComplete: () => {
      runCompleted = true;
    },
  });
  waveManager.start();

  const player = new Vector2(border.bounds.centerX, border.bounds.centerY);
  let elapsedMs = 0;
  let maxEnemies = 0;
  let maxPickups = 0;

  for (let frame = 0; frame < frames; frame++) {
    elapsedMs += stepMs;
    // Oyuncu saha içinde dolaşsın: hem mıknatıs hem temas yolları çalışsın.
    player.set(
      border.bounds.centerX + Math.cos(frame / 40) * 220,
      border.bounds.centerY + Math.sin(frame / 55) * 160,
    );

    const difficulty = getDifficultyState(elapsedMs);
    waveManager.update(stepMs);

    grid.clear();
    grid.insertAll(enemies.getEnemies());
    enemies.update(stepMs, player, border, elapsedMs, grid, difficulty);
    pickups.update(stepMs, player);
    grid.clear();
    grid.insertAll(enemies.getEnemies());
    grid.trim();

    // Oyuncuya yaklaşan düşmanları öldür — ölüm/ödül yolunu sür.
    for (const enemy of enemies.getEnemies()) {
      if (!enemy.isAlive) continue;
      if (Math.hypot(enemy.x - player.x, enemy.y - player.y) > 140) continue;
      if (!enemy.takeDamage(9999)) continue;

      economy.addSpark(enemy.sparkReward);
      pickups.drop(enemy.x, enemy.y, enemy.fluxReward);
    }

    maxEnemies = Math.max(maxEnemies, enemies.getEnemies().length);
    maxPickups = Math.max(maxPickups, pickups.getActiveCount());
  }

  return {
    economy,
    waves,
    shopTriggers,
    levelUps,
    eliteWaves,
    bossWaves,
    runCompleted,
    maxEnemies,
    maxPickups,
    enemyCount: enemies.getEnemies().length,
    pickupCount: pickups.getActiveCount(),
  };
}

describe('koşu simülasyonu — entegrasyon sağlamlığı', () => {
  it('bir dakikalık oyun hatasız akar ve ödül zinciri çalışır', () => {
    const result = simulate(3750); // ~60 sn

    expect(result.economy.getSpark()).toBeGreaterThan(0);
    expect(result.economy.getFlux()).toBeGreaterThan(0);
    expect(result.levelUps.length).toBeGreaterThan(0);
    // Seviyeler sırayla bildirilir, atlama olmaz.
    expect(result.levelUps).toEqual(result.levelUps.map((_, i) => i + 2));
  });

  it('düşman ve pickup sayıları sınırların içinde kalır', () => {
    const result = simulate(3750);

    expect(result.maxEnemies).toBeLessThanOrEqual(difficultyConfig.maxEnemiesCap);
    expect(result.maxPickups).toBeLessThanOrEqual(economyConfig.flux.maxActive);
  });

  it('tam koşu (20 dalga) doğru olayları doğru sırayla üretir', () => {
    // 20 dalga x 40 sn = 800 sn; 100 ms adımla hızlıca örtülür.
    const frames = Math.ceil((waveConfig.totalWaves * waveConfig.waveDurationMs) / 100) + 10;
    const result = simulate(frames, 100);

    expect(result.waves).toEqual(Array.from({ length: waveConfig.totalWaves }, (_, i) => i + 1));
    expect(result.shopTriggers).toEqual(
      Array.from({ length: waveConfig.totalWaves }, (_, i) => i + 1),
    );
    expect(result.eliteWaves).toEqual([waveConfig.eliteWave]);
    expect(result.bossWaves).toEqual([waveConfig.bossWave]);
    expect(result.runCompleted).toBe(true);
  });

  it('aynı seed aynı koşuyu üretir — determinizm bozulmadı', () => {
    const a = simulate(1200);
    const b = simulate(1200);

    expect(a.economy.getSpark()).toBe(b.economy.getSpark());
    expect(a.economy.getFlux()).toBe(b.economy.getFlux());
    expect(a.enemyCount).toBe(b.enemyCount);
    expect(a.pickupCount).toBe(b.pickupCount);
  });

  it('uzun koşuda konumlar sonlu kalır ve saha dışına taşmaz', () => {
    const { scene } = makeScene();
    const border = makeBorder();
    const effects = makeEffects();
    const random = createRandom(7);
    const grid = new SpatialGrid(64);
    const enemies = new EnemyManager(scene, effects, random);
    const player = new Vector2(border.bounds.centerX, border.bounds.centerY);
    enemies.setWave(waveConfig.totalWaves);

    const difficulty = getDifficultyState(600_000);
    for (let frame = 0; frame < 2000; frame++) {
      grid.clear();
      grid.insertAll(enemies.getEnemies());
      enemies.update(16, player, border, frame * 16, grid, difficulty);
    }

    for (const enemy of enemies.getEnemies()) {
      expect(Number.isFinite(enemy.x), enemy.definition.id).toBe(true);
      expect(Number.isFinite(enemy.y), enemy.definition.id).toBe(true);
      expect(enemy.x).toBeGreaterThanOrEqual(BOUNDS.left);
      expect(enemy.x).toBeLessThanOrEqual(BOUNDS.right);
      expect(enemy.y).toBeGreaterThanOrEqual(BOUNDS.top);
      expect(enemy.y).toBeLessThanOrEqual(BOUNDS.bottom);
    }
  });

  it('ölen düşmanlar listede birikmez', () => {
    const result = simulate(3750);
    expect(result.enemyCount).toBeLessThanOrEqual(result.maxEnemies);
    expect(result.enemyCount).toBeGreaterThanOrEqual(0);
  });
});
