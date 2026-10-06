import type { Disposable } from '../../lifecycle/DisposableScope';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import {
  cancelHaptics,
  getHapticsCapability,
  isHapticsEnabled,
  observeHapticsCapability,
  vibrate,
  type HapticPattern,
} from '../../platform/haptics';
import type { UiIntent, UiIntentBus, UiOutcome } from './uiIntent';

export interface UiHapticProviderOptions {
  /** Titreşim şiddeti [0, 1]; 0 hiçbir darbe üretmez. Varsayılan 1. */
  intensity?: number;
  /** Sayfa gizlenince süren titreşim kesilir. */
  visibilityTarget?: Document;
  /** Odak kaybında (`blur`) süren titreşim kesilir. */
  focusTarget?: Window;
}

const OUTCOME_PATTERN = {
  success: 'success',
  warning: 'warning',
  error: 'error',
} as const satisfies Record<UiOutcome, HapticPattern>;

/**
 * Merkezî UI titreşim sağlayıcısı. Niyet veriyoluna `haptics` sahibi olarak abone
 * olur: bileşenlerin kendi (eski) titreşim yolu susar ve her niyet için TEK darbe
 * bu sağlayıcıdan gelir. Darbenin kendisi `platform/haptics`tedir; desen tablosu,
 * varsayılan KAPALI durum, kapasite ölçümü, sıfır şiddet ve desen başına sıklık
 * sınırı orada tek kaynaktır, burada tekrarlanmaz. Tek sürücü kuralı da oradadır
 * (native sürücü, yoksa Vibration API, yoksa oyun kolu).
 *
 * Güvenlik ve sıfırlama: sayfa gizlenince, pencere odağı kaybolunca, cihaz
 * yeteneği kaybolunca (kol çıkarıldı, sürücü söküldü) ve `dispose`da süren
 * titreşim kesilir. Sürücü yokluğu normal sonuçtur: hata yoktur, niyet yine
 * işlenir ve görsel bilgi her durumda bileşenin kendisindedir.
 */
export class UiHapticProvider implements Disposable {
  private readonly scope = new DisposableScope();
  private readonly attached = new WeakMap<UiIntentBus, Disposable>();
  private level: number;
  private disposed = false;

  constructor(options: UiHapticProviderOptions = {}) {
    this.level = UiHapticProvider.clamp(options.intensity ?? 1);
    const doc = options.visibilityTarget;
    if (doc) {
      this.scope.addListener(doc, 'visibilitychange', () => {
        if (doc.visibilityState === 'hidden') this.cancel();
      });
    }
    const win = options.focusTarget;
    if (win) this.scope.addListener(win, 'blur', () => this.cancel());
    // Yetenek kaybolursa (kol çıkarıldı, sürücü söküldü) süren darbe kesilir.
    let first = true;
    const stop = observeHapticsCapability((capability) => {
      if (first) {
        first = false;
        return;
      }
      if (!capability.supported) this.cancel();
    });
    this.scope.add({ dispose: stop });
  }

  /** Titreşim açık ve bir sürücü var mı (niyet geldiğinde darbe üretilebilir). */
  get active(): boolean {
    return !this.disposed && isHapticsEnabled() && getHapticsCapability().supported;
  }

  get intensity(): number {
    return this.level;
  }

  /** Şiddeti [0, 1] aralığına kırpar; sonlu olmayan değer 1 (tam şiddet) olur. */
  setIntensity(value: number): number {
    this.level = UiHapticProvider.clamp(value);
    return this.level;
  }

  /** Niyet veriyoluna titreşim sahibi olarak abone olur; aynı veriyolunda tek abonelik. */
  attach(bus: UiIntentBus): Disposable {
    const existing = this.attached.get(bus);
    if (existing) return existing;
    const subscription = bus.subscribe(
      {
        onIntent: (intent) => this.fire(UiHapticProvider.patternOf(intent)),
        onOutcome: (_intent, outcome) => this.fire(OUTCOME_PATTERN[outcome]),
      },
      { haptics: true },
    );
    const handle: Disposable = {
      dispose: () => {
        subscription.dispose();
        this.attached.delete(bus);
      },
    };
    this.attached.set(bus, handle);
    this.scope.add(handle);
    return handle;
  }

  /** Süren titreşimi keser. */
  cancel(): void {
    cancelHaptics();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scope.dispose();
    cancelHaptics();
  }

  /**
   * Bir deseni, açık/kapasiteli/şiddeti sıfır olmayan koşullarda ister. Darbenin
   * üretilmesi `platform/haptics`in sıklık sınırına da bağlıdır; dönüş yalnız
   * "istek iletildi" demektir.
   */
  private fire(pattern: HapticPattern | null): boolean {
    if (!pattern || !this.active || this.level <= 0) return false;
    vibrate(pattern, this.level);
    return true;
  }

  /** `haptic: false` kapatır; bileşenin açık deseni varsayılana baskındır; deseni olmayan niyet titretmez. */
  private static patternOf(intent: UiIntent): HapticPattern | null {
    if (intent.haptic === false) return null;
    return intent.haptic ?? intent.defaultHaptic ?? null;
  }

  private static clamp(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  }
}
