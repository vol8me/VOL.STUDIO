/**
 * Dokunsal geri bildirim (titreşim).
 *
 * Phaser'ın titreşim yüzeyi yoktur. Native kabuk sürücüsü önceliklidir;
 * mobil tarayıcı Vibration API'ye, masaüstü bağlı oyun koluna geri düşer.
 * Bütün çağrılar sessizce yok sayılabilir olmalıdır.
 *
 * Desenler burada tek yerde tanımlanır; çağıran NİYETİ söyler (`'tap'`,
 * `'error'`), süreyi değil. Çağrı yerlerine ham milisaniye dizileri yazmak
 * aynı etkileşimi iki ekranda farklı hissettirirdi.
 *
 * **Varsayılan KAPALIDIR.** Titreşim bir erişilebilirlik ve pil meselesidir;
 * tüketici ayarını yükleyip açıkça açar.
 */

/**
 * Titreşimi gerçekten üretebilen katman.
 *
 * - `native` — kabuğun kaydettiği Android veya Linux sürücüsü.
 * - `vibration` — `navigator.vibrate`. Mobil tarayıcılar.
 * - `gamepad` — native sürücü yoksa bağlı kolun `vibrationActuator`'ı;
 *   klavye/fare titremez.
 * - `none` — hiçbir kaynak yok. Ayarın sunulması anlamsızdır.
 */
export type HapticsBackend = 'native' | 'vibration' | 'gamepad' | 'none';

export interface HapticsCapability {
  /** Şu anda titreşim üretilebilir mi. */
  readonly supported: boolean;
  /** Üretecek katman — teşhis ve UI metni için. */
  readonly backend: HapticsBackend;
}

/** Niyet adları — süreler tek yerde, çağıran yalnızca anlamı söyler. */
export type HapticPattern = 'tap' | 'select' | 'success' | 'warning' | 'error';

export interface HapticsDriver {
  /** `intensity` 0–1: desenin şiddet çarpanı (bkz. `vibrate`). */
  play(pattern: HapticPattern, intensity?: number): void | Promise<void>;
  cancel?(): void | Promise<void>;
}

/**
 * Desen tabloları milisaniye dizisidir: [titreşim, duraklama, titreşim…].
 *
 * Değerler kısa tutulur (≤ 40 ms tek darbe): oyun içi bir düğmede uzun
 * titreşim eli yorar ve sonraki dokunuşu geciktirir.
 */
const PATTERNS: Readonly<Record<HapticPattern, readonly number[]>> = {
  tap: [12],
  select: [18],
  success: [14, 40, 14],
  warning: [26, 60, 26],
  error: [40, 50, 40],
};

/**
 * Aynı desenin en sık tekrar aralığı, ms.
 *
 * Oyun olayları salkım hâlinde gelir: saniyede on mermi, arka arkaya beş
 * düşman ölümü. Her birine titremek eli uyuşturur ve motoru sürekli meşgul
 * eder — kullanıcının "rahatsız etmesin" dediği tam olarak budur. Kısıt
 * DESEN BAŞINA uygulanır: hasar geri bildirimi, ateş salkımı yüzünden
 * yutulmamalıdır.
 */
const MIN_INTERVAL_MS: Readonly<Record<HapticPattern, number>> = {
  tap: 90,
  select: 60,
  success: 200,
  warning: 200,
  error: 300,
};

/**
 * Oyun kolu için desen başına titreşim şiddeti (0–1).
 *
 * Titreşim motoru bir ms dizisi değil, SÜRE + ŞİDDET ister. Niyet tablosu tek
 * kaynak kalsın diye şiddet de burada tanımlanır; çağıran yine yalnız niyeti
 * söyler. `strong` düşük frekanslı büyük motor, `weak` yüksek frekanslı küçük
 * motordur — ikisi birlikte "sert vuruş" ile "hafif dokunuş"u ayırır.
 */
const GAMEPAD_INTENSITY: Readonly<Record<HapticPattern, { strong: number; weak: number }>> = {
  tap: { strong: 0, weak: 0.25 },
  select: { strong: 0, weak: 0.4 },
  success: { strong: 0.25, weak: 0.5 },
  warning: { strong: 0.5, weak: 0.4 },
  error: { strong: 0.85, weak: 0.6 },
};

/**
 * Native sürücüye giden tek darbe. `gapAfterMs` sonraki darbeye dek bekleme.
 *
 * `PATTERNS` + `GAMEPAD_INTENSITY`'nin birleşik görünümüdür: JS sürücüleri
 * tek `playEffect` çağrısına çökerken evdev/HD Rumble gibi motorları doğrudan
 * süren kabuklar darbe dizisini sırayla oynatır. İki okuma aynı tablodan
 * türer; birini değiştiren diğerini de değiştirir.
 */
export interface RumblePulse {
  /** Büyük (düşük frekanslı) motor şiddeti, 0–1. */
  readonly strong: number;
  /** Küçük (yüksek frekanslı) motor şiddeti, 0–1. */
  readonly weak: number;
  readonly durationMs: number;
  readonly gapAfterMs: number;
}

