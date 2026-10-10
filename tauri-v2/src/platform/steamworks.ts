import { DisposableScope } from '@volstudio/core/lifecycle';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  OnScreenKeyboard,
  type GlyphFamilyContext,
  type TextEntryProvider,
  type TextEntryRequest,
  type TextEntryResult,
} from '@volstudio/core/ui';

/**
 * İsteğe bağlı Steamworks katmanının JS yüzü. `vol-steamworks` Tauri
 * eklentisi `steamworks` cargo feature'ı olmadan da derlenir (stub) —
 * buradaki her çağrı iki yapılandırmada da güvenlidir: eklenti yoksa ya da
 * stub ise `steamworksStatus().available === false` döner ve komutlar
 * reddedilir. Oyun bu katmanı kendi yapılandırmasıyla açar; açılmayan
 * oyunda hiçbir Steamworks kodu koşmaz.
 *
 * Geliştirme App ID'si 480'dir (Spacewar) — native tarafta `init(480)`.
 */

const PLUGIN = 'plugin:vol-steamworks|';

export interface SteamworksStatus {
  /** `steamworks` feature'ı ile derlendi mi. */
  readonly compiled: boolean;
  /** Steam istemcisine bağlanıldı mı. */
  readonly available: boolean;
  readonly appId?: number | null;
  /** `IsSteamRunningOnSteamDeck`. */
  readonly deck: boolean;
  readonly bigPicture: boolean;
  readonly overlayEnabled: boolean;
  readonly cloudEnabled?: boolean | null;
  readonly inputReady: boolean;
  /**
   * `init`'e manifesto verildiyse `SetInputActionManifestFilePath` dönüşü;
   * verilmediyse `null`. Steam'in manifesto reddi burada görünür kalır.
   */
  readonly manifestOk?: boolean | null;
  readonly error?: string | null;
}

interface SteamControllerInfo {
  readonly handle: number;
  /** `resolveGlyphFamily` çözümleyicisinin `steamworksType` alanı. */
  readonly steamworksType: string;
}

export interface SteamworksProbe {
  readonly isTauri: () => boolean;
  readonly invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  readonly listen: (event: string, handler: (payload: unknown) => void) => Promise<UnlistenFn>;
}

const defaultProbe: SteamworksProbe = {
  isTauri,
  invoke: (cmd, args) => invoke(`${PLUGIN}${cmd}`, args),
  listen: (event, handler) => listen<unknown>(event, (e) => handler(e.payload)),
};

let probe = defaultProbe;

/** Testler için sahte sağlayıcı; `null` varsayılana döndürür. */
export function setSteamworksProbe(next: SteamworksProbe | null): void {
  probe = next ?? defaultProbe;
}

/** Her durumda güvenli: eklenti yoksa `available:false` gövdesi döner. */
export async function steamworksStatus(): Promise<SteamworksStatus> {
  if (!probe.isTauri()) {
    return {
      compiled: false,
      available: false,
      deck: false,
      bigPicture: false,
      overlayEnabled: false,
      inputReady: false,
    };
  }
  try {
    return (await probe.invoke('status')) as SteamworksStatus;
  } catch (error) {
    return {
      compiled: false,
      available: false,
      deck: false,
      bigPicture: false,
      overlayEnabled: false,
      inputReady: false,
      error: String(error),
    };
  }
}

/** Aksiyon setini tüm bağlı kollara uygular; uygulanan kol sayısı döner. */
export async function activateSteamActionSet(name: string): Promise<number> {
  return (await probe.invoke('activate_action_set', { name })) as number;
}

/**
 * Glif çözümleyicisine beslenecek Steamworks ipucu — ilk bağlı kolun
 * `InputType`'ı. Bağlı kol yoksa ya da eklenti kapalıysa boş bağlam döner
 * (tarayıcı `Gamepad.id`'si ikinci sıraya kalır).
 */
