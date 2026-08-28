import type { RunOutcome } from './DeathScreen';
import type { RunResult } from '@/app/GameStats';

export interface ScenePresenceQuery {
  isActive(key: string): boolean;
  isPaused(key: string): boolean;
}

/**
 * Sahne çalışıyor ya da duraklatılmışsa hâlâ mevcut kabul edilir.
 *
 * `RunFinisher` sahneyi özet açmadan önce kendisi duraklatır; yalnız
 * `isActive()` kullanmak kendi yaptığı duraklatmayı sahne kapanışı sanır.
 */
export function isScenePresent(scene: ScenePresenceQuery, key: string): boolean {
  return scene.isActive(key) || scene.isPaused(key);
}

/**
 * Koşu sonu akışı — zafer ve yenilgi için ORTAK yol.
 *
 * `GameScene` içinde düz bir metotken buradaki iki incelik test edilemiyordu:
 *
 * 1. **Çift bitiş koruması.** Boss'un son vuruşu oyuncuyu aynı frame'de
 *    öldürebilir; zafer ve yenilgi birlikte tetiklenir. Yalnızca ilki geçmeli.
 * 2. **`await` sonrası sahne kontrolü.** İstatistik gönderimi beklenirken
 *    oyuncu restart'a basıp başka sahneye geçebilir; dönen sonucu ölü bir
 *    sahnenin DOM'una yazmak çökme üretir.
 *
 * Etkiler enjekte edilir; burada yalnızca sıra ve korumalar yaşar.
 */
export interface RunFinisherDeps {
  /** Sahne hâlâ aktif mi? Her `await` sonrası yeniden sorulur. */
  isSceneActive(): boolean;
  /** Özet ekranı zaten görünür mü? */
  isSummaryVisible(): boolean;
  /** Oyunu koşu sonu için duraklatır. */
  forcePause(): void;
  /** Sonuca göre biten koşunun sesini çalar. */
  playOutcomeAudio(outcome: RunOutcome): void;
  /** İstatistikleri gönderir; kendi içinde hata yutar. */
  submitStats(): Promise<RunResult>;
  /** Özet ekranını açar. */
  showSummary(outcome: RunOutcome, result: RunResult): void;
  /** Beklenmedik hatada ana menüye döner. */
  goToMainMenu(): void;
}

export class RunFinisher {
  private inProgress = false;
  private finished = false;
  /** Restart, bekleyen eski submit sonucunu yeni koşudan ayırır. */
  private generation = 0;

  constructor(private readonly deps: RunFinisherDeps) {}

  /** Sahne yeniden başlarken çağrılır. */
  reset(): void {
    this.generation++;
    this.inProgress = false;
    this.finished = false;
  }

  /** Koşu bu sahnede zaten bitti mi? */
  get isFinished(): boolean {
    return this.finished;
  }

  /**
   * Bitiş akışı şu an sürüyor mu? Koşu sonu müziği devreye girdiği için
   * dinamik ses katmanı bu sırada güncellenmemeli.
   */
  get isFinishing(): boolean {
    return this.inProgress;
  }

  async finish(outcome: RunOutcome): Promise<void> {
    if (this.inProgress || this.finished || this.deps.isSummaryVisible()) return;
    if (!this.deps.isSceneActive()) return;

    this.inProgress = true;
    this.finished = true;
    const generation = this.generation;

    try {
      if (this.deps.isSceneActive()) {
        this.deps.forcePause();
      }
      this.deps.playOutcomeAudio(outcome);

      const result = await this.deps.submitStats();
      // Phaser aynı GameScene örneğini restart'ta yeniden kullanır. Yalnız
      // sahne aktifliğine bakmak yetmez: eski koşunun IPC sonucu yeni koşu
      // aktifken dönebilir ve onun üstüne ölüm ekranı açabilir.
      if (generation === this.generation && this.deps.isSceneActive()) {
        this.deps.showSummary(outcome, result);
      }
    } catch (error) {
      // Beklenmedik bir hata (depolama/çeviri/DOM) özet ekranını bozarsa oyun
      // donmaz; ana menüye yönlendirilir ve hata loglanır.
      console.error('[RunFinisher] Koşu sonu işlemi başarısız:', error);
      if (generation === this.generation && this.deps.isSceneActive()) {
        this.deps.goToMainMenu();
      }
    } finally {
      // Eski isteğin finally'si yeni koşudaki bitiş akışının kilidini açmasın.
      if (generation === this.generation) this.inProgress = false;
    }
  }
}
