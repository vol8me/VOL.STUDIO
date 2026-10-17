import type { Disposable } from '../../lifecycle/DisposableScope';
import type { ScopedKey } from '../../persistence/scopedStorage';
import {
  DEFAULT_DENSITY,
  DEFAULT_THEME,
  resolveDensityId,
  resolveThemeId,
  themeCssVar,
  type DensityId,
  type ThemeId,
} from './registry';
import type { VolThemeToken } from './types';

/** Cihaz kapsamlı kalıcılık anahtarları: tema ve yoğunluk ekran/cihaz başınadır. */
export const THEME_STORAGE_KEY: ScopedKey = 'device.volui:theme';
export const DENSITY_STORAGE_KEY: ScopedKey = 'device.volui:density';
export const LARGE_TARGETS_STORAGE_KEY: ScopedKey = 'device.volui:large-targets';

/** `ScopedSaveManager`ın okuma/yazma yüzü; testte bellek içi taklit edilebilir. */
export interface ThemeStore {
  load<T>(key: ScopedKey, defaultValue: T): Promise<T>;
  save<T>(key: ScopedKey, value: T): Promise<void>;
}

export interface ThemeState {
  readonly theme: ThemeId;
  readonly density: DensityId;
  /** Kaba işaretçi dışında da en az 44 px hedef (ör. Deck kol arayüzü). */
  readonly largeTargets: boolean;
}

export interface ThemeControllerOptions {
  store?: ThemeStore;
  theme?: unknown;
  density?: unknown;
  largeTargets?: boolean;
  /** Kalıcılık hatası; arayüz durumu geri alınmaz. */
  onError?: (error: unknown) => void;
}

interface Attachment {
  count: number;
  previous: { theme: string | null; density: string | null; target: string | null };
}

const THEME_ATTR = 'data-vol-theme';
const DENSITY_ATTR = 'data-vol-density';
const TARGET_ATTR = 'data-vol-target';

/**
 * Tema, yoğunluk ve hedef tabanının TEK sahibi. Durum, bağlı her kök elemanda
 * `data-vol-theme` / `data-vol-density` / `data-vol-target` nitelikleridir;
 * değişim yalnız nitelik değiştirir, DOM ağacına dokunmaz: kaydırma, odak ve seçim
 * korunur ve animasyon yoktur.
 *
 * - Kapsam: `attach(el)` yalnız o alt ağacı etkiler (önizleme kökü). Küresel tema
 *   için `document.documentElement`, body'ye taşınan katmanlar için de aynı köke
 *   bağlanır; body katmanları önizleme kökünden tema almaz.
 * - Aynı eleman iki kez bağlanırsa (paylaşılan `UIRoot` parent'ı) tek kayıt tutulur
 *   ve sayılır; son `dispose` önceki niteliği geri yazar.
 * - Bilinmeyen/bozuk değer (kalıcı kayıt dahil) varsayılana döner.
 * - `restore()` kullanıcı bu arada değer seçtiyse onu ezmez.
 */
