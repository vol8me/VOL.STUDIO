import type { SaveManager } from '@volstudio/core';

export interface GameStatsData {
  bestScore: number;
  bestTimeMs: number;
  bestKills: number;
  totalKills: number;
}

const STORAGE_KEY = 'vol-hell:game-stats';

const DEFAULTS: GameStatsData = {
  bestScore: 0,
  bestTimeMs: 0,
  bestKills: 0,
  totalKills: 0,
};

export interface RunResult extends GameStatsData {
  /** Bu koşu yeni bir skor rekoru mu? */
  readonly isNewBestScore: boolean;
  /** Bu koşu yeni bir zaman rekoru mu? */
  readonly isNewBestTime: boolean;
  /** Bu koşu yeni bir öldürme rekoru mu? */
  readonly isNewBestKills: boolean;
}

/**
 * Oyun istatistiklerini persist eder.
 * Yüksek skor, en uzun süre, en çok öldürme ve toplam öldürme kaydedilir.
 */
export class GameStats {
  private data: GameStatsData = { ...DEFAULTS };

  constructor(private readonly saveManager: SaveManager) {}

  async load(): Promise<void> {
    this.data = { ...(await this.saveManager.load(STORAGE_KEY, DEFAULTS)) };
  }

  getBestScore(): number {
    return this.data.bestScore;
  }

  getBestTimeMs(): number {
    return this.data.bestTimeMs;
  }

  getBestKills(): number {
    return this.data.bestKills;
  }

  getTotalKills(): number {
    return this.data.totalKills;
  }

  /**
   * Bir koşuyu kaydeder; rekor varsa günceller ve `totalKills` artırır.
   * Hafıza durumu, depolama başarılı olduktan sonra güncellenir.
   * Negatif değerler 0 ile sınırlandırılır.
   * @returns Güncel rekorlar ve rekor kırılıp kırılmadığı bilgisi.
   */
  async submitRun(score: number, timeMs: number, kills: number): Promise<RunResult> {
    const safeScore = Number.isFinite(score) && score > 0 ? score : 0;
    const safeTimeMs = Number.isFinite(timeMs) && timeMs > 0 ? timeMs : 0;
    const safeKills = Number.isFinite(kills) && kills > 0 ? kills : 0;

    const nextData: GameStatsData = { ...this.data };
    nextData.totalKills += safeKills;

    const isNewBestScore = safeScore > nextData.bestScore;
    if (isNewBestScore) nextData.bestScore = safeScore;

    const isNewBestTime = safeTimeMs > nextData.bestTimeMs;
    if (isNewBestTime) nextData.bestTimeMs = safeTimeMs;

    const isNewBestKills = safeKills > nextData.bestKills;
    if (isNewBestKills) nextData.bestKills = safeKills;

    await this.saveManager.save(STORAGE_KEY, nextData);
    this.data = nextData;

    return {
      ...this.data,
      isNewBestScore,
      isNewBestTime,
      isNewBestKills,
    };
  }

  /** Test amaçlı — depolanan istatistikleri sıfırlar. */
  reset(): void {
    this.data = { ...DEFAULTS };
  }
}
