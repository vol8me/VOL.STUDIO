/**
 * Gövdenin bir karedeki durumu — onu TÜKETEN her katmanın ortak sözlüğü.
 *
 * Bu tip bir kolaylık değil, bir SÖZLEŞMEDİR. Sinyaller bir dönem tüketici
 * başına elle kurulan ayrı nesnelerdi (`BodyMotionState`, `LimbDriveState`) ve
 * aynı gerçeğin iki farklı şeklini taşıyorlardı: `turnRate` üç ayrı tüketiciye
 * ham sayı olarak gidiyordu, biri birimini değiştirse diğer ikisi sessizce
 * kayardı. Tek bir üretici (gövde) ve tek bir şekil bunu imkânsız kılar.
 *
 * İki YÖN ayrı taşınır ve karıştırılmamalıdır:
 *
 * - `travelHeadingRad` gövdenin gerçekten GİTTİĞİ yöndür (hızın yönü).
 * - `facingHeadingRad` gövdenin BAKTIĞI yöndür; dönüş yayı onu geriden getirir.
 *
 * Sert bir dönüşte ikisi belirgin biçimde ayrışır. Hareket temposu ve yürüyüş
 * öngörüsü SEYAHATE, gövde-yerel dönüşümler (yaslanma, rig dönüşü) BAKIŞA
 * bakar. Tek bir "yön" alanı bu ayrımı gizler ve yanlış tarafın kullanıldığı
 * yerde hata görsel bir tuhaflık olarak, kaynağından uzakta görünür.
 */
export interface LocomotionSignals {
  /** Gövde merkezinin dünya konumu. */
  x: number;
  y: number;
  /** Dünya-uzayı hızı (px/s) — yürüyüş öngörüsü bunu tüketir. */
  velX: number;
  velY: number;
  /** Hızın büyüklüğü (px/s). */
  speed: number;
  /** Dünya-uzayı ivmesi (px/s²) — gövde yaslanmasının kaynağı. */
  accelX: number;
  accelY: number;
  /** Gövdenin gerçekten GİTTİĞİ yön; duruyorken son bakış yönüne düşer. */
  travelHeadingRad: number;
  /** Gövdenin BAKTIĞI yön — yay ile yumuşatılmış görsel yön. */
  facingHeadingRad: number;
  /** Dönüşün anlık şiddeti (rad/s). */
  turnRateRadPerSec: number;
  /** [0,1] atılım şiddeti — sert `isDashing` anahtarının yumuşatılmış hâli. */
  dash01: number;
  /**
   * Ayaklar yerde mi?
   *
   * Bugün yalnız atılım gövdeyi yerden keser, ama alan bir SORU sorar
   * ("yerde mi?"), bir sebep bildirmez ("atılıyor mu?"). Zıplama, sendeleme ya
   * da geri savrulma eklendiğinde tüketicilerin hiçbiri değişmez; yalnız bu
   * alanı yazan yer değişir.
   */
  grounded: boolean;
}

/**
 * İkincil hareketin ürettiği ve uzuvların tükettiği poz sinyalleri.
 *
 * `LocomotionSignals`ten AYRI durur çünkü kaynağı farklıdır: bunlar gövdenin
 * fiziksel durumu değil, o durumdan türetilmiş SUNUM kararlarıdır.
 */
export interface PoseSignals {
  /** [0,1] hareket temposu — uzuv duruşu ve bakış uyanıklığı bunu tüketir. */
  motion01: number;
  /** [0,1] çömelme — dururken 1'e, yürürken 0'a gider. */
  crouch01: number;
}
