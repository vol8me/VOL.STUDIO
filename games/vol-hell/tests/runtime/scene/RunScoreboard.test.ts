import { describe, it, expect, vi } from 'vitest';
import { RunScoreboard, type RunStatsStore } from '@/runtime/scene/RunScoreboard';
import type { RunResult } from '@/app/GameStats';

const RESULT: RunResult = {
  bestScore: 500,
  bestTimeMs: 60_000,
  bestKills: 40,
  totalKills: 900,
  isNewBestScore: true,
  isNewBestTime: false,
  isNewBestKills: false,
};

function fakeStore(overrides: Partial<RunStatsStore> = {}): RunStatsStore {
  return {
    submitRun: vi.fn(() => Promise.resolve(RESULT)),
    getBestScore: () => 111,
    getBestTimeMs: () => 222,
    getBestKills: () => 333,
    getTotalKills: () => 444,
    ...overrides,
  };
}

describe('RunScoreboard — sayaçlar', () => {
  it('sıfırdan başlar', () => {
    const sb = new RunScoreboard(fakeStore());
    expect(sb.getScore()).toBe(0);
    expect(sb.getKills()).toBe(0);
    expect(sb.getElapsedMs()).toBe(0);
  });

  it('öldürme sayacı ve puanı birlikte artar', () => {
    const sb = new RunScoreboard(fakeStore());
    sb.addKill(10);
    sb.addKill(15.4);
    expect(sb.getKills()).toBe(2);
    expect(sb.getScore()).toBe(25);
  });

  it('bozuk puan değeri skoru kirletmez ama ölüm yine sayılır', () => {
    const sb = new RunScoreboard(fakeStore());
    sb.addKill(Number.NaN);
    sb.addKill(Number.POSITIVE_INFINITY);
    sb.addKill(-5);
    expect(sb.getScore()).toBe(0);
    expect(Number.isFinite(sb.getScore())).toBe(true);
    // Ödül bozuk olsa da düşman öldü; sayaç düşmemeli.
    expect(sb.getKills()).toBe(3);
  });

  it('geçen süre birikir, bozuk delta yok sayılır', () => {
    const sb = new RunScoreboard(fakeStore());
    sb.advance(16);
    sb.advance(Number.NaN);
    sb.advance(-100);
    sb.advance(Number.POSITIVE_INFINITY);
    sb.advance(4);
    expect(sb.getElapsedMs()).toBe(20);
  });

  it('reset restart için hepsini sıfırlar', () => {
    const sb = new RunScoreboard(fakeStore());
    sb.addKill(50);
    sb.advance(1000);
    sb.reset();
    expect(sb.getScore()).toBe(0);
    expect(sb.getKills()).toBe(0);
    expect(sb.getElapsedMs()).toBe(0);
  });
});

describe('RunScoreboard — istatistik gönderimi', () => {
  it('güncel sayaçlarla gönderir ve sonucu döndürür', async () => {
    const store = fakeStore();
    const sb = new RunScoreboard(store);
    sb.addKill(30);
    sb.advance(2500);

    await expect(sb.submitSafely()).resolves.toEqual(RESULT);
    expect(store.submitRun).toHaveBeenCalledWith(30, 2500, 1);
  });

  it('depolama patlarsa eldeki rekorlarla geri düşer — özet ekranı yine açılır', async () => {
    const store = fakeStore({
      submitRun: vi.fn(() => Promise.reject(new Error('storage down'))),
    });
    const sb = new RunScoreboard(store);

    const result = await sb.submitSafely();

    expect(result).toEqual({
      bestScore: 111,
      bestTimeMs: 222,
      bestKills: 333,
      totalKills: 444,
      isNewBestScore: false,
      isNewBestTime: false,
      isNewBestKills: false,
    });
  });
});
