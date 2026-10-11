import { UI_TIMING } from '../../constants';
import type { Random } from '@volstudio/core/random';

/**
 * Varyant, metnin GÖRSEL tonunu seçer — oyun anlamını değil.
 *
 * Adlar bilinçli olarak dövüş terimleri (hasar/iyileşme/kritik vuruş) DEĞİL:
 * bunlar tek bir türün kelimeleridir ve CORE'u o türe bağlar (bir üretim
 * oyununda "iyileşme" yoktur). Eşleme çağıranın işidir.
 *
 * - `default` — nötr metin rengi.
 * - `negative` — tehlike rengi (kayıp, hasar, ceza).
 * - `positive` — başarı rengi (kazanç, iyileşme, ödül).
 * - `emphasis` — uyarı rengi + büyük punto + yaylanan giriş; nadir/önemli olay.
 */
export type FloatingTextVariant = 'default' | 'negative' | 'positive' | 'emphasis';

export interface FloatingTextOptions {
  variant?: FloatingTextVariant;
  /** Toplam yaşam süresi (ms) — bu sürenin sonunda fade-out başlar. */
  durationMs?: number;
  /** Yukarı kayma mesafesi (px). */
  riseDistance?: number;
  /** Üst üste binmeyi önlemek için rastgele yatay ofset (px, ±). Varsayılan 18; `emphasis` varsayılan olarak jitter almaz. */
  jitter?: number;
}

/** Aynı anda ekranda duran yüzen metin sayısının varsayılan üst sınırı (`maxActive`). */
export const FLOATING_TEXT_MAX_ACTIVE = 24;

export interface FloatingTextManagerOptions {
  /** 'fixed' (varsayılan): viewport'a göre konumlanır. 'absolute': verilen `parent`'a göre (parent'ın position:relative/absolute olması gerekir). */
  anchor?: 'fixed' | 'absolute';
  /** Belirtilirse jitter için deterministik PRNG kullanılır; yoksa `Math.random()`. */
  random?: Random;
  /**
   * Aynı anda ekranda en çok bu kadar metin durur (varsayılan `FLOATING_TEXT_MAX_ACTIVE`). Kalabalık bir çatışma
   * saniyede onlarca sayı üretir; sınır aşılınca EN ESKİ metin hemen toplanır, yeni olan her zaman görünür. Toplanan
   * elemanlar havuza döner ve yeniden kullanılır: kare başına DOM üretimi/çöpü olmaz.
   */
  maxActive?: number;
}

interface ActiveText {
  element: HTMLDivElement;
  timeoutIds: number[];
  rafId: number;
}

/** Havuzda bekleyen boş eleman sayısı üst sınırı: sınırsız büyüyen bir havuz bellek sızıntısıdır. */
const POOL_LIMIT = 16;

/** Verilen x/y konumunda beliren, yukarı kayarak solan geçici metin (kayıp/kazanç/vurgu sayıları). Toast'tan farkı sabit köşede değil, verilen noktada belirmesi. */
export class FloatingTextManager {
  private readonly container: HTMLDivElement;
  private readonly active: ActiveText[] = [];
  private readonly pool: HTMLDivElement[] = [];
  private readonly random?: Random;
  private readonly maxActive: number;

  constructor(parent: HTMLElement, options: FloatingTextManagerOptions = {}) {
    const { anchor = 'fixed', random, maxActive = FLOATING_TEXT_MAX_ACTIVE } = options;
    this.random = random;
    this.maxActive = Math.max(1, Math.floor(Number.isFinite(maxActive) ? maxActive : 1));
    this.container = document.createElement('div');
    this.container.className = `vol-floating-text-container vol-floating-text-container--${anchor}`;
    // Yüzen sayı görsel bir yankıdır: aynı olay (hasar, kazanç) durum bölgelerinde zaten duyurulur. Okuyucu ağacına
    // girerse geçici metinler gezinmeyi bölerdi.
    this.container.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.container);
  }

  spawn(x: number, y: number, text: string, options: FloatingTextOptions = {}): void {
    // Geçersiz konum ("NaN px") görünmez bir metin bırakırdı; hiç üretilmez.
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const { variant = 'default', durationMs = 900, riseDistance = 40 } = options;
    const jitter = options.jitter ?? (variant === 'emphasis' ? 0 : 18);
    const randomUnit = this.random ? this.random.bipolar() : Math.random() * 2 - 1;
    const offsetX = jitter > 0 ? randomUnit * jitter : 0;

    while (this.active.length >= this.maxActive) this.recycle(this.active[0]);

    const el = this.pool.pop() ?? document.createElement('div');
    el.className = `vol-floating-text vol-floating-text--${variant}`;
    el.style.left = `${x + offsetX}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--vol-floating-text-rise', `-${riseDistance}px`);
    el.textContent = text;

    this.container.appendChild(el);

    const entry: ActiveText = { element: el, timeoutIds: [], rafId: 0 };
    this.active.push(entry);

    entry.rafId = requestAnimationFrame(() => {
      entry.rafId = requestAnimationFrame(() => el.classList.add('vol-floating-text--visible'));
    });

    const fadeTimeoutId = window.setTimeout(() => {
      el.classList.add('vol-floating-text--fading');
      const removeTimeoutId = window.setTimeout(
        () => this.recycle(entry),
        UI_TIMING.FLOATING_TEXT_FADE_OUT_MS,
      );
      entry.timeoutIds.push(removeTimeoutId);
    }, durationMs);
    entry.timeoutIds.push(fadeTimeoutId);
  }

  /** Ekrandaki metin sayısı (test ve teşhis için). */
  get activeCount(): number {
    return this.active.length;
  }

  destroy(): void {
    for (const entry of this.active) {
      cancelAnimationFrame(entry.rafId);
      for (const id of entry.timeoutIds) {
        window.clearTimeout(id);
      }
    }
    this.active.length = 0;
    this.pool.length = 0;
    this.container.remove();
  }

  /** Metni ekrandan toplar: zamanlayıcılar iptal edilir, eleman temizlenip havuza döner. */
  private recycle(entry: ActiveText): void {
    const index = this.active.indexOf(entry);
    if (index === -1) return;
    this.active.splice(index, 1);
    cancelAnimationFrame(entry.rafId);
    for (const id of entry.timeoutIds) window.clearTimeout(id);
    const { element } = entry;
    element.remove();
    element.className = '';
    element.textContent = '';
    element.removeAttribute('style');
    if (this.pool.length < POOL_LIMIT) this.pool.push(element);
  }
}
