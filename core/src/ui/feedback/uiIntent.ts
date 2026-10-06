import type { Disposable } from '../../lifecycle/DisposableScope';
import type { HapticPattern } from '../../platform/haptics';
import { playHapticFeedback, type HapticFeedback } from '../primitives/hapticFeedback';

/**
 * Anlamsal UI niyeti: kabul edilmiş bir KULLANICI eyleminin tipli, tekil kaydı.
 * Ses, titreşim ve ölçüm sağlayıcıları DOM olaylarını değil bu niyeti dinler;
 * böylece aynı fiziksel eylem (işaretçi, yerel tıklama, klavye, kol) tek niyet
 * üretir ve sağlayıcı hangi girdiden geldiğini bilmek zorunda kalmaz.
 *
 * Sözleşme:
 * - Yalnız kullanıcı etkinleştirmesi niyettir. Programatik değer atamaları
 *   (`setValue`, `setDisabled`, geri alma, iptal) niyet DEĞİLDİR ve sessizdir.
 * - Aynı yerel olay iki kez niyete dönüşmez (`claim`): içteki bileşen sahiplenir,
 *   dıştaki (örn. kartın düğmesi vs kartın kendisi) sessiz kalır.
 * - Devre dışı hedef niyet üretmez.
 * - Önizleme (`persistent: false`) ve kalıcı değişiklik (`persistent: true`) ayrıdır.
 * - Eylemin ÜRÜN sonucunu (başarı/uyarı/hata) host bildirir (`reportOutcome`);
 *   bir Promise'in çözülmesi başarı sayılmaz.
 * - Titreşim sahibi tektir: bağlı bir sağlayıcı titreşimi üstlendiyse (`haptics`),
 *   bileşenin kendi (eski) titreşim yolu çalışmaz; yoksa eski yol aynen sürer.
 */
export type UiIntentKind =
  | 'press'
  | 'toggle'
  | 'select'
  | 'valuePreview'
  | 'valueCommit'
  | 'confirm'
  | 'cancel'
  | 'open'
  | 'close';

/** Girdi yolu: işaretçi (fare), dokunma/kalem, klavye ya da yapay (kol/odak etkinleştirmesi). */
export type UiIntentSource = 'pointer' | 'touch' | 'keyboard' | 'synthetic';

export type UiOutcome = 'success' | 'warning' | 'error';

export interface UiIntentRequest {
  kind: UiIntentKind;
  /** Niyeti üreten bileşen (`'Button'`, `'Select'`…): teşhis ve sağlayıcı kuralları için. */
  origin: string;
  target: Element;
  /** Tetikleyen yerel olay; yoksa niyet programatiktir ve SESSİZDİR. */
  event?: Event;
  /** Bileşenin titreşim tercihi (`false` kapatır); sağlayıcı bunu okur. */
  haptic?: HapticFeedback;
  /** Bileşenin varsayılan titreşim deseni. */
  defaultHaptic?: HapticPattern;
  /** Önizleme `false`, kalıcı değişiklik `true`; varsayılan `true`. */
  persistent?: boolean;
}

export interface UiIntent {
  readonly id: number;
  readonly kind: UiIntentKind;
  readonly source: UiIntentSource;
  readonly origin: string;
  readonly target: Element;
  readonly persistent: boolean;
  readonly haptic: HapticFeedback | undefined;
  readonly defaultHaptic: HapticPattern | undefined;
  readonly timeStamp: number;
}

export interface UiIntentListener {
  onIntent?(intent: UiIntent): void;
  onOutcome?(intent: UiIntent, outcome: UiOutcome): void;
}

export interface UiIntentSubscription {
  /** `true`: bu dinleyici titreşimi üstlenir; bileşenlerin kendi titreşim yolu susar. */
  haptics?: boolean;
  /** Dinleyici hatası bildirilir, diğer dinleyicileri engellemez. */
  onError?: (error: unknown) => void;
}

function sourceOf(event: Event): UiIntentSource {
  if (typeof PointerEvent !== 'undefined' && event instanceof PointerEvent) {
    return event.pointerType === 'mouse' ? 'pointer' : 'touch';
  }
  if (!event.isTrusted) return 'synthetic';
  // Fare tıklaması `detail >= 1`; klavye etkinleştirmesi `detail === 0`.
  return event instanceof MouseEvent && event.detail > 0 ? 'pointer' : 'keyboard';
}

function isDisabled(target: Element): boolean {
  return (target instanceof HTMLButtonElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement) &&
    target.disabled
    ? true
    : target.getAttribute('aria-disabled') === 'true' || target.closest('[inert]') !== null;
}

/**
 * Bir UI kökünün niyet veriyolu. Kök başına TEK örnek vardır (`uiIntentBusFor`):
 * paylaşılan kök dinleyici ve ses sayısını çoğaltmaz.
 */