export class ThemeController implements Disposable {
  private current: ThemeState;
  private readonly attachments = new Map<HTMLElement, Attachment>();
  private readonly listeners = new Set<(state: ThemeState) => void>();
  private touched = false;
  private disposed = false;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly options: ThemeControllerOptions = {}) {
    this.current = {
      theme: resolveThemeId(options.theme),
      density: resolveDensityId(options.density),
      largeTargets: options.largeTargets === true,
    };
  }

  get state(): ThemeState {
    return this.current;
  }

  /** Bekleyen kalıcılık yazmalarının bitişi (testler ve kapanış için). */
  get whenSaved(): Promise<void> {
    return this.pending;
  }

  attach(target: HTMLElement): Disposable {
    const existing = this.attachments.get(target);
    if (existing) existing.count += 1;
    else {
      this.attachments.set(target, {
        count: 1,
        previous: {
          theme: target.getAttribute(THEME_ATTR),
          density: target.getAttribute(DENSITY_ATTR),
          target: target.getAttribute(TARGET_ATTR),
        },
      });
      this.apply(target);
    }
    let released = false;
    return {
      dispose: () => {
        if (released) return;
        released = true;
        this.release(target);
      },
    };
  }

  setTheme(value: unknown): ThemeId {
    return this.update({ theme: resolveThemeId(value) }, THEME_STORAGE_KEY).theme;
  }

  setDensity(value: unknown): DensityId {
    return this.update({ density: resolveDensityId(value) }, DENSITY_STORAGE_KEY).density;
  }

  setLargeTargets(enabled: boolean): boolean {
    return this.update({ largeTargets: enabled === true }, LARGE_TARGETS_STORAGE_KEY).largeTargets;
  }

  /** Kalıcı değerleri okur ve uygular; arada kullanıcı seçimi olduysa dokunmaz. */
  async restore(): Promise<ThemeState> {
    const store = this.options.store;
    if (!store || this.disposed) return this.current;
    try {
      const [theme, density, largeTargets] = await Promise.all([
        store.load<unknown>(THEME_STORAGE_KEY, DEFAULT_THEME),
        store.load<unknown>(DENSITY_STORAGE_KEY, DEFAULT_DENSITY),
        store.load<unknown>(LARGE_TARGETS_STORAGE_KEY, false),
      ]);
      if (this.touched || this.disposed) return this.current;
      this.commit({
        theme: resolveThemeId(theme),
        density: resolveDensityId(density),
        largeTargets: largeTargets === true,
      });
    } catch (error) {
      this.options.onError?.(error);
    }
    return this.current;
  }

  onChange(listener: (state: ThemeState) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /**
   * Canvas/WebGL gibi CSS dışı çizimler için token'ın SON hesaplanmış değeri.
   * Değer boşsa (token yok ya da hedef belgeye bağlı değil) açık hata verir:
   * sessizce sabit bir renge düşmek tema sızıntısıdır.
   */
  readColor(target: Element, token: VolThemeToken): string {
    const name = themeCssVar(token);
    const value = getComputedStyle(target).getPropertyValue(name).trim();
    if (value === '') throw new Error(`ThemeController: ${name} okunamadı`);
    return value;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [target, attachment] of this.attachments) this.restoreAttributes(target, attachment);
    this.attachments.clear();
    this.listeners.clear();
  }

  private update(patch: Partial<ThemeState>, key: ScopedKey): ThemeState {
    if (this.disposed) return this.current;
    this.touched = true;
    const next = { ...this.current, ...patch };
    this.commit(next);
    const store = this.options.store;
    if (store) {
      const value =
        key === THEME_STORAGE_KEY
          ? next.theme
          : key === DENSITY_STORAGE_KEY
            ? next.density
            : next.largeTargets;
      this.pending = this.pending
        .then(() => store.save(key, value))
        .catch((error: unknown) => this.options.onError?.(error));
    }
    return this.current;
  }

  private commit(next: ThemeState): void {
    const changed =
      next.theme !== this.current.theme ||
      next.density !== this.current.density ||
      next.largeTargets !== this.current.largeTargets;
    this.current = next;
    if (!changed) return;
    for (const target of this.attachments.keys()) this.apply(target);
    for (const listener of [...this.listeners]) listener(this.current);
  }

  private apply(target: HTMLElement): void {
    target.setAttribute(THEME_ATTR, this.current.theme);
    target.setAttribute(DENSITY_ATTR, this.current.density);
    if (this.current.largeTargets) target.setAttribute(TARGET_ATTR, 'large');
    else target.removeAttribute(TARGET_ATTR);
  }

  private release(target: HTMLElement): void {
    const attachment = this.attachments.get(target);
    if (!attachment) return;
    attachment.count -= 1;
    if (attachment.count > 0) return;
    this.attachments.delete(target);
    this.restoreAttributes(target, attachment);
  }

  private restoreAttributes(target: HTMLElement, attachment: Attachment): void {
    const restore = (name: string, value: string | null): void => {
      if (value === null) target.removeAttribute(name);
      else target.setAttribute(name, value);
    };
    restore(THEME_ATTR, attachment.previous.theme);
    restore(DENSITY_ATTR, attachment.previous.density);
    restore(TARGET_ATTR, attachment.previous.target);
  }
}
