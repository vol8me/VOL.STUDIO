/**
 * Bot yapay zekâsının sayıları. Beceri (`skill`, 0..1) her bot için bir kez seçilir ve aşağıdaki
 * aralıklardan bir kişilik üretir; aynı tohum ve beceri her zaman aynı botu verir.
 */

/** [acemi, usta] uçları; kişilik bu iki değer arasında doğrusal ara değerdir. */
type Span = readonly [novice: number, expert: number];

export const BOT = {
  /** Algı yenileme aralığı (ms): hedef seçimi ve kaçınma vektörü bu aralıkla tazelenir. */
  thinkIntervalMs: 160,
  /** Düşmanı fark etme mesafesi (birim); en uzun silah menzilinden büyüktür. */
  sightRange: 1100,
  /** Hedef bu çarpanla büyütülmüş görüş mesafesine çıkana dek bırakılmaz (titreşimi önler). */
  loseSightFactor: 1.2,
  /** Yeni hedef, güncelinden bu oranda yakınsa hedef değiştirilir. */
  switchCloserFactor: 0.6,
  /** Ateş yalnız menzilin bu oranının içinde açılır (mermi menzil sonunda düşer). */
  fireRangeFraction: 0.92,
  /** Namlu nişan açısına `aimTolerance` bu çarpanın içinde yakınsa tetik çekilir. */
  fireToleranceFactor: 2,
  /** Hedef menzilin bu oranına girmeden bot hedefe dönüp savaşmaya başlamaz (görev bölgesi yoksa her zaman savaşır). */
  engageRangeFactor: 1.25,
  /** Savaşırken hedefe tutulan mesafenin menzile oranı: orta değer ve sapması kişilikten gelir. */
  standoff: { novice: 0.6, expert: 0.7, spread: 0.08 },
  /** Yörüngede dönme (şerit atma) yönü bu aralıkta rastgele çevrilir (ms). */
  strafeFlipMs: [1500, 3600] as Span,
  /** Yörünge hızı: hedef menzil içindeyken ve dışındayken hareket vektörünün yanal payı. */
  orbitNear: 0.75,
  orbitFar: 0.2,
  /** Mesafe hatasının hız tavanına çevrildiği genişlik (standoff mesafesinin oranı). */
  rangeBand: 0.35,

  /** Duvara bu mesafeden (birim) yaklaşan araç içe doğru itilir. */
  wallMargin: 320,
  wallWeight: 1.7,
  /**
   * Göl kaçınması (süzülen araç hariç): hareket yönünün önündeki bu mesafeler (birim) taranır, suya
   * bakan bileşen sıyrılır ve kıyıdan `retreat` kadar geri itilir; suyun içindeki bot `escape`
   * kuvvetiyle kıyıya yürür.
   */
  lakeLookahead: [110, 230, 380] as readonly number[],
  lakeRetreat: 0.9,
  lakeEscape: 2.2,
  /** Suya doğru giden hareketin kıyı teğetine kayan payı (kıyıda kilitlenmeyi önler). */
  lakeSlide: 0.9,
  /** Başka araçlardan bu yarıçap (birim) içinde ayrışma kuvveti uygulanır. */
  separationRadius: 120,
  separationWeight: 1.3,

  /** Takılma denetimi: bu sürede (ms) bu kadar yol (birim) alınamazsa sıkışma sayılır. */
  stuckCheckMs: 600,
  stuckDistance: 7,
  /** Komut bu uzunluğun üstündeyse araç gerçekten ilerlemek istiyordur; altı bekleme sayılır. */
  stuckMinMove: 0.25,
  /** Üst üste bu kadar denetim sıkışık çıkarsa kurtulma manevrası başlar. */
  stuckChecks: 2,
  unstickMs: 1100,

  /** Bölge içinde bekleyen bot, yarıçapın bu oranındaki rastgele noktalara dolaşır. */
  patrolRadiusFraction: 0.55,
  patrolMs: [3500, 8000] as Span,
  /** Görev noktasına varış payı: yarıçapın bu oranında varılmış sayılır. */
  arriveFraction: 0.5,
  /** Bekleme sırasında namlunun taradığı hız (rad/s). */
  sweepRadPerSec: 0.7,

  /** Hedefe bu mesafeden (birim) uzak görevde atılım kullanılır; depo bu orandan fazlaysa başlar. */
  boostDistance: 1500,
  boostStartFraction: 0.5,
  boostStopFraction: 0.1,
  /** Yürüyücü hedef menzilinin bu oranından uzaktaysa av atılışıyla kapanır. */
  walkerPounceRange: 0.6,

  /** Geri çekilen bot canı bu orana dönünce savaşa döner. */
  retreatExitHealth: 0.65,

  /** Taktik katman; hepsi beceriyle ölçeklenir ve `minSkill` altındaki botta kapalıdır. */
  tactics: {
    minSkill: 0.35,
    /** Hedef puanında can açığının ağırlığı [acemi, usta]: usta, canı yarı olanı bu oranda yakın sayar. */
    focusWeak: [0, 0.5] as Span,
    /** Doğma korumalı düşman hedef puanında bu çarpanla uzak sayılır (vurulamaz). */
    protectedPenalty: 3,
    /** Kendi menzili düşmanınkinin bu katından uzunsa onun menzilinin `kiteMargin` katında durulur. */
    kiteRangeRatio: 1.15,
    kiteMargin: 1.08,
    /** Kendi menzili düşmanınkinin bu oranının altındaysa kendi menzilinin `rushStandoff` katına girilir. */
    rushRangeRatio: 0.85,
    rushStandoff: 0.4,
    /** Sayım yarıçapı (birim): düşman, müttefikten (kendisi dahil) `outnumberedEnter` fazlaysa çekilir. */
    packRadius: 760,
    outnumberedEnter: 2,
    outnumberedExit: 0,
    /** Müttefik kümesi bu yarıçapta aranır; bu mesafede varılmış sayılır. */
    rallyRadius: 1700,
    rallyArrive: 240,
    /** Mermiden kaçınma: menzil, en yakın geçişe kalan süre (sn) ve vuruş payı (araç yarıçapı + pay). */
    dodgeRange: 520,
    dodgeHorizonS: 0.75,
    dodgeMiss: 70,
    dodgeWeight: 1.5,
  },

  profile: {
    /** Hedefi fark ettikten sonra ilk atışa kadar tepki süresi (ms). */
    reactionMs: [520, 150] as Span,
    /** Nişan sapması (rad, 1σ'ya yakın tepe değer): her algı adımında yeniden çekilir. */
    aimErrorRad: [0.085, 0.01] as Span,
    /** Hedefin hızını önden gitme oranı (1: tam önden gider). */
    leadAccuracy: [0.5, 1] as Span,
    /** Can bu orana inince geri çekilir. */
    retreatHealth: [0.4, 0.22] as Span,
  },
} as const;
