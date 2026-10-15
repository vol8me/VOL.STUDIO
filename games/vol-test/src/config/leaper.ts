/**
 * Dört bacaklı sıçrayıcının (leaper) fiziği; birimler `TANK` ile aynıdır. Yürüyücüyle aynı sürüşü
 * paylaşır (komut hedef hız vektörüdür, gövde yürüdüğü yöne döner) ama üç yerde ayrışır:
 *
 * - Sıçrama: atılım (Space) bir sıçramadır. Depo kısa sürede boşalır; havadaki araç kayadan ve sudan
 *   geçer, suda boğulmaz ve balistik uçar: fırlatma yönünü yalnız `leapTurnRate` hızıyla çevirebilir.
 * - Sekme: yerde koşarken her sekmenin başında hız `strideDip` oranında düşüp toparlanır; sıçrayıcı
 *   mech gibi adım atmaz, ritimle atlar.
 * - Çeviklik: gövde yönünü yürüyücüden çabuk çevirir ama kütlesi hafiftir, sert çarpmada savrulur.
 */
export const LEAPER = {
  mass: 1300,
  /** Gövde ayak izi (yarı boy, yarı en): bacak açıklığı değil, çarpışan gövde. */
  halfLength: 24,
  halfWidth: 17,
  trackOffset: 12,

  /** Düz zeminde koşu tavanı (birim/s) ve komutun hızı hedefe çekme ivmesi (birim/s²). */
  maxSpeed: 205,
  acceleration: 1500,
  /** Komut bırakılınca ya da hedef hıza göre fazla hızlıyken yavaşlama ivmesi. */
  braking: 2000,
  /** Sıçrama: tavan çarpanı ve itilirken ivme (kalkış neredeyse anidir). */
  dashMultiplier: 2.35,
  dashAcceleration: 6000,
  /** Zemin tutuşunun ivme ve hızı kısma oranı. */
  gripSensitivity: 0.4,

  /** Gövde yönünün harekete dönme hızı tavanı, ivmesi ve hata kazancı. */
  maxTurnRate: 4.2,
  turnAcceleration: 24,
  steerGain: 7,
  /** Gövde hedefe ters dönükken koşu tavanının oranı: dönüşte hızını az kaybeder. */
  turnSpeedFloor: 0.62,
  /** Komutun bu uzunluğun altındaki hareketi yön belirlemez. */
  moveDeadzone: 0.2,

  /** Sekme döngüsü: bir sekmenin yolu (birim) ve her sekmenin başındaki hız çukuru oranı. */
  strideLength: 54,
  strideDip: 0.22,
  /** Havada hız yönünün komuta dönme hızı (rad/s): sıçrama kavisli ama büyük ölçüde kilitlidir. */
  leapTurnRate: 1,

  /** Sıçrama deposu: kapasite/boşalma sıçrama süresi (~0,5 sn), dolum bekleme süresidir. */
  boostCapacity: 72,
  boostDrain: 150,
  boostRegen: 24,
  boostRestart: 72,

  wallRestitution: 0.26,
  wallFriction: 0.3,
  impactEventSpeed: 30,
  impactKick: 0.09,

  /** Silah yuvaları gövdeden bağımsız ve hızlı döner; gövde nişanı geriden izler. */
  turretTurnRate: 5.6,
} as const;

/** Sayı tablosunun biçimi: sıçrayıcı varyantları aynı alanları başka değerlerle doldurur. */
export type LeaperConfig = { readonly [K in keyof typeof LEAPER]: number };
