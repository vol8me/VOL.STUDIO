/**
 * Gövdenin bir karedeki durumu: bacak yürüyüşü ve kabuğun ikincil hareketi aynı sözlüğü okur.
 * Uzunluklar sanat piksel uzayındadır (`WALKER_ART`); açılar atan2 uzayındadır.
 *
 * İki yön ayrı taşınır ve karıştırılmamalıdır: `travelHeadingRad` gövdenin gittiği,
 * `facingHeadingRad` baktığı yöndür. Gövde nişana bakıp yan yürüdüğünde ayrışırlar; tempo ve
 * yürüyüş öngörüsü seyahate, gövde-yerel dönüşümler bakışa bakar.
 */
export interface LocomotionSignals {
  /** Gövde merkezinin sanat uzayındaki konumu. */
  x: number;
  y: number;
  /** Hız (px/s): yürüyüş öngörüsü bunu tüketir. */
  velX: number;
  velY: number;
  speed: number;
  /** İvme (px/s²): gövde yaslanmasının kaynağı. */
  accelX: number;
  accelY: number;
  travelHeadingRad: number;
  facingHeadingRad: number;
  /** Dönüşün anlık şiddeti (rad/s). */
  turnRateRadPerSec: number;
  /** [0,1] atılım şiddeti: boost bayrağının yumuşatılmış hâli. */
  dash01: number;
  /** [0,1] duvar çarpmasının sönen yankısı: uzuvların görebilmesi için birkaç kare yaşar. */
  impact01: number;
}

/** İkincil hareketin ürettiği, uzuvların tükettiği sunum kararları. */
export interface PoseSignals {
  /** [0,1] hareket temposu: uzuv duruşu ve bakış uyanıklığı bunu tüketir. */
  motion01: number;
  /** [0,1] çömelme: dururken 1'e, yürürken 0'a gider. */
  crouch01: number;
}
