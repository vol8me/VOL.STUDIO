/**
 * Tankın fiziği. Birimler: uzunluk dünya birimi (1 m = 32), kütle kg, süre
 * saniye, açı radyan. Değerler gerçek bir hafif paletli aracın oranlarından
 * ölçeklenmiştir; his bu tablodan ayarlanır ve davranış `tests/sim/tank`
 * altında kilitlidir.
 */
export const TANK = {
  mass: 1200,
  /** Gövde ve paletlerle birlikte ayak izi (yarı boy, yarı en). */
  halfLength: 26,
  halfWidth: 21,
  /** Palet merkezinin gövde ekseninden uzaklığı ve yere basan boyu. */
  trackOffset: 15.5,
  trackContactLength: 44,
  /** Yerçekimi (birim/s²): 9.81 m/s². */
  gravity: 314,

  /** Palet–zemin boylamsal sürtünmesi: tutunan (statik) ve kayan (kinetik) palet. */
  tractionFriction: 1.35,
  tractionKinetic: 1.0,
  /** Palet kayma sertliği (1/s): palet hızıyla zemin hızı farkının kuvvete dönüşme hızı. */
  tractionStiffness: 22,
  /** Yanal ve dönme sürtünmesi (Coulomb) ve onlara yaklaşma sertliği. */
  lateralFriction: 0.95,
  lateralKinetic: 0.7,
  lateralStiffness: 26,
  /**
   * Statikten kinetik sürtünmeye geçişin kayma hızı ölçeği (birim/s). Kayma bu
   * hızı aştıkça katsayı kinetiğe iner; kayan tank tutunana dek kaymayı sürdürür.
   */
  slidingSpeed: 40,
  /**
   * Dönme direncinin hızla azalma ölçüsü (birim/s): direnç `1 / (1 + |v| / bu)`
   * ile ölçeklenir. Paletli araçta dönüş yarıçapı büyüdükçe yanal direnç
   * katsayısı düşer; hareket hâlinde dönmek yerinde dönmekten kolaydır.
   */
  turnResistanceSpeed: 120,
  /** Yuvarlanma direnci katsayısı. */
  rollingResistance: 0.05,

  /** Motorun palet hızını değiştirebildiği ivme. */
  trackAcceleration: 1400,
  /**
   * Gaz bırakılınca ortak palet hızının azalma ivmesi (motor freni). Direksiyon
   * farkı bundan etkilenmez; dönüş hep `trackAcceleration` ile çevriktir.
   */
  engineBraking: 220,
  /**
   * Aktarma paleti zeminin en çok bu kadar önüne ya da gerisine sürebilir
   * (birim/s): tork sınırlı sürüş. Palet tutunma tepesinde çeker, boşa dönmez.
   * Tepe kaymasının (`tractionFriction · g / tractionStiffness` ≈ 19) biraz üstü.
   */
  driveSlip: 26,
  /** Fren paletleri bu ivmeyle kilitler; kilitli palet kinetik sürtünmeyle kayar. */
  brakeAcceleration: 4000,
  /**
   * Motor gücü (kg·birim²/s³), iki palet arasında PAYLAŞILIR. Paletlerin
   * itkiyle verdiği güç toplamı bu tavanı aşarsa itkiler orantılı kısılır:
   * düşük hızda çekiş sürtünmesi, yüksek hızda güç sınırlar. İç palet
   * frenlerken dış palet daha çok güç alır. Fren güçle sınırlı değildir.
   */
  enginePower: 2.8e7,
  /** Güç sınırının sıfır hızda sonsuza gitmemesi için alt hız. */
  powerMinSpeed: 40,
  /** Hızlanmada motor gücü çarpanı. */
  boostPower: 2.4,
  maxSpeed: 230,
  reverseSpeed: 140,
  boostMultiplier: 1.6,
  /** Sürücünün istediği en yüksek dönüş hızı (dururken). */
  maxTurnRate: 3,
  /** Azami hızdaki dönüş tavanının duran tanka oranı: hızlıyken dönüş genişler. */
  turnRateAtSpeed: 0.55,
  /** Sürücünün yön hatasından dönüş hızına kazancı. */
  steerGain: 6,
  /**
   * Dönüş geri beslemesi: ölçülen açısal hız istenenden geride kaldıkça palet
   * farkı bu kazançla büyür. Paletin yanal sürtünmesi küçük dönüş isteğini
   * yutar; geri besleme olmadan tank hedef yöne sürünerek oturur.
   */
  steerAssist: 2.5,
  /**
   * Sürücü yön hatası bu açının altına inene dek ileri sürmez (radyan);
   * önce döner, sonra gider. Hata azaldıkça gaz yumuşakça açılır.
   */
  driveAngle: 0.9,
  /** Hedef yön arkada kalınca geri vitese geçiş ve çıkış eşikleri. */
  reverseEnter: 2.2,
  reverseExit: 1.5,

  boostCapacity: 100,
  boostDrain: 42,
  boostRegen: 20,
  boostRestart: 18,

  /** Duvar çarpması: sekme katsayısı ve sürtünme. */
  wallRestitution: 0.35,
  wallFriction: 0.4,
  /** Bu normal hızın altındaki duvar teması çarpma olayı üretmez (dayanma). */
  impactEventSpeed: 25,
  /** Çarpmanın süspansiyona vuruşu: normal hızın bu oranı (birim/s). */
  impactKick: 0.12,

  /** Taretin dünya ekseninde azami dönüş hızı. */
  turretTurnRate: 3.2,
} as const;

export type TankConfig = typeof TANK;

/**
 * Gövdenin yaylı süspansiyonu. Yunuslama (boylamsal) ve yalpa (yanal) ayrı
 * yay-sönüm sistemleridir; ivme ağırlığı taşır, gövde paletlere göre kayar.
 */
export const SUSPENSION = {
  /** Doğal frekans (Hz) ve sönüm oranı. */
  frequency: 2.3,
  damping: 0.38,
  /** İvmenin gövde kaymasına kazancı (birim / (birim/s²)). */
  pitchPerAccel: 0.011,
  rollPerAccel: 0.009,
  /** Gövdenin paletlere göre azami kayması. */
  maxOffset: 3.6,
  /** Yol titreşimi: hızla artan, palet yoluyla sürülen küçük sarsıntı. */
  roughness: 0.55,
  /** Titreşimin tam şiddete çıktığı hız ve konum frekansları (1/birim). */
  roughnessSpeed: 200,
  bumpFrequencyPitch: 0.09,
  bumpFrequencyRoll: 0.11,
  /** Titreşimin yay kuvvetine oranı. */
  bumpScale: 0.02,
} as const;

export type SuspensionConfig = typeof SUSPENSION;

/** Taret ateşi. */
export const WEAPON = {
  intervalMs: 650,
  aimTolerance: 0.025,
  muzzleOffset: 30,
  projectileSpeed: 900,
  projectileLifeMs: 1200,
  flight: {
    muzzleHeight: 24,
    launchSpeed: 90,
    gravity: 314,
    drag: 0.32,
    maxRange: 620,
  },
  /** Mermi kütlesi × çıkış hızı: tanka ters yönde uygulanan itki (kg·birim/s). */
  recoilImpulse: 42000,
  /** İsabet eden merminin hedefe aktardığı itki (kg·birim/s). */
  hitImpulse: 60000,
  /** Geri tepmenin süspansiyona vuruşu (birim/s). */
  recoilKick: 34,
  capacity: 256,
} as const;

export type WeaponConfig = typeof WEAPON;
