import { describe, it, expect, beforeEach } from 'vitest';
import { GameStats } from '@/app/GameStats';
import { SaveManager, type IStorageAdapter } from '@volstudio/core';

class MemoryAdapter implements IStorageAdapter {
  private readonly store = new Map<string, unknown>();

  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.store.get(key) as T | undefined);
  }

  set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
}

class FailingAdapter implements IStorageAdapter {
  get<_T>(_key: string): Promise<_T | undefined> {
    return Promise.resolve(undefined);
  }

  set<_T>(): Promise<void> {
    return Promise.reject(new Error('storage full'));
  }

  remove(): Promise<void> {
    return Promise.resolve();
  }
}

function createSaveManager(): SaveManager {
  return new SaveManager(new MemoryAdapter());
}

describe('GameStats', () => {
  let stats: GameStats;

  beforeEach(() => {
    stats = new GameStats(createSaveManager());
  });

  it('ilk yüklemede default değerler döner', async () => {
    await stats.load();
    expect(stats.getBestScore()).toBe(0);
    expect(stats.getBestTimeMs()).toBe(0);
    expect(stats.getBestKills()).toBe(0);
    expect(stats.getTotalKills()).toBe(0);
  });

  it('yeni rekorları günceller ve totalKills artırır', async () => {
    await stats.load();
    const result = await stats.submitRun(1500, 120_000, 15);

    expect(result.bestScore).toBe(1500);
    expect(result.bestTimeMs).toBe(120_000);
    expect(result.bestKills).toBe(15);
    expect(result.totalKills).toBe(15);
    expect(result.isNewBestScore).toBe(true);
    expect(result.isNewBestTime).toBe(true);
    expect(result.isNewBestKills).toBe(true);
  });

  it('düşük skor rekorları bozmaz, total yine artar', async () => {
    await stats.load();
    await stats.submitRun(10_000, 300_000, 50);
    const result = await stats.submitRun(1000, 60_000, 5);

    expect(result.bestScore).toBe(10_000);
    expect(result.bestTimeMs).toBe(300_000);
    expect(result.bestKills).toBe(50);
    expect(result.totalKills).toBe(55);
    expect(result.isNewBestScore).toBe(false);
    expect(result.isNewBestTime).toBe(false);
    expect(result.isNewBestKills).toBe(false);
  });

  it('eşit skor yeni rekor sayılmaz', async () => {
    await stats.load();
    await stats.submitRun(1000, 60_000, 5);
    const result = await stats.submitRun(1000, 60_000, 5);

    expect(result.isNewBestScore).toBe(false);
    expect(result.isNewBestTime).toBe(false);
    expect(result.isNewBestKills).toBe(false);
  });

  it('negatif değerleri 0 kabul eder', async () => {
    await stats.load();
    const result = await stats.submitRun(-100, -5000, -3);

    expect(result.bestScore).toBe(0);
    expect(result.bestTimeMs).toBe(0);
    expect(result.bestKills).toBe(0);
    expect(result.totalKills).toBe(0);
    expect(result.isNewBestScore).toBe(false);
    expect(result.isNewBestTime).toBe(false);
    expect(result.isNewBestKills).toBe(false);
  });

  it('save başarısız olursa hafıza durumu değişmez ve hata fırlatır', async () => {
    const failingStats = new GameStats(new SaveManager(new FailingAdapter()));
    await failingStats.load();
    await expect(failingStats.submitRun(100, 1000, 1)).rejects.toThrow('storage full');

    expect(failingStats.getBestScore()).toBe(0);
    expect(failingStats.getTotalKills()).toBe(0);
  });

  it('ardışık submitRun çağrıları toplamı doğru birikir', async () => {
    await stats.load();
    await stats.submitRun(100, 1000, 1);
    await stats.submitRun(200, 2000, 2);
    await stats.submitRun(50, 500, 3);

    expect(stats.getBestScore()).toBe(200);
    expect(stats.getBestTimeMs()).toBe(2000);
    expect(stats.getBestKills()).toBe(3);
    expect(stats.getTotalKills()).toBe(6);
  });

  it('K5: kısmi kayıt NaN üretmez, eksik alanlar varsayılana düşer', async () => {
    const adapter = new MemoryAdapter();
    await adapter.set('vol-hell:game-stats', { bestScore: 5 });
    const partial = new GameStats(new SaveManager(adapter));
    await partial.load();

    expect(partial.getBestScore()).toBe(5);
    expect(partial.getTotalKills()).toBe(0);

    const result = await partial.submitRun(10, 20, 3);
    expect(Number.isNaN(result.totalKills)).toBe(false);
    expect(result.totalKills).toBe(3);
  });

  it('K5: geçersiz tipler ve NaN reddedilir', async () => {
    const adapter = new MemoryAdapter();
    await adapter.set('vol-hell:game-stats', {
      bestScore: 'çok',
      bestTimeMs: Number.NaN,
      bestKills: -5,
      totalKills: null,
    });
    const corrupt = new GameStats(new SaveManager(adapter));
    await corrupt.load();

    expect(corrupt.getBestScore()).toBe(0);
    expect(corrupt.getBestTimeMs()).toBe(0);
    expect(corrupt.getBestKills()).toBe(0);
    expect(corrupt.getTotalKills()).toBe(0);
  });
});