export async function steamworksGlyphContext(): Promise<GlyphFamilyContext> {
  try {
    const [first] = (await probe.invoke('controllers')) as SteamControllerInfo[];
    return first ? { steamworksType: first.steamworksType } : {};
  } catch {
    return {};
  }
}

/**
 * Steam overlay açılma/kapanma dinleyicisi. Sözleşme: oyun overlay
 * açıldığında duraklama kararını KENDİ verir; bu katman yalnız olayı
 * bildirir. Döndürülen fonksiyon aboneliği kapatır.
 */
export async function onSteamOverlay(onChange: (active: boolean) => void): Promise<UnlistenFn> {
  return probe.listen('vol-steamworks:overlay', (payload) => {
    onChange(Boolean((payload as { active?: boolean }).active));
  });
}

interface TextInputPayload {
  requestId: string;
  submitted: boolean;
  text?: string | null;
}

/**
 * Big Picture metin diyaloğunu `TextEntryProvider` sözleşmesine sarar.
 * Diyalog Steam overlay'i gerektirir; açılamazsa (`overlayEnabled` false,
 * devkit lansmanı vb.) core'un yerel ekran klavyesine düşer — yüzeysel
 * "Steamworks var" varsayımı yerine gerçek `show` sonucu karar verir.
 *
 * Aynı anda tek diyalog: açık bir diyalog varken ikinci `open` hemen
 * iptal döner.
 */
/** Overlay kapandıktan sonra sonuç olayı için tanınan süre. */
const DISMISS_GRACE_MS = 750;
/** Sonuç ve overlay olayı hiç gelmezse girişin açık kalabileceği en uzun süre. */
const TEXT_INPUT_LIMIT_MS = 10 * 60 * 1000;

let textRequestSequence = 0n;

export function createSteamworksTextEntryProvider(): TextEntryProvider {
  let pending: string | undefined;
  return {
    async open(request: TextEntryRequest, signal?: AbortSignal): Promise<TextEntryResult> {
      const canceled: TextEntryResult = { value: request.value, canceled: true };
      if (pending || signal?.aborted) return canceled;
      const requestId = `text-${++textRequestSequence}`;
      pending = requestId;
      const currentProbe = probe;
      const scope = new DisposableScope();
      const nativeScope = scope.add(new DisposableScope());
      let stopped = false;
      let showStarted = false;
      let resolveAbort!: (result: TextEntryResult) => void;
      const aborted = new Promise<TextEntryResult>((resolve) => (resolveAbort = resolve));
      const cancelNative = async (): Promise<void> => {
        if (!showStarted) return;
        // İptal, geç show yanıtından sonra da denenir; eski requestId yeni sahibi silmez.
        try {
          await currentProbe.invoke('cancel_text_input', { requestId });
        } catch (error) {
          console.warn('Steam metni iptal edilemedi:', error);
        }
      };
      const abort = (): void => {
        stopped = true;
        void cancelNative();
        scope.dispose();
        resolveAbort(canceled);
      };
      if (signal) scope.addListener(signal, 'abort', abort, { once: true });
      const run = async (): Promise<TextEntryResult> => {
        let dismiss!: (payload: TextInputPayload) => void;
        const dismissed = new Promise<TextInputPayload>((resolve) => (dismiss = resolve));
        const scheduleDismiss = (delay: number): void => {
          nativeScope.addTimeout(() => dismiss({ requestId, submitted: false }), delay);
        };
        let shown = false;
        try {
          const handlers: ReadonlyArray<readonly [string, (payload: unknown) => void]> = [
            [
              'vol-steamworks:text-input',
              (payload) => {
                const result = payload as TextInputPayload | null;
                if (!stopped && showStarted && result?.requestId === requestId) dismiss(result);
              },
            ],
            [
              'vol-steamworks:overlay',
              (payload) => {
                if (
                  !stopped &&
                  showStarted &&
                  (payload as { active?: boolean } | null)?.active === false
                ) {
                  scheduleDismiss(DISMISS_GRACE_MS);
                }
              },
            ],
          ];
          for (const [event, handler] of handlers) {
            nativeScope.addSubscription(await currentProbe.listen(event, handler));
            if (stopped) return canceled;
          }
          showStarted = true;
          shown =
            (await currentProbe.invoke('show_text_input', {
              requestId,
              description: '',
              existingText: request.value,
              maxCharacters: request.maxLength ?? 4096,
              multiline: request.multiline ?? false,
              mode: request.purpose === 'password' ? 'password' : 'normal',
            })) === true;
        } catch {
          // Native açılış reddi yerel klavyeye düşer; iptal aşağıda ayrı korunur.
        }
        if (stopped) {
          if (shown) void cancelNative();
          return canceled;
        }
        if (!shown) {
          nativeScope.dispose();
          return OnScreenKeyboard.open(request, signal);
        }
        scheduleDismiss(TEXT_INPUT_LIMIT_MS);
        const payload = await dismissed;
        if (!payload.submitted) void cancelNative();
        return {
          value:
            payload.submitted === true && typeof payload.text === 'string'
              ? payload.text
              : request.value,
          canceled: payload.submitted !== true,
        };
      };
      try {
        // Geç listen/show/fallback sonucu gözlenir, fakat iptal owner'ı bekletmez.
        return await Promise.race([run(), aborted]);
      } finally {
        scope.dispose();
        if (pending === requestId) pending = undefined;
      }
    },
  };
}