/**
 * Deseni native sürücülerin oynatacağı darbe dizisine çevirir. `intensity`
 * (0–1) motor şiddetlerini ölçekler; süreler desenin kendisidir.
 */
export function planRumblePulses(pattern: HapticPattern, intensity = 1): readonly RumblePulse[] {
  const durations = PATTERNS[pattern];
  const motors = GAMEPAD_INTENSITY[pattern];
  const scale = clampIntensity(intensity);
  const pulses: RumblePulse[] = [];
  for (let i = 0; i < durations.length; i += 2) {
    pulses.push({
      strong: motors.strong * scale,
      weak: motors.weak * scale,
      durationMs: durations[i],
      gapAfterMs: durations[i + 1] ?? 0,
    });
  }
  return pulses;
}

/** Şiddet [0, 1] aralığına kelepçelenir; sonlu olmayan değer tam şiddettir. */
function clampIntensity(intensity: number): number {
  return Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 1;
}

/** Vibration API genlik taşımaz: şiddet titreşim sürelerini kısaltır. */
const MIN_VIBRATION_MS = 4;

const lastFiredAt = new Map<HapticPattern, number>();
const capabilityListeners = new Set<(capability: HapticsCapability) => void>();
let capabilityWatchers: (() => void) | null = null;
let lastCapability: HapticsCapability | null = null;
let platformDriver: HapticsDriver | null = null;

let enabled = false;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

interface HapticActuator {
  playEffect?: (type: string, params: Record<string, number>) => Promise<unknown>;
  reset?: () => Promise<unknown>;
}

interface HapticGamepad {
  connected?: boolean;
  vibrationActuator?: HapticActuator | null;
}

const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod/i;

/**
 * Titreşim motoru olan cihazın Vibration API'si. Masaüstü Chromium ve WebView2
 * `navigator.vibrate`i TANIMLAR ama çağrı hiçbir şey yapmaz; yalnız API'ye bakmak
 * masaüstünde işe yaramayan bir ayar gösteriyordu. Mobil ipucu (UA-CH) yoksa
 * kullanıcı ajanına bakılır.
 */
function hasVibrationApi(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  const hints = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  return hints?.mobile === true || MOBILE_USER_AGENT.test(navigator.userAgent);
}

/** Titreşim motoru olan İLK bağlı oyun kolu. */
function findHapticGamepad(): HapticActuator | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  let pads: (HapticGamepad | null)[] = [];
  try {
    pads = navigator.getGamepads() as unknown as (HapticGamepad | null)[];
  } catch {
    // Bazı tarayıcılar izin/gizlilik kısıtıyla fırlatır; titreşim yokluğu
    // hata yüzeyi olmamalı.
    return null;
  }
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;
    const actuator = pad.vibrationActuator;
    if (actuator && typeof actuator.playEffect === 'function') return actuator;
  }
  return null;
}

/**
 * Şu anki titreşim yeteneği.
 *
 * **Neden çalışma anında ölçülür:** oyun kolu oyun ortasında takılıp
 * çıkarılabilir. Açılışta bir kez bakıp karar vermek, kolunu sonradan takan
 * oyuncuya ayarı sonsuza dek kapalı gösterirdi.
 */
export function getHapticsCapability(): HapticsCapability {
  if (platformDriver) return { supported: true, backend: 'native' };
  if (hasVibrationApi()) return { supported: true, backend: 'vibration' };
  if (findHapticGamepad()) return { supported: true, backend: 'gamepad' };
  return { supported: false, backend: 'none' };
}

export function setHapticsDriver(driver: HapticsDriver | null): void {
  if (platformDriver === driver) return;
  platformDriver = driver;
  notifyCapabilityListeners();
}

/**
 * Yetenek değişimlerini izler — oyun kolu takıldı/çıkarıldı.
 *
 * UI bu aboneliğe bağlanarak titreşim ayarını CANLI etkinleştirir/pasifleştirir.
 * Dönen fonksiyon aboneliği kaldırır; son abone gidince tarayıcı dinleyicileri
 * de sökülür.
 */
export function observeHapticsCapability(
  listener: (capability: HapticsCapability) => void,
): () => void {
  capabilityListeners.add(listener);
  ensureCapabilityWatchers();
  listener(getHapticsCapability());

  return () => {
    capabilityListeners.delete(listener);
    if (capabilityListeners.size === 0) {
      capabilityWatchers?.();
      capabilityWatchers = null;
      lastCapability = null;
    }
  };
}

function ensureCapabilityWatchers(): void {
  if (capabilityWatchers || typeof window === 'undefined') return;
  window.addEventListener('gamepadconnected', notifyCapabilityListeners);
  window.addEventListener('gamepaddisconnected', notifyCapabilityListeners);
  capabilityWatchers = () => {
    window.removeEventListener('gamepadconnected', notifyCapabilityListeners);
    window.removeEventListener('gamepaddisconnected', notifyCapabilityListeners);
  };
  lastCapability = getHapticsCapability();
}

