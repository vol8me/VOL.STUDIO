/**
 * Bacaklı yürüyücünün fiziği. Birimler `TANK` ile aynıdır (1 m = 32 birim, saniye, radyan).
 * Yürüyücü paletli araçtan iki yerde ayrışır: her yöne (yan kayarak, geri geri) aynı çevikliğiyle
 * yürür ve gövdesi nişan yönüne bakar; hızlanması ise kısa bir atılımdır.
 *
 * Bacaklar yalnızca sunumdur: yürüyüş döngüsü görünümde yüzeye basan ayaklardan türer, ağ durumuna
 * girmez. Bu yüzden `trackOffset` bacak sırasının gövde ekseninden uzaklığıdır ve yalnızca yan
 * yüzey yolunu (iz, toz, kar ezilmesi) besler.
 */
export const WALKER = {
  mass: 1700,
  /** Gövde ayak izi (yarı boy, yarı en): bacak açıklığı değil, çarpışan gövde. */
  halfLength: 24,
  halfWidth: 22,
  trackOffset: 13,

  /**
   * Düz zeminde yürüyüş tavanı (birim/s) ve komutun hızı hedefe çekme ivmesi (birim/s²). Tavan
   * yürüyüş döngüsünün kapasitesiyle sınırlıdır: sanat uzayında ~440 px/s'nin üstünde ayaklar
   * gövdeye yetişemez ve acil adıma düşer (`GAIT`, ölçüm: `tests/view/walker/ArachnidLegs.test.ts`).
   */
  maxSpeed: 150,
  acceleration: 1250,
  /** Komut bırakılınca ya da hedef hıza göre fazla hızlıyken yavaşlama ivmesi. */
  braking: 1700,
  /** Atılım: tavan çarpanı ve atılırken ivme. */
  dashMultiplier: 1.9,
  dashAcceleration: 2600,
  /**
   * Zemin tutuşunun ivme ve hızı kısma oranı (0 hiç etkilemez, 1 palet gibi tam etkiler). Bacak
   * ayağını kaygan zemine bastığı yerden seçer; palet kadar kaymaz.
   */
  gripSensitivity: 0.55,

  /** Gövde yönünün nişana (nişan yoksa harekete) dönme hızı tavanı, ivmesi ve hata kazancı. */
  maxTurnRate: 2.7,
  turnAcceleration: 16,
  steerGain: 6,
  /** Komutun bu uzunluğun altındaki hareketi yön belirlemez (gövde olduğu yerde kalır). */
  moveDeadzone: 0.2,

  boostCapacity: 90,
  boostDrain: 52,
  boostRegen: 17,
  boostRestart: 24,

  wallRestitution: 0.3,
  wallFriction: 0.35,
  impactEventSpeed: 28,
  impactKick: 0.1,

  /** Silah yuvaları gövdeden bağımsız ve hızlı döner; gövde nişanı geriden izler. */
  turretTurnRate: 5.2,
} as const;

/** Sayı tablosunun biçimi: yürüyücü varyantları aynı alanları başka değerlerle doldurur. */
export type WalkerConfig = { readonly [K in keyof typeof WALKER]: number };
