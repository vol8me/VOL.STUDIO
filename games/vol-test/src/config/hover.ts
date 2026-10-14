/**
 * Hover (süzülen) şasinin fiziği. Birimler `TANK` ile aynıdır (1 m = 32 birim, saniye, radyan).
 * Süzülen araç ne paletle ne bacakla yürür: hızı zemine değil iticilerine bağlıdır, bu yüzden tutuşa
 * neredeyse duyarsızdır; hızlanması ve özellikle frenlemesi yumuşaktır (momentum taşır, köşede yana
 * süzülür) ve gövdesi yürüdüğü yöne değil NİŞAN yönüne bakar: arkasına bakmadan kaçarken ateş eder.
 * Atılım (Space) basılı tutuldukça iticilere yüklenir ve depodan yer.
 *
 * Yan yüzey alanları (`track*`, `tread*`, `ground*`, `surface*`) bu gövdede iki yan itici kanalın yüzey
 * hızıdır (`trackOffset` iticilerin gövde ekseninden uzaklığıdır); kayma yoktur.
 */
export const HOVER = {
  mass: 900,
  /** Gövde ayak izi (yarı boy, yarı en): kanatlar değil çarpışan gövde. */
  halfLength: 30,
  halfWidth: 26,
  trackOffset: 19,

  /** Düz zeminde hız tavanı (birim/s) ve komutun hızı hedefe çekme ivmesi (birim/s²). */
  maxSpeed: 240,
  acceleration: 470,
  /** Hız hedefe ters ya da hedeften fazlayken yavaşlama ivmesi: bilerek düşüktür, araç süzülür. */
  braking: 300,
  /** Atılım: tavan çarpanı ve atılırken ivme. */
  dashMultiplier: 1.55,
  dashAcceleration: 1500,
  /** Zemin tutuşunun ivme ve hızı kısma oranı (süzülen araç zeminden az etkilenir). */
  gripSensitivity: 0.2,

  /** Gövde yönünün nişana dönme hızı tavanı, ivmesi ve hata kazancı. */
  maxTurnRate: 5.2,
  turnAcceleration: 30,
  steerGain: 7,
  /** Komutun bu uzunluğun altındaki hareketi yön belirlemez. */
  moveDeadzone: 0.2,

  /** Atılım deposu: kapasite/boşalma atılım süresi (~0,47 sn), dolum ve yeniden başlama eşiği. */
  boostCapacity: 80,
  boostDrain: 170,
  boostRegen: 30,
  boostRestart: 80,

  wallRestitution: 0.55,
  wallFriction: 0.08,
  impactEventSpeed: 30,
  impactKick: 0.2,

  /** Taret gövdeden bağımsız ve hızlı döner. */
  turretTurnRate: 7.5,
} as const;

/** Sayı tablosunun biçimi: süzülen araç varyantları aynı alanları başka değerlerle doldurur. */
export type HoverConfig = { readonly [K in keyof typeof HOVER]: number };
