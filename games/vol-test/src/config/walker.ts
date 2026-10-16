/**
 * Bacaklı yürüyücünün fiziği. Birimler `TANK` ile aynıdır (1 m = 32 birim, saniye, radyan).
 * Yürüyücü paletli araçtan iki yerde ayrışır: her yöne (yan kayarak, geri geri) aynı çevikliğiyle
 * yürür ve gövdesi nişan yönüne bakar; hızlanması ise kısa bir atılımdır.
 *
 * Yürüyüş döngüsü yalnız sunumdur (ayaklar görünümde yüzeye basan noktalardan türer); fizikte yalnız
 * KIRIK bacaklar vardır (`Chassis.parts`, `config/parts.ts`). `trackOffset` bacak sırasının gövde
 * ekseninden uzaklığıdır ve yalnızca yan yüzey yolunu (iz, toz, kar ezilmesi) besler.
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
  /** Yetenek hızı: tavan çarpanı ve ivme; `dashPull` 0 ise yürüyüşü zorlamaz (kalkan); `leapTurnRate` havadaki hız yönünün dönüşü (rad/s). */
  dashMultiplier: 2.3,
  dashAcceleration: 3600,
  dashPull: 1,
  leapTurnRate: 1,
  /** Zemin tutuşunun ivme ve hızı kısma oranı (0 etkilemez, 1 palet gibi tam etkiler). */
  gripSensitivity: 0.55,

  /** Gövde yönünün harekete dönme hızı tavanı, ivmesi ve hata kazancı. */
  maxTurnRate: 3.3,
  turnAcceleration: 18,
  steerGain: 6,
  /** Gövde hedefe ters dönükken yürüyüş tavanının oranı (dönüklük arttıkça 1'e çıkar). */
  turnSpeedFloor: 0.5,
  /** Komutun bu uzunluğun altındaki hareketi yön belirlemez. */
  moveDeadzone: 0.2,

  /** Atılım deposu: kapasite/boşalma atılım süresi (~0,55 sn), dolum bekleme süresidir. */
  boostCapacity: 90,
  boostDrain: 165,
  boostRegen: 36,
  boostRestart: 90,

  wallRestitution: 0.3,
  wallFriction: 0.35,
  impactEventSpeed: 28,
  impactKick: 0.1,

  /** Silah yuvaları gövdeden bağımsız ve hızlı döner; gövde nişanı geriden izler. */
  turretTurnRate: 5.2,
} as const;

/** Sayı tablosunun biçimi: yürüyücü varyantları aynı alanları başka değerlerle doldurur. */
export type WalkerConfig = { readonly [K in keyof typeof WALKER]: number };
