/**
 * Duraklatma durum makinesi — `GameScene`'den ayrıldı.
 *
 * Duraklatmanın üç ayrı tetikleyicisi var (ESC menüsü, kart ekranı, koşu sonu)
 * ve bunların birbirini ezmemesi gereken kuralları var: ölüm ekranı açıkken
 * hiçbir şey oyunu devam ettiremez, kart ekranı açıkken ESC menüyü açmaz.
 * Sahnenin içinde dağınık `if` bloklarıyla dururken bu kurallar test
 * edilemiyordu; burada saf mantık olarak durup enjekte edilen etkileri çağırır.
 */
export interface PauseControllerDeps {
  /** Phaser sahnesini duraklatır. */
  pauseScene(): void;
  /** Phaser sahnesini devam ettirir. */
  resumeScene(): void;
  /** Aktif pointer'ı sıfırlar — buton tıklaması son frame'de ateş tetiklemesin. */
  resetPointer(): void;
  /** Ölüm/özet ekranı görünür mü? Görünürse hiçbir yol oyunu devam ettirmez. */
  isDeathScreenVisible(): boolean;
  /** Kart ekranı açık mı? Açıkken ESC duraklatma menüsünü açmaz. */
  isCardScreenOpen(): boolean;
  /** ESC menüsüyle duraklandı — ses ve duraklatma ekranı buraya bağlanır. */
  onMenuPause(): void;
  /** ESC menüsünden çıkıldı — ses ve ekran gizleme buraya bağlanır. */
  onMenuResume(): void;
  /** Her devam edişte çağrılır (diagnostics zaman damgası). */
  onResume(): void;
}

export class PauseController {
  private paused = false;

  constructor(private readonly deps: PauseControllerDeps) {}

  /** Oyun şu an duraklatılmış mı? */
  get isPaused(): boolean {
    return this.paused;
  }

  /** Sahne yeniden başlarken çağrılır; Phaser sahne örneğini yeniden kullanır. */
  reset(): void {
    this.paused = false;
  }

  /** Kart ekranı açıldı — oyun durur ama duraklatma menüsü AÇILMAZ. */
  pauseForScreen(): void {
    if (this.paused) return;
    this.paused = true;
    this.deps.resetPointer();
    this.deps.pauseScene();
  }

  /** Kart ekranı kapandı — ölüm ekranı araya girmediyse oyun devam eder. */
  resumeAfterScreen(): void {
    if (!this.paused) return;
    // Ölüm ekranı açıldıysa kart ekranı kapanışı oyunu devam ettirmemeli.
    if (this.deps.isDeathScreenVisible()) return;
    this.paused = false;
    this.deps.onResume();
    this.deps.resumeScene();
  }

  /** ESC — ölüm veya kart ekranı aktifken hiçbir şey yapmaz. */
  toggle(): void {
    if (this.deps.isDeathScreenVisible() || this.deps.isCardScreenOpen()) return;
    if (this.paused) {
      this.resumeFromMenu();
    } else {
      this.pauseForMenu();
    }
  }

  /** ESC menüsüyle duraklat. */
  pauseForMenu(): void {
    if (this.paused) return;
    this.paused = true;
    this.deps.resetPointer();
    this.deps.pauseScene();
    this.deps.onMenuPause();
  }

  /** ESC menüsünden devam et. */
  resumeFromMenu(): void {
    if (!this.paused) return;
    if (this.deps.isDeathScreenVisible()) return;
    this.paused = false;
    this.deps.onResume();
    this.deps.resumeScene();
    this.deps.onMenuResume();
  }

  /**
   * Koşu sonu duraklatması — zaten duraklamış olsa bile durumu kesinleştirir.
   * Menü sesi/ekranı çalmaz; özet ekranı zaten açılacaktır.
   */
  forcePause(): void {
    this.paused = true;
    this.deps.resetPointer();
    this.deps.pauseScene();
  }
}
