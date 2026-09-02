/**
 * Hareket, anlık hız ataması değil İVMELİ bir modeldir: yön tuşu bırakıldığında
 * gövde sürtünmeyle yavaşlar, tuşa basıldığında hıza rampayla çıkar. Kütlesi
 * olan bir yaratık hissi buradan gelir.
 */
export const playerConfig = {
  /** Sürekli yürüyüş hızı (px/s). */
  maxSpeed: 210,
  /**
   * Hıza çıkış ivmesi (px/s²). Tam hıza ~0.38 sn'de ulaşılır; kütlesi olan bir
   * yaratık tuşa basıldığı anda seyir hızında olmaz.
   */
  accelerationPxPerSec2: 560,
  /** Girdi yokken yavaşlama (px/s²) — ivmeden yavaş, gövde süzülerek durur. */
  brakePxPerSec2: 760,
  /**
   * Gövdenin görsel yöne dönüş yayı.
   *
   * Eski değerler (150/17) yarım saniyenin altında 180° döndürüyordu: yaratık
   * yönünü kütlesi yokmuş gibi anında değiştiriyordu. Yay yumuşatıldı ve
   * dönüş hızı ayrıca tavanlandı — yay tek başına, büyük bir açı farkında
   * ilk karelerde çok yüksek bir açısal hız üretebilir.
   */
  facingSpring: { stiffness: 44, damping: 10 },
  /** Dönüşün üst sınırı (rad/s). 180°'lik bir dönüş bunun altına inemez. */
  maxTurnRateRadPerSec: 2.7,

  /**
   * Sert dönüşte hız kesilir: ağır bir gövde yönünü tam hızda değiştiremez.
   * `turnRateForFullPenalty`e ulaşan bir dönüşte hız `maxTurnSpeedPenalty`
   * oranında düşer.
   */
  turnRateForFullPenalty: 2.4,
  maxTurnSpeedPenalty: 0.42,

  /**
   * Dash: kısa süreli, KONTROLSÜZ bir atılım.
   *
   * Yön atılımın başında kilitlenir ve gövdenin baktığı yön de o yöne
   * sabitlenir. Atılım sürerken dümen kırabilmek ağırlık hissini öldürüyor,
   * uzuvları da yanlış yönlendiriyordu: gövde düz uçarken duruş yelpazesi
   * dönüyor, ayaklar gitmediği bir yöne basmaya çalışıyordu.
   */
  dash: {
    speedPxPerSec: 900,
    durationMs: 130,
    cooldownMs: 700,
  },

  /**
   * Duvar teması. Bu hızın üstünde çarpan gövde SEKER: hız sıfırlanmaz,
   * duvarın normalinde tersine çevrilip sönümlenir ve atılım kesilir.
   * Sıfırlamak, sınırı görünmez bir yapışkan yüzeye çeviriyordu.
   *
   * Eşik `maxSpeed`in ÜSTÜNDEDİR: yürüyerek duvara dayanmak bir çarpma
   * değildir. Daha düşük bir eşikte duvara doğru basılı tutulan tuş sürekli
   * sekme üretiyordu — gövde duvarın önünde zıplayıp duruyor, oyuncu kenara
   * hiç yaslanamıyordu. Sekme artık yalnız atılım hızındaki temasa aittir.
   */
  wall: {
    impactSpeedPxPerSec: 300,
    restitution: 0.55,
    /** Sekmenin ardından kontrolün geri gelme süresi (ms). */
    recoveryMs: 130,
  },
} as const;
