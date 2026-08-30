/**
 * Dokunsal geri bildirim (titreşim).
 *
 * **Neden Phaser değil?** Phaser'ın titreşim yüzeyi yoktur; yalnızca bazı
 * sürümlerde gamepad rumble bulunur ve o da ekran dokunuşuyla ilgisizdir.
 * Tarayıcı/WebView tarafında karşılığı Vibration API'dir (`navigator.vibrate`)
 * ve Android WebView'de desteklenir. iOS Safari/WKWebView desteklemez; bu
 * yüzden çağrılar sessizce yok sayılabilir olmalıdır — titreşimin olmaması
 * bir hata değil, o platformun gerçeğidir.
 *
 * **Neden anlamlandırılmış desenler?** Çağrı yerlerine ham milisaniye dizileri
 * yazmak, aynı etkileşimin iki ekranda farklı hissetmesine yol açar. Desenler
 * burada tek yerde tanımlanır; çağıran NİYETİ söyler (`'tap'`, `'error'`),
 * süreyi değil.
 *
 * **Neden bir açma/kapama anahtarı?** Titreşim bir erişilebilirlik ve pil
 * meselesidir; kullanıcı kapatabilmelidir. Varsayılan KAPALIDIR: tüketici
 * ayarını yükleyip açıkça açar, böylece hiçbir oyun istemeden titremeye
 * başlamaz.
 */

/**
 * Titreşimi gerçekten üretebilen katman.
 *
 * - `vibration` — `navigator.vibrate`. Android WebView ve mobil tarayıcılar.
 * - `gamepad` — bağlı bir oyun kolunun `vibrationActuator`'ı. Masaüstünde ve
 *   Steam Deck'te titreşimin TEK gerçek kaynağı budur; klavye/fare titremez.
 * - `none` — hiçbir kaynak yok. Ayarın sunulması anlamsızdır.
 */
export type HapticsBackend = 'vibration' | 'gamepad' | 'none';

export interface HapticsCapability {
  /** Şu anda titreşim üretilebilir mi. */
  readonly supported: boolean;
  /** Üretecek katman — teşhis ve UI metni için. */
  readonly backend: HapticsBackend;
}

/** Niyet adları — süreler tek yerde, çağıran yalnızca anlamı söyler. */
export type HapticPattern = 'tap' | 'select' | 'success' | 'warning' | 'error';

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

const lastFiredAt = new Map<HapticPattern, number>();
const capabilityListeners = new Set<(capability: HapticsCapability) => void>();
let capabilityWatchers: (() => void) | null = null;
let lastCapability: HapticsCapability | null = null;

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

function hasVibrationApi(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
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
  if (hasVibrationApi()) return { supported: true, backend: 'vibration' };
  if (findHapticGamepad()) return { supported: true, backend: 'gamepad' };
  return { supported: false, backend: 'none' };
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
  const notify = (): void => {
    const capability = getHapticsCapability();
    // Aynı durum tekrar bildirilmez: bağlanma olayı birden çok kez gelebilir.
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
  };

  window.addEventListener('gamepadconnected', notify);
  window.addEventListener('gamepaddisconnected', notify);
  capabilityWatchers = () => {
    window.removeEventListener('gamepadconnected', notify);
    window.removeEventListener('gamepaddisconnected', notify);
  };
  lastCapability = getHapticsCapability();
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
 */
export function vibrate(pattern: HapticPattern): void {
  if (!enabled) return;
  const capability = getHapticsCapability();
  if (!capability.supported) return;

  // Salkım bastırma: aynı desen kısıt penceresi içinde tekrar istenirse
  // sessizce düşer (bkz. MIN_INTERVAL_MS).
  const timestamp = now();
  const previous = lastFiredAt.get(pattern);
  if (previous !== undefined && timestamp - previous < MIN_INTERVAL_MS[pattern]) return;
  lastFiredAt.set(pattern, timestamp);

  if (capability.backend === 'vibration') {
    try {
      navigator.vibrate([...PATTERNS[pattern]]);
    } catch {
      // bkz. cancelHaptics — titreşim asla hata yüzeyi olmamalı.
    }
    return;
  }

  playGamepadPattern(pattern);
}

/** Deseni oyun kolunun süre+şiddet sözleşmesine çevirir. */
function playGamepadPattern(pattern: HapticPattern): void {
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
      strongMagnitude: intensity.strong,
      weakMagnitude: intensity.weak,
    }),
  ).catch(() => {
    // Tarayıcı efekti reddedebilir (izin, desteklenmeyen tip); sessiz kal.
  });
}
