/**
 * Gövdenin bir karedeki durumu — onu tüketen her katmanın ortak sözlüğü.
 *
 * Tek üretici (gövde), tek şekil: aynı gerçeğin tüketici başına ayrı nesnelerle
 * taşınması, bir alanın birimi değiştiğinde diğerlerinin sessizce kaymasına
 * açıktır.
 *
 * İki YÖN ayrı taşınır ve karıştırılmamalıdır: `travelHeadingRad` gövdenin
 * GİTTİĞİ, `facingHeadingRad` BAKTIĞI yöndür. Sert dönüşte ayrışırlar; tempo ve
 * yürüyüş öngörüsü seyahate, gövde-yerel dönüşümler bakışa bakar.
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
   * [0,1] duvar çarpmasının SÖNEN yankısı — çarpma tek karelik bir olaydır,
   * uzuvların görebilmesi için birkaç kare yaşaması gerekir.
   */
  impact01: number;
  /**
   * Ayaklar yerde mi? Alan bir SORU sorar, sebep bildirmez ("atılıyor mu?"
   * değil): yeni bir yerden-kesme sebebi geldiğinde tüketiciler değişmez.
   */
  grounded: boolean;
}

/**
 * İkincil hareketin ürettiği, uzuvların tükettiği poz sinyalleri.
 * `LocomotionSignals`ten ayrıdır: gövdenin durumu değil, ondan türetilmiş
 * SUNUM kararlarıdır.
 */
export interface PoseSignals {
  /** [0,1] hareket temposu — uzuv duruşu ve bakış uyanıklığı bunu tüketir. */
  motion01: number;
  /** [0,1] çömelme — dururken 1'e, yürürken 0'a gider. */
  crouch01: number;
}
