/**
 * Android donanım/jest "geri" hareketinin uygulama içindeki karşılığı.
 *
 * Native taraf (bkz. `MainActivity.onWebViewCreate`) geri basışını
 * `vol:androidback` olayına çevirir ve uygulamayı KENDİ BAŞINA kapatmaz.
 * Karar buraya düşer: hangi ekran açıksa o ekranın işleyicisi çalışır.
 *
 * İşleyiciler yığın gibi tutulur ve SON kayıt olan ilk denenir; bir işleyici
 * `true` dönerse olay tüketilmiş sayılır. Böylece bir sahne açıkken üstüne
 * binen geçici bir yüzey (ayarlar paneli, onay kutusu) geri tuşunu önce
 * kendisi karşılayabilir.
 *
 * Hiçbir işleyici sahiplenmezse HİÇBİR ŞEY olmaz — geri tuşunun sessizce
 * uygulamayı kapatması, kullanıcının oturumunu tek jestle kaybetmesi demekti.
 *
 * CORE'da yaşar çünkü mekanizma oyun kelimesi taşımaz: hangi yüzeyin geri
 * tuşunu sahipleneceğine tüketici karar verir. İki oyunun ayrı kopya tutması
 * aynı native olayı iki farklı sözleşmeyle yorumlamak demekti.
 */

export type BackHandler = () => boolean;

interface BackHandlerEntry {
  readonly handler: BackHandler;
}

const handlers: BackHandlerEntry[] = [];
let listening = false;

function onAndroidBack(): void {
  // İşleyici kendi kaydını veya alttaki bir kaydı kaldırabilir. Canlı dizi
  // üzerinde geriye yürümek bu durumda aynı handler'ı iki kez çağırabiliyor;
  // tek geri olayı başlangıçtaki yığının değişmez snapshot'ını görür.
  const snapshot = handlers.slice().reverse();
  for (const entry of snapshot) {
    // Snapshot alındıktan sonra kaldırılmış bir handler artık sahip değildir.
    if (!handlers.includes(entry)) continue;
    try {
      if (entry.handler()) return;
    } catch (error) {
      // Bozuk bir üst yüzey, alttaki güvenli navigasyon kapısını kilitlemesin.
      console.error('[backNavigation] Android geri işleyicisi başarısız:', error);
    }
  }
}

function ensureListening(): void {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('vol:androidback', onAndroidBack);
  // Kayıt host tarafından reddedilirse bayrak false kalmalı; aksi hâlde
  // sonraki işleyiciler listener var sanıp geri hareketini tamamen yitirir.
  listening = true;
}

function stopListeningWhenIdle(): void {
  if (!listening || handlers.length > 0 || typeof window === 'undefined') return;
  try {
    window.removeEventListener('vol:androidback', onAndroidBack);
  } finally {
    listening = false;
  }
}

/** İşleyiciyi yığına ekler; kaldırma fonksiyonunu döner. */
export function pushBackHandler(handler: BackHandler): () => void {
  ensureListening();
  const entry: BackHandlerEntry = { handler };
  handlers.push(entry);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const index = handlers.lastIndexOf(entry);
    if (index >= 0) handlers.splice(index, 1);
    stopListeningWhenIdle();
  };
}

/** Testler için: kayıtlı işleyici sayısı. */
export function backHandlerCount(): number {
  return handlers.length;
}
