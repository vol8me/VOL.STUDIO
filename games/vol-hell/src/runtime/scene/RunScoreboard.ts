import { gameStats } from '@/app/services';
import type { RunResult } from '@/app/GameStats';
import { MAX_RUNTIME_VALUE, safeDeltaMs, saturatingAdd } from '@/runtime/utils/numeric';

/**
 * Koşu sayaçları ve koşu sonu istatistik gönderimi — `GameScene`'den ayrıldı.
 *
 * Sahne bu sayaçları düz alan olarak taşıyordu; hem uç değer korumaları
 * (NaN/Infinity) hem de depolama hatasında özet ekranının yine de açılmasını
 * sağlayan geri düşme yolu test edilemiyordu.
 */

/** İstatistik deposu sözleşmesi — testte sahte depo verilebilsin diye ayrı. */
export interface RunStatsStore {
  submitRun(score: number, timeMs: number, kills: number): Promise<RunResult>;
  getBestScore(): number;
  getBestTimeMs(): number;
  getBestKills(): number;
  getTotalKills(): number;
}

export class RunScoreboard {
  private score = 0;
  private kills = 0;
  private elapsedMs = 0;

  constructor(private readonly stats: RunStatsStore = gameStats) {}

  /** Yeni koşu — Phaser sahne örneğini yeniden kullandığı için şart. */
  reset(): void {
    this.score = 0;
    this.kills = 0;
    this.elapsedMs = 0;
  }

  getScore(): number {
    return this.score;
  }

  getKills(): number {
    return this.kills;
  }

  getElapsedMs(): number {
    return this.elapsedMs;
  }

  /**
   * Bir düşman öldü. Puan yuvarlanır; sonlu olmayan ya da negatif puan
   * sayaca yazılmaz — bozuk bir katalog değeri skoru NaN'a çevirmemeli.
   */
  addKill(scoreValue: number): void {
    this.kills = Math.min(MAX_RUNTIME_VALUE, this.kills + 1);
    if (!Number.isFinite(scoreValue) || scoreValue <= 0) return;
    this.score = saturatingAdd(this.score, Math.round(scoreValue));
  }

  /** Frame süresi ekler. Sonlu olmayan ya da negatif delta yok sayılır. */
  advance(deltaMs: number): void {
    this.elapsedMs = saturatingAdd(this.elapsedMs, safeDeltaMs(deltaMs));
  }

  /**
   * Koşuyu gönderir. Depolama başarısız olsa bile oyun donmaz: eldeki
   * rekorlarla bir sonuç üretilir ve özet ekranı yine açılır.
   */
  async submitSafely(): Promise<RunResult> {
    try {
      return await this.stats.submitRun(this.score, this.elapsedMs, this.kills);
    } catch {
      return {
        bestScore: this.stats.getBestScore(),
        bestTimeMs: this.stats.getBestTimeMs(),
        bestKills: this.stats.getBestKills(),
        totalKills: this.stats.getTotalKills(),
        isNewBestScore: false,
        isNewBestTime: false,
        isNewBestKills: false,
      };
    }
  }
}
