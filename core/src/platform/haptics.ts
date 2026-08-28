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

const lastFiredAt = new Map<HapticPattern, number>();

let enabled = false;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Cihaz/tarayıcı titreşimi destekliyor mu. */
export function isHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
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
  if (!isHapticsSupported()) return;
  // Desteklenmeyen platformda `vibrate` yok; destekleniyorsa 0 iptal demektir.
  try {
    navigator.vibrate(0);
  } catch {
    // Bazı tarayıcılar kullanıcı etkileşimi olmadan çağrıyı reddeder;
    // titreşimin başarısız olması akışı kesmemeli.
  }
}

/**
 * Adlandırılmış deseni oynatır. Kapalıysa ya da platform desteklemiyorsa
 * sessizce hiçbir şey yapmaz — çağıran koşul yazmak zorunda değildir.
 */
export function vibrate(pattern: HapticPattern): void {
  if (!enabled || !isHapticsSupported()) return;

  // Salkım bastırma: aynı desen kısıt penceresi içinde tekrar istenirse
  // sessizce düşer (bkz. MIN_INTERVAL_MS).
  const timestamp = now();
  const previous = lastFiredAt.get(pattern);
  if (previous !== undefined && timestamp - previous < MIN_INTERVAL_MS[pattern]) return;
  lastFiredAt.set(pattern, timestamp);

  try {
    navigator.vibrate([...PATTERNS[pattern]]);
  } catch {
    // bkz. cancelHaptics — titreşim asla hata yüzeyi olmamalı.
  }
}