export class UiIntentBus {
  private nextId = 1;
  private readonly claimed = new WeakSet<Event>();
  private readonly latest = new WeakMap<Element, UiIntent>();
  private readonly listeners = new Map<UiIntentListener, UiIntentSubscription>();

  subscribe(listener: UiIntentListener, options: UiIntentSubscription = {}): Disposable {
    this.listeners.set(listener, options);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /** Bir sağlayıcı titreşimi üstlendi mi. */
  get ownsHaptics(): boolean {
    for (const options of this.listeners.values()) if (options.haptics) return true;
    return false;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Kullanıcı etkinleştirmesini niyete dönüştürür. Programatik (olaysız), devre dışı
   * ya da zaten sahiplenilmiş olay için `null` döner: niyet yoktur, ses/titreşim yoktur.
   */
  emit(request: UiIntentRequest): UiIntent | null {
    const { event, target } = request;
    if (!event) return null;
    if (this.claimed.has(event)) return null;
    if (isDisabled(target)) return null;
    this.claimed.add(event);

    const intent: UiIntent = {
      id: this.nextId++,
      kind: request.kind,
      source: sourceOf(event),
      origin: request.origin,
      target,
      persistent: request.persistent ?? true,
      haptic: request.haptic,
      defaultHaptic: request.defaultHaptic,
      timeStamp: event.timeStamp,
    };
    this.latest.set(target, intent);
    for (const [listener, options] of [...this.listeners]) {
      try {
        listener.onIntent?.(intent);
      } catch (error) {
        options.onError?.(error);
      }
    }
    return intent;
  }

  /**
   * Eylemin ürün sonucunu bildirir (host). Hedefin en son niyetine bağlanır;
   * niyet yoksa (programatik tetik) sessizce yok sayılır. Promise çözülmesi
   * bu çağrının yerine GEÇMEZ.
   */
  reportOutcome(target: Element, outcome: UiOutcome): boolean {
    const intent = this.latest.get(target);
    if (!intent) return false;
    for (const [listener, options] of [...this.listeners]) {
      try {
        listener.onOutcome?.(intent, outcome);
      } catch (error) {
        options.onError?.(error);
      }
    }
    return true;
  }
}

// ─── Kök başına örnek ve kök arama ──────────────────────────────────────────

interface Entry {
  bus: UiIntentBus;
  count: number;
}
const registry = new WeakMap<Element, Entry>();

/**
 * Kök eleman için paylaşılan niyet veriyolunu alır (referans sayımlı). Aynı elemanı
 * paylaşan iki `UIRoot` aynı veriyolunu görür. Dönen `release` ikinci çağrıda etkisizdir.
 */
export function uiIntentBusFor(root: Element): { bus: UiIntentBus; release(): void } {
  let entry = registry.get(root);
  if (!entry) {
    entry = { bus: new UiIntentBus(), count: 0 };
    registry.set(root, entry);
  }
  entry.count += 1;
  const held = entry;
  let released = false;
  return {
    bus: held.bus,
    release: () => {
      if (released) return;
      released = true;
      held.count -= 1;
      if (held.count <= 0 && registry.get(root) === held) registry.delete(root);
    },
  };
}

/** Elemanın en yakın kayıtlı kökteki veriyolu; kayıtlı kök yoksa `null`. */
export function findUiIntentBus(element: Element): UiIntentBus | null {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const entry = registry.get(node);
    if (entry) return entry.bus;
  }
  return null;
}

/**
 * Bileşenlerin tek giriş noktası: niyeti üretir ve titreşim sahipliğini çözer.
 * - Kayıtlı kök yoksa: eski yol (bileşenin kendi titreşimi) aynen çalışır.
 * - Kök var ve bir sağlayıcı titreşimi üstlenmediyse: niyet yayılır, eski titreşim çalışır.
 * - Sağlayıcı titreşimi üstlendiyse: niyet yayılır, bileşen titremez (çift darbe yok).
 * - Olaysız/devre dışı/sahiplenilmiş çağrı: ne niyet ne titreşim (programatik sessiz).
 */
export function emitUiIntent(request: UiIntentRequest): UiIntent | null {
  const bus = findUiIntentBus(request.target);
  if (!bus) {
    // Kayıtlı kök yok: eski davranış BİREBİR (koşulsuz bileşen titreşimi).
    if (request.defaultHaptic) playHapticFeedback(request.haptic, request.defaultHaptic);
    return null;
  }
  const intent = bus.emit(request);
  if (intent && !bus.ownsHaptics && request.defaultHaptic) {
    playHapticFeedback(request.haptic, request.defaultHaptic);
  }
  return intent;
}