/**
 * Kayan klavye (Steam `ShowFloatingGamepadTextInput`) odaklı alanın ÜSTÜNE biner ve
 * tuşları doğrudan o alana yazar: diyalog gibi sonuç metni dönmez, alan değerini
 * tarayıcının `input` olayları değiştirir. Bu yüzden ayrı bir giriştir ve
 * `TextEntryProvider` sözleşmesine (tek seferlik sonuç) KARIŞTIRILMAZ; çağıran alanı
 * odakta tutar ve kapanışta başka bir şey uygulamaz.
 *
 * - `dismissed`: klavye kapandı (kullanıcı ya da Steam). Alan değeri zaten güncel.
 * - `unavailable`: klavye açılamadı (eklenti/overlay yok, parola alanı, geçersiz alan);
 *   çağıran core'un yerel ekran klavyesine ya da diyaloğa düşer.
 * - `busy`: bu uçta zaten bir kayan klavye açık.
 * - `canceled`: sahibi iptal etti (sinyal) ya da üst süre doldu; klavye kapatılır.
 */
export type SteamFloatingKeyboardResult = 'dismissed' | 'unavailable' | 'busy' | 'canceled';

/** Görünüm penceresine göre alan dikdörtgeni, CSS pikseli. */
export interface SteamFloatingKeyboardAnchor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SteamFloatingKeyboardOptions {
  /** Çok satırlı düzen (TextArea); yoksa tek satır. */
  readonly multiline?: boolean;
  /**
   * Parola alanı. Steam'in kayan klavyesinin maskesi yoktur: parola isteği
   * diyalogun Password moduna ayrılır, burada `unavailable` döner ve klavye açılmaz.
   */
  readonly password?: boolean;
  /** Sahibin iptali; açık klavye SDK'dan kapatılır. */
  readonly signal?: AbortSignal;
  /** CSS → pencere pikseli çarpanı; varsayılan `devicePixelRatio` (yoksa 1). */
  readonly scale?: number;
}

let floatingKeyboardOpen = false;
let floatingRequestSequence = 0n;

function floatingRect(
  anchor: SteamFloatingKeyboardAnchor,
  scale: number,
): { x: number; y: number; width: number; height: number } | null {
  const values = [anchor.x, anchor.y, anchor.width, anchor.height, scale];
  if (!values.every(Number.isFinite) || anchor.width <= 0 || anchor.height <= 0 || scale <= 0) {
    return null;
  }
  return {
    x: Math.round(anchor.x * scale),
    y: Math.round(anchor.y * scale),
    width: Math.max(1, Math.round(anchor.width * scale)),
    height: Math.max(1, Math.round(anchor.height * scale)),
  };
}

