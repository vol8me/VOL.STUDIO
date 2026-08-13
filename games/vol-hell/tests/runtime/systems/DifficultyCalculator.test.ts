import { describe, it, expect } from 'vitest';
import { getDifficultyState } from '@/runtime/systems/DifficultyCalculator';
import { enemyConfig } from '@/config/enemy';
import { playerConfig } from '@/config/player';
import { WAVE_RUN_DURATION_MS } from '@/config/wave';

const MS_PER_MIN = 60 * 1000;

describe('getDifficultyState', () => {
  it('başlangıçta hiçbir ölçekleme uygulanmaz', () => {
    const state = getDifficultyState(0);
    expect(state.healthMultiplier).toBe(1);
    expect(state.speedMultiplier).toBe(1);
    expect(state.spawnIntervalMs).toBe(enemyConfig.spawnIntervalMs);
    expect(state.maxEnemies).toBe(enemyConfig.maxCount);
    expect(state.scoreMultiplier).toBe(1);
  });

  it('negatif süre 0 kabul edilir', () => {
    const state = getDifficultyState(-5000);
    expect(state.spawnIntervalMs).toBe(enemyConfig.spawnIntervalMs);
  });

  it('zamanla can ve hız çarpanı artar', () => {
    const state = getDifficultyState(5 * MS_PER_MIN);
    expect(state.healthMultiplier).toBeGreaterThan(1);
    expect(state.speedMultiplier).toBeGreaterThan(1);
  });

  it('ilk ramp süresince yarı hızda büyür', () => {
    const oneMinute = getDifficultyState(1 * MS_PER_MIN);
    const twoMinute = getDifficultyState(2 * MS_PER_MIN);

    // 1. dakika (ramped) büyümesi, 2. dakika (ramped + beyond) büyümesinden yavaş olmalı
    const firstMinuteHealthGrowth = oneMinute.healthMultiplier - 1;
    const secondMinuteHealthGrowth = twoMinute.healthMultiplier - oneMinute.healthMultiplier;
    expect(secondMinuteHealthGrowth).toBeGreaterThan(firstMinuteHealthGrowth);
  });

  it('zamanla spawn aralığı kısalır ama asla negatif olmaz', () => {
    const state = getDifficultyState(20 * MS_PER_MIN);
    expect(state.spawnIntervalMs).toBeLessThan(enemyConfig.spawnIntervalMs);
    expect(state.spawnIntervalMs).toBeGreaterThanOrEqual(200);
  });

  it('spawn çarpanı minimum %15 altına düşmez', () => {
    const state = getDifficultyState(60 * MS_PER_MIN);
    expect(state.spawnIntervalMs).toBeGreaterThanOrEqual(enemyConfig.spawnIntervalMs * 0.15);
  });

  it('max enemy sayısı artar', () => {
    const state = getDifficultyState(5 * MS_PER_MIN);
    expect(state.maxEnemies).toBeGreaterThan(enemyConfig.maxCount);
  });

  it('scoreMultiplier zamanla artar', () => {
    const early = getDifficultyState(1 * MS_PER_MIN);
    const late = getDifficultyState(5 * MS_PER_MIN);
    expect(late.scoreMultiplier).toBeGreaterThan(early.scoreMultiplier);
  });

  it('uzun sürede dengeli büyür', () => {
    const state = getDifficultyState(10 * MS_PER_MIN);
    expect(state.healthMultiplier).toBeLessThan(3);
    expect(state.speedMultiplier).toBeLessThan(2.5);
  });

  it('bir koşu boyunca düşman hızı oyuncu hızının altında kalır', () => {
    // 20 dalga x 40 sn = 800 sn'lik koşu sonunda bile düşman oyuncuyu
    // hızda geçmemeli; yoksa kaçmak imkânsız hale gelir.
    const runEnd = getDifficultyState(WAVE_RUN_DURATION_MS);
    expect(enemyConfig.speed * runEnd.speedMultiplier).toBeLessThan(playerConfig.moveSpeed);
  });
});
