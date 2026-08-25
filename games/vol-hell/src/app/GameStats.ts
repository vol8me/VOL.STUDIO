import type { SaveManager } from '@volstudio/core';
import { MAX_RUNTIME_VALUE, saturatingAdd } from '@/runtime/utils/numeric';

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

/** Sonlu, negatif olmayan ve güvenli tamsayıysa kendisi, değilse yedek. */
function safeCount(value: unknown, fallback: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  const normalized = Math.min(MAX_RUNTIME_VALUE, value);
  return integer ? Math.floor(normalized) : normalized;
}

/**
 * Depodan gelen veriye asla güvenilmez: elle düzenlenmiş, eski formatta veya
 * kısmi bir kayıt alanları `undefined` bırakır ve `totalKills += kills` NaN
 * üretir — bu NaN sonra kalıcı olarak diske yazılır.
 */
function sanitize(stored: unknown): GameStatsData {
  if (typeof stored !== 'object' || stored === null) return { ...DEFAULTS };

  const raw = stored as Partial<Record<keyof GameStatsData, unknown>>;
  return {
    bestScore: safeCount(raw.bestScore, DEFAULTS.bestScore),
    bestTimeMs: safeCount(raw.bestTimeMs, DEFAULTS.bestTimeMs),
    bestKills: safeCount(raw.bestKills, DEFAULTS.bestKills, true),
    totalKills: safeCount(raw.totalKills, DEFAULTS.totalKills, true),
  };
}

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
    this.data = sanitize(await this.saveManager.load<unknown>(STORAGE_KEY, DEFAULTS));
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
    const safeScore = Number.isFinite(score) && score > 0 ? Math.min(MAX_RUNTIME_VALUE, score) : 0;
    const safeTimeMs =
      Number.isFinite(timeMs) && timeMs > 0 ? Math.min(MAX_RUNTIME_VALUE, timeMs) : 0;
    const safeKills =
      Number.isFinite(kills) && kills > 0 ? Math.min(MAX_RUNTIME_VALUE, Math.floor(kills)) : 0;

    const nextData: GameStatsData = { ...this.data };
    nextData.totalKills = saturatingAdd(nextData.totalKills, safeKills);

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
