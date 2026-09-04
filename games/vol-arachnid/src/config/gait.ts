/**
 * Yürüyüş ve duruş ayarları.
 *
 * DURUŞ, KAYNAK POZDAN TÜRETİLMEZ. Export'ta her uzuv düz bir çizgidir ve
 * dizilim yalnızca parçaları okunur biçimde yan yana dizmek içindir; oradan
 * okunan "dinlenme açısı" bir duruş değildir. Duruş burada, İLERİ EKSENDEN
 * ölçülen açılarla bildirilir: 0° tam ileri, +90° tam sağ, 180° tam arka.
 * Sağ/sol simetriktir, işaret yalnız tarafı verir.
 *
 * `r3/l3` ÖN, `r0/l0` ARKA bacaklardır (kaynak metadata'da kalça y'si öne
 * doğru azalır). Bir dönem bunun tersi varsayılmıştı: ön bacaklar geriye,
 * arka bacaklar öne çekildiği için sekiz uzuv dar bir bantta toplanıp
 * birbirinin üstüne biniyordu.
 */

export interface LimbStance {
  /** İleri eksenden duruş açısı (derece); + sağ, − sol. */
  angleDeg: number;
  /**
   * SABİT kök kemiğin ayak yönüne yapışma oranı [0,1].
   *
   * Yalnız kök kemiği IK dışında tutulan uzuvlarda (bacaklar) anlamlıdır; arka
   * itici uzuvlarda kök kemik doğrudan IK çiftinin ilkidir ve bu alan
   * verilmez (bkz. `LimbRig.root`).
   *
   * Oran DURUŞ ile AYAK YÖNÜ arasındaki paylaşımdır: 0 kökü duruşa çivileyip
   * tüm işi alt kemiklere bırakır, 1 kökü ayağa kilitler.
   */
  rootFollow?: number;
  /** Kök kemiğin duruş açısından sapabileceği en büyük değer (derece). */
  rootYawLimitDeg?: number;
  /** Uzvun TAM uzanımına oran olarak kalça–ayak mesafesi. */
  reach: number;
  /**
   * Dizin büküleceği taraf (+1/−1). Ön uzuvlarda diz ÖNE, arka uzuvlarda ARKAYA
   * taşar: uzuvlar birbirinden uzaklaşır ve dizler kesişmez.
   */
  bendSign: number;
  /** Eşzamanlı adım grubu — komşu ve karşı uzuvlar zıt gruptadır. */
  group: number;
  /**
   * Uzuv sıra bekler mi? Sıra disiplini "gövde her an desteklidir" güvencesidir
   * ve gövdeyi SEKİZ bacak taşır; kısa itici uzuvlar o güvencenin parçası
   * değildir. Sıraya sokulduklarında kendi eşiklerini çoktan aşmış hâlde
   * bekliyor, kısa erişim payları bittiği için stride'ın yarısından fazlasını
   * TAM GERİLİ geçiriyorlardı (ölçüldü: %52-56).
   */
  freeStep: boolean;
  /**
   * Adım ölçeği: tetik, acil eşik ve öngörü payı bununla çarpılır.
   *
   * Kısa uzuv kısa adım atar. Eşik uzvun erişim payını aşarsa ayak, uzuv TAM
   * GERİLİ hâldeyken beklemeye devam eder — arka itici uzuvlarda strideın
   * %86'sı bu hâlde geçiyor ve uzuv yerde sürükleniyormuş gibi görünüyordu.
   */
  strideScale: number;
  /** Atılım sırasında duruş açısına eklenen değer (derece). */
  dashAngleDeltaDeg: number;
  /** Atılım sırasında erişime eklenen oran. */
  dashReachDelta: number;
  /**
   * Yürüyüş hızıyla ölçeklenen geri itiş. Arka uzuvlar destek/itiş bacağıdır:
   * hız arttıkça daha geriye basarlar ve gövdeyi iterler.
   */
  pushReachGain: number;
}

