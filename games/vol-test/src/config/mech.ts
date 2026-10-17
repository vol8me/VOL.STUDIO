/**
 * İki bacaklı savaş robotunun (mech) fiziği; birimler `TANK` ile aynıdır. Mech ağırdır, bacakları
 * yalnız ikidir, her adım ayak basışında hafifçe yavaşlar ve gövdesi yürüdüğü yöne yavaş döner:
 * ters yöne bakarken tam hızda yürümez, önce döner ve açılır. Atılım (Space) kilitli bir koşudur.
 *
 * Yürüyüş döngüsü sunumdur (`view/MechView`). Fizikte iki şey vardır: ayak basışındaki hız çukuru
 * (`strideDip`) ve kırık bacak (`Chassis.parts`, `config/parts.ts`). `trackOffset` iki bacağın gövde
 * ekseninden uzaklığıdır; yan yüzey alanları bu gövdede bacakların yüzey hızıdır.
 */
export const MECH = {
  mass: 2300,
  /** Gövde ayak izi (yarı boy, yarı en): ayak açıklığı değil, çarpışan gövde. */
  halfLength: 24,
  halfWidth: 22,
  trackOffset: 14,

  /** Düz zeminde yürüyüş tavanı (birim/s) ve komutun hızı hedefe çekme ivmesi (birim/s²). */
  maxSpeed: 170,
  acceleration: 700,
  /** Komut bırakılınca ya da hedef hıza göre fazla hızlıyken yavaşlama ivmesi. */
  braking: 1100,
  /** Atılım (koşu): tavan çarpanı ve atılırken ivme. */
  dashMultiplier: 1.7,
  dashAcceleration: 1500,
  /** Walker sayı biçiminin gereği: mech atılımda baktığı yöne fırlar ve havaya çıkmaz. */
  dashPull: 1,
  leapTurnRate: 1,
  /** Zemin tutuşunun ivme ve hızı kısma oranı. */
  gripSensitivity: 0.45,

  /** Gövde yönünün harekete dönme hızı tavanı, ivmesi ve hata kazancı: ağır, yavaş döner. */
  maxTurnRate: 2.2,
  turnAcceleration: 9,
  steerGain: 4.5,
  /** Gövde hedefe ters dönükken yürüyüş tavanının oranı (dönüklük arttıkça 1'e çıkar). */
  turnSpeedFloor: 0.38,
  /** Komutun bu uzunluğun altındaki hareketi yön belirlemez. */
  moveDeadzone: 0.2,

  /** Adım döngüsü: tam bir çift adımın yolu (birim) ve her ayak basışının hız çukuru oranı. */
  strideLength: 64,
  strideDip: 0.14,

  /** Atılım deposu: kapasite/boşalma atılım süresi, dolum ve yeniden başlama eşiği. */
  boostCapacity: 90,
  boostDrain: 150,
  boostRegen: 30,
  boostRestart: 90,

  wallRestitution: 0.22,
  wallFriction: 0.3,
  impactEventSpeed: 30,
  impactKick: 0.07,

  /** Silah kolları gövdeden bağımsız ve hızlı döner; gövde nişanı geriden izler. */
  turretTurnRate: 4.8,
} as const;

/** Sayı tablosunun biçimi: mech varyantları aynı alanları başka değerlerle doldurur. */
export type MechConfig = { readonly [K in keyof typeof MECH]: number };
