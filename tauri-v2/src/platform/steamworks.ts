import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  OnScreenKeyboard,
  type GlyphFamilyContext,
  type IStorageAdapter,
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
export function createSteamworksTextEntryProvider(): TextEntryProvider {
  let pending = false;
  return {
    async open(request: TextEntryRequest): Promise<TextEntryResult> {
      if (pending) return { value: request.value, canceled: true };
      pending = true;
      const currentProbe = probe;
      let unlisten: UnlistenFn | undefined;
      const cleanup = () => {
        const remove = unlisten;
        unlisten = undefined;
        remove?.();
      };
      try {
        let dismiss!: (payload: TextInputPayload) => void;
        const dismissed = new Promise<TextInputPayload>((resolve) => (dismiss = resolve));
        let shown = false;
        try {
          unlisten = await currentProbe.listen('vol-steamworks:text-input', (payload) => {
            dismiss((payload ?? {}) as TextInputPayload);
          });
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

const CLOUD_PREFIX = 'v2_';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** `btoa` Latin-1 sınırlıdır; UTF-8 metni önce bayta çevrilir. */
function toB64Url(text: string): string {
  let bin = '';
  for (const b of encoder.encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return decoder.decode(bytes);
}

function toB64(text: string): string {
  let bin = '';
  for (const b of encoder.encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return decoder.decode(bytes);
}

/** Kayıt anahtarı → güvenli bulut dosya adı (yol/özel karakter taşımaz). */
export function cloudFileName(key: string): string {
  return `${CLOUD_PREFIX}${toB64Url(key)}`;
}

/** Bulut dosya adı → kayıt anahtarı; `v2_` taşımayanlar `null`. */
export function cloudFileKey(name: string): string | null {
  if (!name.startsWith(CLOUD_PREFIX)) return null;
  try {
    return fromB64Url(name.slice(CLOUD_PREFIX.length));
  } catch {
    return null;
  }
}

/**
 * Steam Cloud (`IRemoteStorage`) üzerinden `IStorageAdapter`. `synced`
 * kapsamına takılır; değerler JSON metni olarak base64'lenir.
 * Yedek/atomiklik Steam istemcisinin kendi senkronizasyonundadır — bu
 * katman `file.write`ın boolean sonucunu döndürür.
 */
export function createSteamCloudAdapter(): IStorageAdapter & {
  keys(): Promise<readonly string[]>;
} {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const data = (await probe.invoke('cloud_read', {
        name: cloudFileName(key),
      })) as string | null;
      if (data == null) return undefined;
      const json = JSON.parse(fromB64(data)) as T;
      return json;
    },
    async set<T>(key: string, value: T): Promise<void> {
      await probe.invoke('cloud_write', {
        name: cloudFileName(key),
        dataBase64: toB64(JSON.stringify(value)),
      });
    },
    async remove(key: string): Promise<void> {
      await probe.invoke('cloud_delete', { name: cloudFileName(key) });
    },
    async keys(): Promise<readonly string[]> {
      const files = (await probe.invoke('cloud_list')) as { name: string }[];
      return files.map((f) => cloudFileKey(f.name)).filter((k): k is string => k != null);
    },
  };
}