/** Kısa kök kemik IK dışında tutulur; iş uzun femur/tibia'dadır. */
const LEG_ROOT = {
  rootFollow: 0.6,
  rootYawLimitDeg: 42,
  strideScale: 1,
  freeStep: false,
} as const;

const STANCE: Readonly<Record<string, LimbStance>> = {
  // Ön çift — atılımda öne fırlar, dengeyi önden yakalar.
  r3: {
    ...LEG_ROOT,
    angleDeg: 45,
    reach: 0.72,
    bendSign: -1,
    group: 0,
    dashAngleDeltaDeg: -16,
    dashReachDelta: 0.1,
    pushReachGain: 0,
  },
  l3: {
    ...LEG_ROOT,
    angleDeg: -45,
    reach: 0.72,
    bendSign: 1,
    group: 1,
    dashAngleDeltaDeg: 16,
    dashReachDelta: 0.1,
    pushReachGain: 0,
  },
  r2: {
    ...LEG_ROOT,
    angleDeg: 80,
    reach: 0.72,
    bendSign: -1,
    group: 1,
    dashAngleDeltaDeg: -8,
    dashReachDelta: 0.05,
    pushReachGain: 0,
  },
  l2: {
    ...LEG_ROOT,
    angleDeg: -80,
    reach: 0.72,
    bendSign: 1,
    group: 0,
    dashAngleDeltaDeg: 8,
    dashReachDelta: 0.05,
    pushReachGain: 0,
  },
  // Arka çift — atılımda ve yürüyüşte geriye basar.
  r1: {
    ...LEG_ROOT,
    angleDeg: 115,
    reach: 0.72,
    bendSign: 1,
    group: 0,
    dashAngleDeltaDeg: 6,
    dashReachDelta: -0.02,
    pushReachGain: 0.03,
  },
  l1: {
    ...LEG_ROOT,
    angleDeg: -115,
    reach: 0.72,
    bendSign: -1,
    group: 1,
    dashAngleDeltaDeg: -6,
    dashReachDelta: -0.02,
    pushReachGain: 0.03,
  },
  r0: {
    ...LEG_ROOT,
    angleDeg: 148,
    reach: 0.72,
    bendSign: 1,
    group: 1,
    dashAngleDeltaDeg: 9,
    dashReachDelta: -0.04,
    pushReachGain: 0.05,
  },
  l0: {
    ...LEG_ROOT,
    angleDeg: -148,
    reach: 0.72,
    bendSign: -1,
    group: 0,
    dashAngleDeltaDeg: -9,
    dashReachDelta: -0.04,
    pushReachGain: 0.05,
  },
  // Kısa arka itici uzuvlar. Kaynak pozda birbirini keserler (sol uzvun ayağı
  // sağa, sağ uzvunki sola bakar); duruş açıları kesişmeyi çözer.
  //
  // Erişimleri bacaklardan YÜKSEKTİR: uzuv yalnız 88 px ve kalçası gövde
  // kabuğunun içinde. Daha kısa bir erişimde uzvun tamamı kabuğun altında
  // kalıyor, dışarıda bir çıkıntı olarak okunuyordu. İtiş payı bu yüzden
  // erişimden çok AÇIDAN alınır — erişim tavana yakın çalışır.
  //
  // Açı 180°'ye yakındır: uzuvlar yanlara açılmaz, gövdenin ARKASINDA
  // birbirine yakın durur.
  tr: {
    angleDeg: 168,
    reach: 0.68,
    strideScale: 0.55,
    freeStep: true,
    bendSign: -1,
    group: 0,
    dashAngleDeltaDeg: 11,
    dashReachDelta: 0.04,
    pushReachGain: 0.03,
  },
  tl: {
    angleDeg: -168,
    reach: 0.68,
    strideScale: 0.55,
    freeStep: true,
    bendSign: 1,
    group: 1,
    dashAngleDeltaDeg: -11,
    dashReachDelta: 0.04,
    pushReachGain: 0.03,
  },
};

