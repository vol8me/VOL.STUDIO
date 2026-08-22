import {
  FieldBufferPool,
  renderSprite,
  type RenderResult,
  type SpriteDoc,
} from '@volstudio/core/visual';

export interface PreviewFrame {
  readonly result: RenderResult | null;
  /** Render başarısızsa doğrulama/çalışma hatası. */
  readonly error: string | null;
  /** Bu kare ÇIKTI çözünürlüğünde mi üretildi? */
  readonly full: boolean;
  readonly elapsedMs: number;
  /**
   * Belgenin GERÇEK çıktı boyu.
   *
   * `result.doc` ezmeler UYGULANDIKTAN SONRAKİ belgedir, yani önizleme
   * boyunu taşır. Ondan okumak "önizleme 128² / çıktı 128²" gibi anlamsız
   * bir gösterge üretir ve §8.8'in tüm amacı kaybolur.
   */
  readonly outputSize: readonly [number, number];
}

export type PreviewListener = (frame: PreviewFrame) => void;

export interface PreviewRendererOptions {
  /** Sürükleme sırasında kare başına hedef süre. */
  budgetMs?: number;
  /** Bu kadar süre değişiklik gelmezse tam çözünürlükte bir kare üretilir. */
  idleMs?: number;
  /** Önizlemenin başlangıç kenar sınırı. */
  initialCap?: number;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => number;
  cancel?: (handle: number) => void;
}

/** Doğrulayıcının kabul ettiği en küçük kenar. */
const MIN_EDGE = 8;
const DEFAULT_BUDGET_MS = 24;
const DEFAULT_IDLE_MS = 300;
const DEFAULT_CAP = 256;

/**
 * Canlı önizleme — §8.8.
 *
 * Üç kural birlikte "kaydırıcı çekerken anında" hissini verir:
 *
 * 1. **Aynı giriş noktası.** `renderSprite(doc, { size })` çağrılır; D2'nin
 *    `--size` ezmesi tam olarak bunun için var. İkinci bir çizim yolu yok,
 *    dolayısıyla editör ile CLI'ın ayrışma ihtimali de yok.
 * 2. **Bütçeyle kendini ayarlayan çözünürlük.** Her render ölçülür; bütçe
 *    aşılırsa kenar sınırı yarıya iner, bütçenin belirgin altında kalırsa
 *    çıktı boyuna doğru geri tırmanır. Belgenin ağırlığına göre kendini
 *    ayarlar, elle ayar istemez.
 * 3. **Kuyruk YOK.** Render sürerken gelen değişiklikler birikmez; en yeni
 *    belge kazanır, aradaki durumlar düşürülür. Aksi hâlde sürükleme
 *    bittikten sonra saniyelerce geriden gelen kareler izlenirdi.
 *
 * Boşta kalındığında bir kez TAM çözünürlükte render edilir: çekerken hızlı,
 * bıraktığında birebir.
 */
export class PreviewRenderer {
  private readonly listeners = new Set<PreviewListener>();
  private readonly pool = new FieldBufferPool();
  private readonly budgetMs: number;
  private readonly idleMs: number;
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => number;
  private readonly cancel: (handle: number) => void;

  private cap: number;
  private pending: SpriteDoc | null = null;
  private flushHandle: number | null = null;
  private idleHandle: number | null = null;
  private lastPoolSize = '';

  constructor(options: PreviewRendererOptions = {}) {
    this.budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
    this.cap = options.initialCap ?? DEFAULT_CAP;
    this.now = options.now ?? (() => performance.now());
    this.schedule =
      options.schedule ?? ((callback, delay) => setTimeout(callback, delay) as unknown as number);
    this.cancel = options.cancel ?? ((handle) => clearTimeout(handle));
  }

  /** Geçerli önizleme kenar sınırı — arayüzde gösterilir (§8.8). */
  get currentCap(): number {
    return this.cap;
  }

  subscribe(listener: PreviewListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Yeni belge; en yeni istek kazanır. */
  request(doc: SpriteDoc): void {
    this.pending = doc;
    this.armIdle(doc);
    if (this.flushHandle !== null) return;
    this.flushHandle = this.schedule(() => this.flush(), 0);
  }

  dispose(): void {
    if (this.flushHandle !== null) this.cancel(this.flushHandle);
    if (this.idleHandle !== null) this.cancel(this.idleHandle);
    this.flushHandle = null;
    this.idleHandle = null;
    this.listeners.clear();
    this.pool.clear();
  }

  /** Önizleme boyutu — en uzun kenar `cap`i aşmaz, çıktıyı da aşmaz. */
  previewSize(doc: SpriteDoc): [number, number] {
    const [width, height] = doc.size;
    const longest = Math.max(width, height);
    if (longest <= this.cap) return [width, height];
    const scale = this.cap / longest;
    return [
      Math.max(MIN_EDGE, Math.round(width * scale)),
      Math.max(MIN_EDGE, Math.round(height * scale)),
    ];
  }

  private flush(): void {
    this.flushHandle = null;
    const doc = this.pending;
    this.pending = null;
    if (!doc) return;

    const size = this.previewSize(doc);
    const full = size[0] === doc.size[0] && size[1] === doc.size[1];
    this.render(doc, size, full, true);

    if (this.pending !== null && this.flushHandle === null) {
      this.flushHandle = this.schedule(() => this.flush(), 0);
    }
  }

  private armIdle(doc: SpriteDoc): void {
    if (this.idleHandle !== null) this.cancel(this.idleHandle);
    this.idleHandle = this.schedule(() => {
      this.idleHandle = null;
      const size: [number, number] = [doc.size[0], doc.size[1]];
      // Boştaki kare bütçeyi AYARLAMAZ: tam çözünürlük zaten yavaş olabilir
      // ve onu ölçüye katmak sınırı gereksiz yere dibe çekerdi.
      this.render(doc, size, true, false);
    }, this.idleMs);
  }

  private render(doc: SpriteDoc, size: [number, number], full: boolean, tune: boolean): void {
    const key = `${size[0]}x${size[1]}`;
    // Boyut değişince havuzdaki eski tamponlar bir daha kullanılmaz; sınır
    // düşüp yükseldikçe biriken ölü boyutları temizle (D7).
    if (key !== this.lastPoolSize) {
      this.pool.clear();
      this.lastPoolSize = key;
    }

    const outputSize: readonly [number, number] = [doc.size[0], doc.size[1]];
    const started = this.now();
    let frame: PreviewFrame;
    try {
      const result = renderSprite(doc, { size, pool: this.pool });
      frame = { result, error: null, full, elapsedMs: this.now() - started, outputSize };
    } catch (error) {
      frame = {
        result: null,
        error: error instanceof Error ? error.message : String(error),
        full,
        elapsedMs: this.now() - started,
        outputSize,
      };
    }

    if (tune && frame.error === null) this.tune(frame.elapsedMs, doc);
    for (const listener of this.listeners) listener(frame);
  }

  private tune(elapsedMs: number, doc: SpriteDoc): void {
    const longest = Math.max(doc.size[0], doc.size[1]);
    if (elapsedMs > this.budgetMs) {
      this.cap = Math.max(MIN_EDGE, Math.floor(this.cap / 2));
      return;
    }
    // Yarı bütçenin altında kalıyorsa yükselmek güvenli; tam bütçeye kadar
    // beklemek sınırı gereksizce düşük tutardı.
    if (elapsedMs * 2 < this.budgetMs && this.cap < longest) {
      this.cap = Math.min(longest, this.cap * 2);
    }
  }
}
