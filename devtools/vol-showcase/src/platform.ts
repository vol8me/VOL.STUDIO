import { ScopedSaveManager, type ScopedKey, type ScopedStores } from '@volstudio/core/persistence';
import {
  displayCapabilitiesForSession,
  type SessionDisplayCapabilities,
} from '@volstudio/core/platform';
import {
  createScopedStores,
  DisplayModeController,
  getRuntimePlatform,
  getSessionKind,
  observeAndroidHaptics,
  observeLinuxHaptics,
  type RuntimePlatform,
  type SessionKind,
} from '@volstudio/tauri-v2';

export type DisplayMode = 'windowed' | 'fullscreen';

export interface DisplayPreferences {
  readonly mode: DisplayMode;
  /** `GENİŞLİKxYÜKSEKLİK`; yalnız pencereli kipte uygulanır. */
  readonly resolution: string;
}

/** Ekran başına tercih: `device` kapsamı, buluta gitmez. */
export const DISPLAY_KEY: ScopedKey = 'device.volui:display';
export const DISPLAY_RESOLUTIONS = ['1280x800', '1920x1080', '2560x1440', '3840x2160'] as const;
export const DEFAULT_DISPLAY: DisplayPreferences = { mode: 'windowed', resolution: '1280x800' };

/** Native pencereyi süren yüzey; testte sahtesi verilir. */
export type DisplayDriver = Pick<DisplayModeController, 'start' | 'toggle' | 'flush' | 'destroy'>;
type DisplayOptions = ConstructorParameters<typeof DisplayModeController>[0];

/** Dış dünyadan gelen her şey enjekte edilebilir: gerçek kabuk varsayılandır, testte sahte verilir. */
export interface PlatformProbes {
  readonly platform?: () => RuntimePlatform;
  readonly session?: () => Promise<SessionKind>;
  readonly createStores?: (id: string) => ScopedStores;
  readonly createDisplay?: (options: DisplayOptions) => DisplayDriver;
  /** Titreşim sürücüsü gözlemcileri; her biri sökme işlevi döner. */
  readonly observeHaptics?: readonly (() => () => void)[];
}

/** Bozuk, eski ya da yabancı kayıt varsayılana iner; kısmi geçerli alan korunur. */
export function sanitizeDisplay(raw: unknown): DisplayPreferences {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const mode =
    record.mode === 'windowed' || record.mode === 'fullscreen' ? record.mode : DEFAULT_DISPLAY.mode;
  const resolution = DISPLAY_RESOLUTIONS.find((known) => known === record.resolution);
  return { mode, resolution: resolution ?? DEFAULT_DISPLAY.resolution };
}

function parseResolution(resolution: string): { width: number; height: number } {
  const [width, height] = resolution.split('x').map(Number);
  return { width, height };
}

/**
 * Vitrinin gerçek platform bağı: kabuk türü, oturum sınıfı, ekran başına tercih deposu, native pencere
 * ve titreşim sürücüleri tek yerde kurulur ve tek yerden sökülür.
 *
 * - **Web (`pnpm dev`, tarayıcı):** oturum `web`, depo localStorage, native pencere YOK — tam ekranı
 *   `ShowcaseApp`ın kendi `FullscreenController`ı sürer (tarayıcı jestsiz tam ekrana izin vermez, bu
 *   yüzden tercih açılışta uygulanmaz).
 * - **Masaüstü native:** `DisplayModeController` Tauri penceresini sürer; kip/çözünürlük tercihi `device`
 *   kapsamında kalır, F11/pencere yöneticisi değişimi tercihe geri yazılır.
 * - **gamescope:** pencere kipi ve çözünürlük yetenek tablosundan sunulmaz; pencere denetleyicisi kurulmaz.
 * - **Android:** pencere kipi yoktur (sistem çubukları); yalnız titreşim sürücüsü kurulur.
 */
export class PlatformServices {
  readonly capabilities: SessionDisplayCapabilities;
  /** Native pencere sürücüsü; web, Android ve gamescope'ta `null`. */
  readonly display: DisplayDriver | null;
  private preferences: DisplayPreferences = DEFAULT_DISPLAY;
  private readonly listeners = new Set<() => void>();
  private readonly stops: (() => void)[] = [];
  private destroyed = false;

  private constructor(
    readonly platform: RuntimePlatform,
    readonly session: SessionKind,
    readonly stores: ScopedSaveManager,
    probes: PlatformProbes,
  ) {
    this.capabilities = displayCapabilitiesForSession(session);
    const wantsWindow = platform === 'desktop' && this.capabilities.windowMode;
    const create =
      probes.createDisplay ?? ((options: DisplayOptions) => new DisplayModeController(options));
    this.display = wantsWindow
      ? create({
          getMode: () => this.preferences.mode,
          setMode: (mode) => this.update({ mode }),
          subscribe: (listener) => this.subscribe(listener),
          getWindowedSize: () => parseResolution(this.preferences.resolution),
        })
      : null;
    const observers = probes.observeHaptics ?? [observeLinuxHaptics, observeAndroidHaptics];
    for (const observe of observers) this.stops.push(observe());
  }

  /** Bildirilen kabuk ve oturumla eşzamanlı kurulum; tercih yüklenmez (testlerde ve `boot`ta kullanılır). */
  static create(
    platform: RuntimePlatform,
    session: SessionKind,
    stores: ScopedSaveManager,
    probes: PlatformProbes = {},
  ): PlatformServices {
    return new PlatformServices(platform, session, stores, probes);
  }

  /** Gerçek kabuk bildirimi; yedekler `tauri-v2`nin web yollarıdır. */
  static async boot(probes: PlatformProbes = {}): Promise<PlatformServices> {
    const platform = (probes.platform ?? getRuntimePlatform)();
    const session = await (probes.session ?? getSessionKind)();
    const stores = new ScopedSaveManager(
      (probes.createStores ?? ((id) => createScopedStores(id)))('volui'),
    );
    const services = PlatformServices.create(platform, session, stores, probes);
    try {
      services.preferences = sanitizeDisplay(await stores.load<unknown>(DISPLAY_KEY, null));
    } catch (error) {
      console.warn('[VOL.UI] Görüntü tercihi okunamadı, varsayılan kullanılır:', error);
    }
    await services.display?.start();
    return services;
  }

  get native(): boolean {
    return this.platform !== 'web';
  }

  get displayPreferences(): DisplayPreferences {
    return this.preferences;
  }

  /** Tercih değişince çağrılır; dönen işlev aboneliği kaldırır. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Aynı değer bildirim ve yazım üretmez: F11 → tercih → uygulama döngüsü kapanır. */
  update(patch: Partial<DisplayPreferences>): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    const next = sanitizeDisplay({ ...this.preferences, ...patch });
    if (next.mode === this.preferences.mode && next.resolution === this.preferences.resolution) {
      return Promise.resolve();
    }
    this.preferences = next;
    for (const listener of [...this.listeners]) listener();
    return this.stores.save(DISPLAY_KEY, next).catch((error: unknown) => {
      console.warn('[VOL.UI] Görüntü tercihi yazılamadı:', error);
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.display?.destroy();
    for (const stop of this.stops.splice(0)) stop();
    this.listeners.clear();
  }
}

/** Sekmelerin ve kabuğun gördüğü yüzey: yaşam döngüsü (`destroy`) yalnız sahibindedir. */
export type PlatformView = Pick<
  PlatformServices,
  | 'platform'
  | 'session'
  | 'native'
  | 'stores'
  | 'capabilities'
  | 'display'
  | 'displayPreferences'
  | 'update'
  | 'subscribe'
>;