export const gaitConfig = {
  stance: STANCE,

  stepTriggerPx: 26,
  runStepTriggerPx: 38,
  stepDurationMs: 205,
  runStepDurationMs: 128,
  /**
   * Sıra disiplinini delen gerginlik.
   *
   * Normal yürüyüşün ÜSTÜNDE seçilir. Bekleyen bir uzvun en kötü gerginliği
   * tetik (38) + sıranın sürdüğü boyunca kat edilen yoldur. Sıra TEK bir adım
   * kadar sürmez: bir gruptaki beş uzuv kaymalı başlar, sıra ancak sonuncusu
   * inince biter — pratikte ~iki adım süresi (215 × 0.128 × 2 ≈ 55). Yani
   * eşik ~93'ün altına inerse sıra disiplini DÜZ YÜRÜYÜŞTE delinir ve gövde
   * desteksiz kalır.
   *
   * `strideScale` ile ölçeklenmez: bu eşik bacağın değil GÖVDENİN ölçüsüdür.
   *
   * Üstünde kaldığı durumlar bilinçlidir: atılım ve sert dönüş. İkisinde de
   * gövde bir adım süresinde uzuv erişiminden çok yol alır; sırasını bekleyen
   * uzuv yerde sürüklenir ve gövde dönse bile yerinden kalkmaz.
   */
  emergencyStrainPx: 100,
  /**
   * Denge payının [0,1] ölçeğinde 1'e ulaştığı kenar mesafesi (dünya px).
   *
   * Yaratığın duruş yarıçapına göre seçilir: ayaklar gövdeden ~120 px uzakta
   * durur, yani gövdenin destek kenarına 60 px kalması hâlâ rahat bir paydır.
   * Bunun altında denge okunur biçimde daralmaya başlar.
   */
  supportSafeMarginPx: 60,
  /** Bu hızda koşu adımının tam tempo değerleri kullanılır. */
  fullTempoSpeedPxPerSec: 215,
  /** Adım hedefini hız yönünde ileri koyar; ayak gideceği yere basar. */
  stepLeadSeconds: 0.13,

  /**
   * Adım havadayken ayağı kalçaya doğru KISALTIR: diz daha çok bükülür, uzuv
   * yerden çekilmiş görünür. Salt ekran kaydırması tek başına bunu vermez.
   */
  swingTuckPx: 20,
  /**
   * Duvara çarpmada ayağın kalçaya doğru çekildiği mesafe (px).
   *
   * Gövde çarpmada ivmeden yaslanır ama uzuvlar olayı hiç görmüyordu; yaratık
   * duvara dimdik çarpıp dimdik sekiyordu.
   *
   * Ayar DURUŞ evine değil POZA uygulanır ve fark önemlidir: ev konumu yalnız
   * bir SONRAKİ adımın hedefini etkiler, basılı ayak yerinde kalır. 260 ms'lik
   * bir yankıda çoğu ayak hiç adım atmaz — duruşa yazılan bir çöküş görünmezdi
   * (ölçüldü: erişim birebir aynı kaldı). Poza yazıldığında uzuvlar o karede
   * bükülür, ayaklar ise yerinde kalır: darbe EMİLMİŞ görünür.
   */
  impactTuckPx: 16,

  /** Pençenin (bilek) havadayken kıvrılması ve yerdeyken düzelmesi (derece). */
  clawLiftCurlDeg: 14,
  clawPlantedCurlDeg: -4,

  /**
   * Çömelme uzuvları gövdeye çeker: dinlenmede diz bükülür, gövde alçalır.
   * Aşırıya kaçmak üstten bakışı bozar — oran bilinçli olarak küçüktür.
   */
  crouchReachDrop: 0.075,

  /**
   * ATILIM POZU. Atılım sırasında ayaklar yere değmez; yürüyüş döngüsü
   * tamamen devre dışı kalır ve uzuvlar tek bir uçuş pozunda tutulur.
   *
   * Döngü açık bırakıldığında uzuvlar sıra disiplinini delip birbiri ardına
   * acil adım atıyordu: gövde düz uçarken bacaklar yerinde TİTRİYOR, avlanan
   * bir yaratık yerine bozuk bir makine gibi görünüyordu.
   */
  flightLift: 0.55,
} as const;
