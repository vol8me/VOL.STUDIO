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
  /** Uzvun TAM uzanımına oran olarak kalça–ayak mesafesi. */
  reach: number;
  /**
   * Dizin büküleceği taraf (+1/−1). Ön uzuvlarda diz ÖNE, arka uzuvlarda ARKAYA
   * taşar: uzuvlar birbirinden uzaklaşır ve dizler kesişmez.
   */
  bendSign: number;
  /** Eşzamanlı adım grubu — komşu ve karşı uzuvlar zıt gruptadır. */
  group: number;
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

const STANCE: Readonly<Record<string, LimbStance>> = {
  // Ön çift — atılımda öne fırlar, dengeyi önden yakalar.
  r3: {
    angleDeg: 45,
    reach: 0.78,
    bendSign: -1,
    group: 0,
    dashAngleDeltaDeg: -16,
    dashReachDelta: 0.1,
    pushReachGain: 0,
  },
  l3: {
    angleDeg: -45,
    reach: 0.78,
    bendSign: 1,
    group: 1,
    dashAngleDeltaDeg: 16,
    dashReachDelta: 0.1,
    pushReachGain: 0,
  },
  r2: {
    angleDeg: 80,
    reach: 0.78,
    bendSign: -1,
    group: 1,
    dashAngleDeltaDeg: -8,
    dashReachDelta: 0.05,
    pushReachGain: 0,
  },
  l2: {
    angleDeg: -80,
    reach: 0.78,
    bendSign: 1,
    group: 0,
    dashAngleDeltaDeg: 8,
    dashReachDelta: 0.05,
    pushReachGain: 0,
  },
  // Arka çift — atılımda ve yürüyüşte geriye basar.
  r1: {
    angleDeg: 115,
    reach: 0.78,
    bendSign: 1,
    group: 0,
    dashAngleDeltaDeg: 6,
    dashReachDelta: -0.02,
    pushReachGain: 0.03,
  },
  l1: {
    angleDeg: -115,
    reach: 0.78,
    bendSign: -1,
    group: 1,
    dashAngleDeltaDeg: -6,
    dashReachDelta: -0.02,
    pushReachGain: 0.03,
  },
  r0: {
    angleDeg: 148,
    reach: 0.78,
    bendSign: 1,
    group: 1,
    dashAngleDeltaDeg: 9,
    dashReachDelta: -0.04,
    pushReachGain: 0.05,
  },
  l0: {
    angleDeg: -148,
    reach: 0.78,
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
    reach: 0.92,
    bendSign: -1,
    group: 0,
    dashAngleDeltaDeg: 11,
    dashReachDelta: 0.04,
    pushReachGain: 0.03,
  },
  tl: {
    angleDeg: -168,
    reach: 0.92,
    bendSign: 1,
    group: 1,
    dashAngleDeltaDeg: -11,
    dashReachDelta: 0.04,
    pushReachGain: 0.03,
  },
};

export const gaitConfig = {
  stance: STANCE,

  stepTriggerPx: 30,
  runStepTriggerPx: 46,
  stepDurationMs: 185,
  runStepDurationMs: 110,
  /**
   * Sıra disiplinini delen gerginlik.
   *
   * Normal yürüyüşün ÜSTÜNDE seçilir: tam tempoda bekleyen bir uzvun en kötü
   * gerginliği tetik (46) + bir adım süresince kat edilen yol (250 × 0.11 ≈ 28)
   * ≈ 74'tür. Değer bunun altına inerse sıra disiplini düz yürüyüşte de
   * delinir ve gövde desteksiz kalır.
   *
   * Üstünde kaldığı durumlar bilinçlidir: atılım ve sert dönüş. İkisinde de
   * gövde bir adım süresinde uzuv erişiminden çok yol alır; sırasını bekleyen
   * uzuv yerde sürüklenir ve gövde dönse bile yerinden kalkmaz.
   */
  emergencyStrainPx: 82,
  /** Bu hızda koşu adımının tam tempo değerleri kullanılır. */
  fullTempoSpeedPxPerSec: 250,
  /** Adım hedefini hız yönünde ileri koyar; ayak gideceği yere basar. */
  stepLeadSeconds: 0.13,

  /**
   * Adım havadayken ayağı kalçaya doğru KISALTIR: diz daha çok bükülür, uzuv
   * yerden çekilmiş görünür. Salt ekran kaydırması tek başına bunu vermez.
   */
  swingTuckPx: 17,

  /**
   * Omuz (coxa) kemiğinin ayak yönüne yapışma oranı [0,1].
   *
   * Üç eklemli bir uzuvda çözüm tek değildir; omuz duruş açısıyla ayak yönü
   * arasında sabit bir oranda paylaştırılarak belirsizlik kaldırılır. 0 omzu
   * donuk bırakır (uzuv gövdeden kopuk salınır), 1 üç kemiği tek çizgiye
   * yaklaştırır (diz kaybolur).
   */
  shoulderFollow: 0.45,
  /** Omzun duruş açısından sapabileceği en büyük değer (derece). */
  shoulderYawLimitDeg: 34,

  /** Pençenin (bilek) havadayken kıvrılması ve yerdeyken düzelmesi (derece). */
  clawLiftCurlDeg: 14,
  clawPlantedCurlDeg: -4,

  /**
   * Çömelme uzuvları gövdeye çeker: dinlenmede diz bükülür, gövde alçalır.
   * Aşırıya kaçmak üstten bakışı bozar — oran bilinçli olarak küçüktür.
   */
  crouchReachDrop: 0.075,
} as const;
