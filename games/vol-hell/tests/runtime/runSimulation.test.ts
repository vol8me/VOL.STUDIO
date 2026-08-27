import { describe, expect, it } from 'vitest';
import { simulationConfig } from '@/config/simulation';
import { difficultyConfig } from '@/config/difficulty';
import { economyConfig } from '@/config/economy';
import { waveConfig } from '@/config/wave';
import {
  simulateVolHell,
  VolHellSimulation,
  VolHellSimulationDriver,
  type VolHellSimulationSnapshot,
} from '@/runtime/simulation';

/**
 * Uzun koşu simülasyonu — birim testlerin göremediği ENTEGRASYON kusurlarını
 * arar: NaN'a kayan konumlar, sınırsız büyüyen diziler, dalga/ekonomi
 * sayaçlarının tutarsızlaşması, ölü düşmanların sahnede kalması.
 *
 * Bu test gerçek Phaser sahnesini kurmaz. `VolHellSimulation`, oyun kuralı ve
 * render adaptörü arasındaki ortak, başsız sınırdır; render testi ayrıca kendi
 * Phaser kapısında çalışır.
 */

const BOUNDS = simulationConfig.bounds;

function simulate(
  frames: number,
  stepMs: number = simulationConfig.defaultStepMs,
): VolHellSimulationSnapshot {
  return simulateVolHell(frames, {
    seed: simulationConfig.defaultSeed,
    stepMs,
  });
}

describe('koşu simülasyonu — entegrasyon sağlamlığı', () => {
  it('bir dakikalık oyun hatasız akar ve ödül zinciri çalışır', () => {
    const result = simulate(3750);

    expect(result.economy.spark).toBeGreaterThan(0);
    expect(result.economy.flux).toBeGreaterThan(0);
    expect(result.levelUps.length).toBeGreaterThan(0);
    // Seviyeler sırayla bildirilir, atlama olmaz.
    expect(result.levelUps).toEqual(result.levelUps.map((_, i) => i + 2));
  });

  it('düşman ve pickup sayıları sınırların içinde kalır', () => {
    const result = simulate(3750);

    expect(result.maxEnemies).toBeLessThanOrEqual(difficultyConfig.maxEnemiesCap);
    expect(result.maxPickups).toBeLessThanOrEqual(economyConfig.flux.maxActive);
  });

  // Tek parça hâlinde kalmalı: biriken durumuyla kesintisiz bir koşuyu
  // doğruluyor, dalgalara bölünürse test ettiği şey kalmaz. Coverage
  // enstrümantasyonu altında varsayılan 5 sn'yi aştığı için süre açıkça
  // yükseltilir — global testTimeout artırmak diğer testlerdeki gerçek
  // takılmaları gizlerdi.
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
  }, 20_000);

  it('aynı seed aynı koşuyu üretir — determinizm bozulmadı', () => {
    const a = simulate(1200);
    const b = simulate(1200);

    expect(a).toEqual(b);
  });

  it('uzun koşuda konumlar sonlu kalır ve saha dışına taşmaz', () => {
    const simulation = new VolHellSimulation({
      seed: 7,
      killRadius: null,
      playerPosition: (_frame, bounds) => ({
        x: (bounds.left + bounds.right) / 2,
        y: (bounds.top + bounds.bottom) / 2,
      }),
    });
    simulation.run(2000);

    for (const enemy of simulation.getRenderSnapshot().enemies) {
      expect(Number.isFinite(enemy.x), enemy.definitionId).toBe(true);
      expect(Number.isFinite(enemy.y), enemy.definitionId).toBe(true);
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

  it('render katmanı oyuncu konumunu başsız sözleşmeden besleyebilir', () => {
    let positionCalls = 0;
    const simulation = new VolHellSimulation({
      killRadius: null,
      playerPosition: (_frame, bounds) => {
        positionCalls += 1;
        return { x: bounds.right + 100, y: bounds.bottom + 100 };
      },
    });

    simulation.run(12);

    expect(positionCalls).toBe(12);
    expect(simulation.snapshot().player).toEqual({ x: BOUNDS.right, y: BOUNDS.bottom });
  });

  it('geçersiz delta yok sayılır, dar sahada güvenli spawn retry çalışır', () => {
    const simulation = new VolHellSimulation({
      bounds: { left: 0, right: 1, top: 0, bottom: 1 },
      killRadius: null,
      playerPosition: () => ({ x: 0, y: 0 }),
    });

    simulation.step(0);
    simulation.step(-16);
    simulation.step(Number.NaN);
    expect(simulation.snapshot().frame).toBe(0);

    simulation.run(100, 16);
    expect(simulation.snapshot().enemyCount).toBe(0);
    expect(simulateVolHell(0).frame).toBe(0);
  });

  it('render adapterı yalnızca kopyalanmış frame snapshotı görür', () => {
    const frames: ReturnType<VolHellSimulation['getRenderSnapshot']>[] = [];
    const simulation = new VolHellSimulation({ seed: 11, killRadius: null });
    const driver = new VolHellSimulationDriver(simulation, {
      render: (snapshot) => frames.push(snapshot),
    });

    for (let index = 0; index < 120; index++) driver.step(16);

    expect(frames).toHaveLength(120);
    const observed = frames.at(-1)!;
    const observedEnemy = observed.enemies[0];
    expect(observedEnemy).toBeDefined();
    if (observedEnemy) {
      const originalX = observedEnemy.x;
      (observedEnemy as { x: number }).x = originalX + 1000;
      expect(simulation.getRenderSnapshot().enemies[0]?.x).toBe(originalX);
    }

    driver.destroy();
    expect(driver.step(16)).toBeNull();
    expect(frames).toHaveLength(120);
  });
});