function notifyCapabilityListeners(): void {
  const capability = getHapticsCapability();
  if (
    lastCapability &&
    lastCapability.supported === capability.supported &&
    lastCapability.backend === capability.backend
  ) {
    return;
  }
  lastCapability = capability;
  for (const listener of capabilityListeners) {
    try {
      listener(capability);
    } catch (error) {
      console.warn('[haptics] Yetenek dinleyicisi hata verdi:', error);
    }
  }
}

/** Cihaz/tarayıcı titreşimi destekliyor mu (herhangi bir katmanla). */
export function isHapticsSupported(): boolean {
  return getHapticsCapability().supported;
}

/** Titreşimi açar/kapatır. Kapatıldığında bekleyen titreşim de iptal edilir. */
export function setHapticsEnabled(next: boolean): void {
  enabled = next;
  if (!next) {
    // Kısıt geçmişi de sıfırlanır: tekrar açıldığında ilk olay beklemeden
    // hissedilmeli.
    lastFiredAt.clear();
    cancelHaptics();
  }
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

/** Süren titreşimi keser — duraklatma/sahne geçişi gibi anlarda. */
export function cancelHaptics(): void {
  if (platformDriver) {
    callDriver(() => platformDriver?.cancel?.());
    return;
  }
  if (hasVibrationApi()) {
    try {
      // Vibration API'de 0 "iptal" demektir.
      navigator.vibrate(0);
    } catch {
      // Bazı tarayıcılar kullanıcı etkileşimi olmadan çağrıyı reddeder;
      // titreşimin başarısız olması akışı kesmemeli.
    }
  }

  const actuator = findHapticGamepad();
  if (actuator?.reset) {
    void Promise.resolve(actuator.reset()).catch(() => {
      // bkz. yukarısı — titreşim asla hata yüzeyi olmamalı.
    });
  }
}

/**
 * Adlandırılmış deseni oynatır. Kapalıysa ya da platform desteklemiyorsa
 * sessizce hiçbir şey yapmaz — çağıran koşul yazmak zorunda değildir.
 *
 * `intensity` (0–1, varsayılan 1) olayın şiddetidir: kolda motor genliğini,
 * Vibration API'de titreşim sürelerini ölçekler, native sürücüye iletilir.
 * Hafif bir çarpma ile sert bir çarpma aynı desenle farklı hissedilir.
 */
export function vibrate(pattern: HapticPattern, intensity = 1): void {
  if (!enabled) return;
  const scale = clampIntensity(intensity);
  if (scale <= 0) return;
  const capability = getHapticsCapability();
  if (!capability.supported) return;

  // Salkım bastırma: aynı desen kısıt penceresi içinde tekrar istenirse
  // sessizce düşer (bkz. MIN_INTERVAL_MS).
  const timestamp = now();
  const previous = lastFiredAt.get(pattern);
  if (previous !== undefined && timestamp - previous < MIN_INTERVAL_MS[pattern]) return;
  lastFiredAt.set(pattern, timestamp);

  if (capability.backend === 'native') {
    callDriver(() => platformDriver?.play(pattern, scale));
    return;
  }

  if (capability.backend === 'vibration') {
    try {
      navigator.vibrate(
        PATTERNS[pattern].map((value, index) =>
          index % 2 === 0 ? Math.max(MIN_VIBRATION_MS, Math.round(value * scale)) : value,
        ),
      );
    } catch {
      // bkz. cancelHaptics — titreşim asla hata yüzeyi olmamalı.
    }
    return;
  }

  playGamepadPattern(pattern, scale);
}

function callDriver(call: () => void | Promise<void> | undefined): void {
  try {
    void Promise.resolve(call()).catch(() => {});
  } catch {
    // Platform titreşimi oyun akışını kesmez.
  }
}

/** Deseni oyun kolunun süre+şiddet sözleşmesine çevirir. */
function playGamepadPattern(pattern: HapticPattern, scale: number): void {
  const actuator = findHapticGamepad();
  if (!actuator?.playEffect) return;

  // Desen [titreşim, duraklama, titreşim…] dizisidir; oyun kolu tek bir süre
  // ister. Toplam SÜRE deseni yansıtır, duraklamalar da dahil edilir ki
  // "üç darbe" hissi tek uzun darbeye çökmesin.
  const durations = PATTERNS[pattern];
  const totalMs = durations.reduce((sum, value) => sum + Math.max(0, value), 0);
  const intensity = GAMEPAD_INTENSITY[pattern];

  void Promise.resolve(
    actuator.playEffect('dual-rumble', {
      startDelay: 0,
      duration: Math.max(1, Math.round(totalMs)),
      strongMagnitude: intensity.strong * scale,
      weakMagnitude: intensity.weak * scale,
    }),
  ).catch(() => {
    // Tarayıcı efekti reddedebilir (izin, desteklenmeyen tip); sessiz kal.
  });
}
