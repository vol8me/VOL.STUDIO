import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  OnScreenKeyboard,
  type GlyphFamilyContext,
  type TextEntryProvider,
  type TextEntryRequest,
  type TextEntryResult,
} from '@volstudio/core';

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

export interface SteamControllerInfo {
  readonly handle: number;
  /** `resolveGlyphFamily` çözümleyicisinin `steamworksType` alanı. */
  readonly steamworksType: string;
}

export interface SteamGlyphOrigin {
  readonly name: string;
  /** Glif PNG'si base64 — `data:image/png;base64,` öneki ekleyerek kullanılır. */
  readonly pngBase64: string | null;
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

/**
 * Steam Input aksiyon manifestosunu kaydeder. Göreli ad uygulamanın
 * resource dizininde aranır (`.vdf` dosyası `bundle.resources` ile girer).
 */
export async function setSteamInputManifest(path: string): Promise<boolean> {
  return (await probe.invoke('set_input_manifest', { path })) as boolean;
}

/** Aksiyon setini tüm bağlı kollara uygular; uygulanan kol sayısı döner. */
export async function activateSteamActionSet(name: string): Promise<number> {
  return (await probe.invoke('activate_action_set', { name })) as number;
}

export async function steamControllers(): Promise<SteamControllerInfo[]> {
  return (await probe.invoke('controllers')) as SteamControllerInfo[];
}

/** İlk bağlı kolun aksiyon değerleri; kol yoksa listeler boştur. */
export interface SteamActionState {
  readonly digital: readonly {
    readonly name: string;
    readonly pressed: boolean;
    readonly active: boolean;
  }[];
  readonly analog: readonly {
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly active: boolean;
  }[];
}

/** Motor hızı 0–1 aralığından Steam'in 0–65535 ölçeğine. */
function motorSpeed(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 65535);
}

/** Steam Input titreşimi bağlı bütün kollara; (0, 0) durdurur. Kaç kola gittiği döner. */
export async function steamVibrate(left: number, right: number): Promise<number> {
  return (await probe.invoke('vibrate', {
    left: motorSpeed(left),
    right: motorSpeed(right),
  })) as number;
}

/** Adı verilen dijital ve analog aksiyonların anlık değeri. */
export async function steamActionState(
  digital: readonly string[],
  analog: readonly string[] = [],
): Promise<SteamActionState> {
  return (await probe.invoke('action_state', { digital, analog })) as SteamActionState;
}

/** Dijital aksiyonun origin'leri + istemci glif PNG'leri (base64). */
export async function steamActionGlyph(
  actionSet: string,
  action: string,
): Promise<SteamGlyphOrigin[]> {
  return (await probe.invoke('action_glyph', {
    actionSet,
    action,
  })) as SteamGlyphOrigin[];
}

/**
 * Glif çözümleyicisine beslenecek Steamworks ipucu — ilk bağlı kolun
 * `InputType`'ı. Bağlı kol yoksa ya da eklenti kapalıysa boş bağlam döner
 * (tarayıcı `Gamepad.id`'si ikinci sıraya kalır).
 */
export async function steamworksGlyphContext(): Promise<GlyphFamilyContext> {
  try {
    const [first] = await steamControllers();
    return first ? { steamworksType: first.steamworksType } : {};
  } catch {
    return {};
  }
}

/** Steam Input bağlama panelini açar; overlay yoksa `false`. */
export async function showSteamBindingPanel(): Promise<boolean> {
  return (await probe.invoke('show_binding_panel')) as boolean;
}

export interface SteamOverlayProbe {
  onChange(active: boolean): void;
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

export function createSteamworksTextEntryProvider(): TextEntryProvider {
  let pending = false;
  return {
    async open(request: TextEntryRequest): Promise<TextEntryResult> {
      if (pending) return { value: request.value, canceled: true };
      pending = true;
      const currentProbe = probe;
      const unlisteners: UnlistenFn[] = [];
      const timers: ReturnType<typeof setTimeout>[] = [];
      const cleanup = () => {
        for (const timer of timers.splice(0)) clearTimeout(timer);
        for (const remove of unlisteners.splice(0)) remove();
      };
      try {
        let dismiss!: (payload: TextInputPayload) => void;
        const dismissed = new Promise<TextInputPayload>((resolve) => (dismiss = resolve));
        let shown = false;
        try {
          unlisteners.push(
            await currentProbe.listen('vol-steamworks:text-input', (payload) => {
              dismiss((payload ?? {}) as TextInputPayload);
            }),
          );
          // Steam sonuç olayı göndermeden overlay'i kapatabilir; o zaman giriş
          // iptal sayılır, yoksa sonraki bütün girişler kilitli kalırdı.
          unlisteners.push(
            await currentProbe.listen('vol-steamworks:overlay', (payload) => {
              if ((payload as { active?: boolean } | null)?.active === false) {
                timers.push(setTimeout(() => dismiss({ submitted: false }), DISMISS_GRACE_MS));
              }
            }),
          );
          shown =
            (await currentProbe.invoke('show_text_input', {
              description: '',
              existingText: request.value,
              maxCharacters: request.maxLength ?? 4096,
              multiline: request.multiline ?? false,
            })) === true;
        } catch {
          shown = false;
        }
        if (!shown) {
          cleanup();
          return await OnScreenKeyboard.open(request);
        }
        timers.push(setTimeout(() => dismiss({ submitted: false }), TEXT_INPUT_LIMIT_MS));
        const payload = await dismissed;
        const submitted = payload.submitted === true;
        return {
          value: submitted && typeof payload.text === 'string' ? payload.text : request.value,
          canceled: !submitted,
        };
      } finally {
        try {
          cleanup();
        } finally {
          pending = false;
        }
      }
    },
  };
}

/**
 * Kayan oyun kumandası klavyesini açar — metin odaklı DOM alanına
 * doğrudan yazılır, `blur`'lu `TextEntryProvider` akışına girmez. Oyun
 * alanın ekran dikdörtgenini verir; klavye onu kaplamayacak şekilde
 * konumlanır. Kapanış `vol-steamworks:floating-dismissed` olayıdır.
 */
export async function showSteamFloatingKeyboard(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<boolean> {
  return (await probe.invoke('show_floating_input', rect)) as boolean;
}

export async function onSteamFloatingKeyboardDismissed(onDismiss: () => void): Promise<UnlistenFn> {
  return probe.listen('vol-steamworks:floating-dismissed', () => onDismiss());
}