export async function showSteamFloatingKeyboard(
  anchor: SteamFloatingKeyboardAnchor,
  options: SteamFloatingKeyboardOptions = {},
): Promise<SteamFloatingKeyboardResult> {
  const { signal } = options;
  if (signal?.aborted) return 'canceled';
  if (floatingKeyboardOpen) return 'busy';
  const rect = floatingRect(anchor, options.scale ?? globalThis.devicePixelRatio ?? 1);
  if (options.password === true || !rect) return 'unavailable';

  floatingKeyboardOpen = true;
  const requestId = `float-${++floatingRequestSequence}`;
  const currentProbe = probe;
  const scope = new DisposableScope();
  let stopped = false;
  let showStarted = false;
  let resolveAbort!: (result: SteamFloatingKeyboardResult) => void;
  const aborted = new Promise<SteamFloatingKeyboardResult>((resolve) => (resolveAbort = resolve));
  const cancelNative = async (): Promise<void> => {
    if (!showStarted) return;
    try {
      await currentProbe.invoke('cancel_text_input', { requestId });
    } catch (error) {
      console.warn('Steam kayan klavyesi kapatılamadı:', error);
    }
  };
  const abort = (): void => {
    stopped = true;
    void cancelNative();
    scope.dispose();
    resolveAbort('canceled');
  };
  if (signal) scope.addListener(signal, 'abort', abort, { once: true });
  const run = async (): Promise<SteamFloatingKeyboardResult> => {
    let dismiss!: (result: SteamFloatingKeyboardResult) => void;
    const dismissed = new Promise<SteamFloatingKeyboardResult>((resolve) => (dismiss = resolve));
    let shown = false;
    try {
      scope.addSubscription(
        await currentProbe.listen('vol-steamworks:floating-dismissed', (payload) => {
          const event = payload as { requestId?: string } | null;
          if (!stopped && showStarted && event?.requestId === requestId) dismiss('dismissed');
        }),
      );
      if (stopped) return 'canceled';
      showStarted = true;
      shown =
        (await currentProbe.invoke('show_floating_input', {
          requestId,
          ...rect,
          mode: options.multiline === true ? 'multiLine' : 'singleLine',
        })) === true;
    } catch {
      // Açılış reddi çağıranın yedeğine bırakılır; iptal aşağıda ayrı korunur.
    }
    if (stopped) {
      if (shown) void cancelNative();
      return 'canceled';
    }
    if (!shown) return 'unavailable';
    scope.addTimeout(() => {
      // Kapanış olayı hiç gelmezse alan sonsuza dek "açık" kalmaz.
      stopped = true;
      void cancelNative();
      dismiss('canceled');
    }, TEXT_INPUT_LIMIT_MS);
    return dismissed;
  };
  try {
    return await Promise.race([run(), aborted]);
  } finally {
    scope.dispose();
    floatingKeyboardOpen = false;
  }
}

/** `showSteamFloatingKeyboard`ın ihtiyaç duyduğu alan şekli; DOM'a bağımlı değildir. */
export interface SteamFloatingKeyboardField {
  readonly tagName: string;
  readonly type?: string;
  readonly readOnly?: boolean;
  readonly disabled?: boolean;
  getBoundingClientRect(): SteamFloatingKeyboardAnchor;
}

/**
 * Alanın türünden düzeni, parola durumunu ve dikdörtgeni türetir. Salt okunur ya da
 * devre dışı alana klavye açılmaz (`unavailable`). Alanın odağı çağıranda kalır.
 */
export function showSteamFloatingKeyboardFor(
  field: SteamFloatingKeyboardField,
  signal?: AbortSignal,
): Promise<SteamFloatingKeyboardResult> {
  if (field.readOnly === true || field.disabled === true) return Promise.resolve('unavailable');
  return showSteamFloatingKeyboard(field.getBoundingClientRect(), {
    multiline: field.tagName.toLowerCase() === 'textarea',
    password: field.type === 'password',
    signal,
  });
}
