import { describe, it, expect } from 'vitest';
import { getDifficultyState } from '@/runtime/systems/DifficultyCalculator';
import { enemyConfig } from '@/config/enemy';

const MS_PER_MIN = 60 * 1000;

describe('getDifficultyState', () => {
  it('başlangıçta temel değerlere eşit', () => {
    const state = getDifficultyState(0);
    expect(state.enemyHealth).toBe(enemyConfig.health);
    expect(state.enemySpeed).toBe(enemyConfig.speed);
    expect(state.spawnIntervalMs).toBe(enemyConfig.spawnIntervalMs);
    expect(state.maxEnemies).toBe(enemyConfig.maxCount);
    expect(state.scoreMultiplier).toBe(1);
  });

  it('negatif süre 0 kabul edilir', () => {
    const state = getDifficultyState(-5000);
    expect(state.spawnIntervalMs).toBe(enemyConfig.spawnIntervalMs);
  });

  it('zamanla can ve hız artar', () => {
    const state = getDifficultyState(5 * MS_PER_MIN);
    expect(state.enemyHealth).toBeGreaterThan(enemyConfig.health);
    expect(state.enemySpeed).toBeGreaterThan(enemyConfig.speed);
  });

  it('ilk ramp süresince yarı hızda büyür', () => {
    const oneMinute = getDifficultyState(1 * MS_PER_MIN);
    const twoMinute = getDifficultyState(2 * MS_PER_MIN);

    // 1. dakika (ramped) büyümesi, 2. dakika (ramped + beyond) büyümesinden yavaş olmalı
    const firstMinuteHealthGrowth = oneMinute.enemyHealth - enemyConfig.health;
    const secondMinuteHealthGrowth = twoMinute.enemyHealth - oneMinute.enemyHealth;
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
    expect(state.enemyHealth).toBeLessThan(enemyConfig.health * 3);
    expect(state.enemySpeed).toBeLessThan(enemyConfig.speed * 2.5);
  });
});
