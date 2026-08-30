/**
 * Bir kalite kademesinin tüketici tarafından tanımlanan profili.
 *
 * CORE bu nesnenin İÇİNİ bilmez: partikül çarpanı mı, gölge anahtarı mı,
 * render ölçeği mi — hepsi oyunun sözlüğüdür. Buradaki tek varsayım, her
 * kademenin bir profil nesnesine karşılık geldiğidir.
 */
export type GraphicsQualityProfiles<TLevel extends string, TProfile> = Readonly<
  Record<TLevel, TProfile>
>;

export interface GraphicsQualityOptions<TLevel extends string, TProfile> {
  /** Kademe → profil eşlemesi. En az bir kademe zorunludur. */
  levels: GraphicsQualityProfiles<TLevel, TProfile>;
  /** Açılış kademesi. `levels` içinde bulunmalıdır. */
  initial: TLevel;
  /**
   * Verilirse geçerli kademe bu elementin `data-<attribute>` özniteliğine
   * yazılır ve CSS `[data-vol-graphics='low']` gibi seçicilerle pahalı
   * efektleri kapatabilir. Verilmezse DOM'a hiç dokunulmaz.
   */
  reflect?: {
    element: HTMLElement;
    attribute: string;
  };
}

export type GraphicsQualityListener<TLevel extends string, TProfile> = (
  level: TLevel,
  profile: TProfile,
) => void;

/**
 * Grafik kalite kademelerinin jenerik kaydı.
 *
 * **Neden CORE'da:** "kademe listesi + geçerli kademe + değişim bildirimi +
 * canlı profil okuma" mekanizması hiçbir oyun bilgisi taşımaz; her oyun aynı
 * iskeleti yeniden yazardı. **Neden jenerik:** kademelerin ADI (`high`/`low`
 * mu, `ultra`/`medium` mi) ve profilin İÇERİĞİ tamamen tüketicinindir; CORE
 * bir knob sözlüğü dayatsaydı bir sonraki oyunun ihtiyacını yanlış tahmin
 * ederdi.
 *
 * Kalıcılıktan da habersizdir: tüketici `SaveManager` ile kendi yükler/yazar
 * ve `setLevel()` çağırır. Böylece aynı sınıf hem oyunda hem showcase'te
 * hem de bir editörde çalışır.
 *
 * ```ts
 * const quality = new GraphicsQuality({
 *   levels: { high: { renderScale: 1 }, low: { renderScale: 0.7 } },
 *   initial: 'high',
 * });
 * quality.getProfile().renderScale; // 1
 * ```
 */
export class GraphicsQuality<TLevel extends string, TProfile> {
  private readonly levels: GraphicsQualityProfiles<TLevel, TProfile>;
  private readonly levelIds: readonly TLevel[];
  private readonly listeners = new Set<GraphicsQualityListener<TLevel, TProfile>>();
  private readonly reflect?: { element: HTMLElement; attribute: string };
  private level: TLevel;
  private destroyed = false;

  constructor(options: GraphicsQualityOptions<TLevel, TProfile>) {
    this.levelIds = Object.keys(options.levels) as TLevel[];
    if (this.levelIds.length === 0) {
      throw new Error('GraphicsQuality: en az bir kalite kademesi tanımlanmalı.');
    }
    if (!Object.prototype.hasOwnProperty.call(options.levels, options.initial)) {
      throw new Error(
        `GraphicsQuality: açılış kademesi "${options.initial}" tanımlı kademeler arasında yok.`,
      );
    }

    this.levels = options.levels;
    this.level = options.initial;
    this.reflect = options.reflect;
    this.writeReflection();
  }

  /** Tanımlı kademeler — UI seçim listesi bundan türetilir. */
  getLevels(): readonly TLevel[] {
    return this.levelIds;
  }

  getLevel(): TLevel {
    return this.level;
  }

  /** Geçerli kademenin profili. Her karede güvenle okunabilir. */
  getProfile(): TProfile {
    return this.levels[this.level];
  }

  /** Verilen kademenin profili — UI'da kademeleri karşılaştırmak için. */
  getProfileOf(level: TLevel): TProfile {
    return this.levels[level];
  }

  /**
   * Bilinmeyen/kayıtlı bozuk bir değeri güvenle kademeye çevirir.
   * Kalıcı depodan okunan değeri doğrulamak için.
   */
  isLevel(value: unknown): value is TLevel {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(this.levels, value);
  }

  /**
   * Kademeyi değiştirir.
   *
   * @returns Değişim GERÇEKLEŞTİ mi. Aynı kademe tekrar verilirse `false`
   *   döner ve dinleyiciler tetiklenmez — çağıranın kendi karşılaştırmasını
   *   yazmasına gerek kalmaz.
   */
  setLevel(level: TLevel): boolean {
    if (this.destroyed || !this.isLevel(level) || level === this.level) return false;
    this.level = level;
    this.writeReflection();
    this.notify();
    return true;
  }

  onChange(listener: GraphicsQualityListener<TLevel, TProfile>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
    this.reflect?.element.removeAttribute(`data-${this.reflect.attribute}`);
  }

  private writeReflection(): void {
    this.reflect?.element.setAttribute(`data-${this.reflect.attribute}`, this.level);
  }

  private notify(): void {
    const profile = this.getProfile();
    for (const listener of this.listeners) {
      try {
        listener(this.level, profile);
      } catch (error) {
        // Bir görsel abonelik kalite değişimini yarıda bırakmasın; kalan
        // dinleyiciler yine de yeni profili görmeli.
        console.warn('[GraphicsQuality] Kalite dinleyicisi hata verdi:', error);
      }
    }
  }
}
