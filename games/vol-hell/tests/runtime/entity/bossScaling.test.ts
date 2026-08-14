import { describe, it, expect } from 'vitest';
import { StatBlock } from '@volstudio/core';
import { bossConfig } from '@/config/boss';
import { computeBossScaling, scaleBossStats } from '@/runtime/entity/bossScaling';

function makePlayerStats(
  overrides: Partial<{ damage: number; fireRate: number; health: number; speed: number }> = {},
) {
  const base = { damage: 22, fireRate: 260, health: 100, speed: 220 };
  const stats = new StatBlock(base);
  // Kart etkisini simüle etmek için base üzerine multiply modifier ekle.
  if (overrides.damage) {
    stats.addModifier({
      id: 'card-damage',
      stat: 'damage',
      type: 'multiply',
      value: overrides.damage / base.damage,
    });
  }
  if (overrides.fireRate) {
    // fireRate ters stat: daha düşük değer = daha hızlı ateş.
    stats.addModifier({
      id: 'card-firerate',
      stat: 'fireRate',
      type: 'multiply',
      value: overrides.fireRate / base.fireRate,
    });
  }
  if (overrides.health) {
    stats.addModifier({
      id: 'card-health',
      stat: 'health',
      type: 'multiply',
      value: overrides.health / base.health,
    });
  }
  if (overrides.speed) {
    stats.addModifier({
      id: 'card-speed',
      stat: 'speed',
      type: 'multiply',
      value: overrides.speed / base.speed,
    });
  }
  return stats;
}

describe('computeBossScaling', () => {
  it('base oyuncu karşısında çarpanlar 1 civarında kalır', () => {
    const stats = makePlayerStats();
    const scaling = computeBossScaling(stats);

    expect(scaling.healthMultiplier).toBeCloseTo(1, 6);
    expect(scaling.damageMultiplier).toBeCloseTo(1, 6);
    expect(scaling.fireRateMultiplier).toBeCloseTo(1, 6);
  });

  it('güçlü hasar/firerate buildi can çarpanını artırır', () => {
    // Hasar 1,5x, ateş hızı 2x -> DPS 3x.
    const stats = makePlayerStats({ damage: 33, fireRate: 130 });
    const scaling = computeBossScaling(stats);

    expect(scaling.playerPowerRatio).toBeCloseTo(3, 6);
    expect(scaling.healthMultiplier).toBeGreaterThan(1);
    expect(scaling.healthMultiplier).toBeLessThanOrEqual(bossConfig.scaling.maxHealthMultiplier);
  });

  it('çok yüksek canlı oyuncu karşısında hasar çarpanı sınırda kalır', () => {
    const stats = makePlayerStats({ health: 400 });
    const scaling = computeBossScaling(stats);

    expect(scaling.damageMultiplier).toBeLessThanOrEqual(bossConfig.scaling.maxDamageMultiplier);
    expect(scaling.damageMultiplier).toBeGreaterThan(1);
  });

  it('hızlı oyuncu ateş hızı çarpanını artırır', () => {
    const stats = makePlayerStats({ speed: 400 });
    const scaling = computeBossScaling(stats);

    expect(scaling.fireRateMultiplier).toBeGreaterThan(1);
    expect(scaling.fireRateMultiplier).toBeLessThanOrEqual(
      bossConfig.scaling.maxFireRateMultiplier,
    );
  });

  it('ters statlar sıfır/negatifse çökmez', () => {
    const stats = new StatBlock({ damage: 0, fireRate: 0, health: -10, speed: 0 });
    const scaling = computeBossScaling(stats);

    expect(scaling.healthMultiplier).toBe(1);
    expect(scaling.damageMultiplier).toBe(1);
    expect(scaling.fireRateMultiplier).toBe(1);
    expect(scaling.playerPowerRatio).toBe(1);
  });
});

describe('scaleBossStats', () => {
  it('ölçekleme uygulanan statlar sabit kalır — dondurulmuş stat bloğu', () => {
    const playerStats = makePlayerStats({ damage: 44, fireRate: 130, health: 150 });
    const scaling = computeBossScaling(playerStats);
    const base = { damage: 26, speed: 74, health: 2200, fireRate: 1000 };
    const bossStats = scaleBossStats(base, scaling);

    // İlk okuma sabit.
    const firstDamage = bossStats.getValue('damage');
    const firstHealth = bossStats.getValue('health');

    // Sonradan oyuncu daha da güçlense bile boss stat'ları değişmez.
    playerStats.addModifier({ id: 'late-card', stat: 'damage', type: 'multiply', value: 2 });
    playerStats.addModifier({ id: 'late-health', stat: 'health', type: 'multiply', value: 2 });

    expect(bossStats.getValue('damage')).toBe(firstDamage);
    expect(bossStats.getValue('health')).toBe(firstHealth);
  });

  it('fireRate çarpanı ters stat olarak uygulanır — büyük çarpan daha kısa bekleme', () => {
    const base = { damage: 26, speed: 74, health: 2200, fireRate: 1000 };
    const fastScaling = computeBossScaling(makePlayerStats({ speed: 400 }));
    const slowScaling = computeBossScaling(makePlayerStats({ speed: 220 }));

    const fastBoss = scaleBossStats(base, fastScaling);
    const slowBoss = scaleBossStats(base, slowScaling);

    expect(fastBoss.getValue('fireRate')).toBeLessThan(slowBoss.getValue('fireRate'));
  });
});
