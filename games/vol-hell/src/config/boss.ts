/**
 * Boss (Sovereign) davranış ve ölçekleme sabitleri.
 *
 * Boss'un taban stat'ları `ENEMY_CATALOG.sovereign` içindedir; gerçek
 * değerleri spawn anında oyuncunun gücüne oranlanır (bkz. `scaleBossStats`).
 */
export const bossConfig = {
  /** Oyuncu gücüne göre ölçekleme sınırları. */
  scaling: {
    /**
     * Oyuncunun DPS'i tabanın kaç katıysa boss canı o oranın bu üssü kadar
     * büyür. 1 = birebir takip (oyuncu 2x güçlüyse boss 2x canlı).
     * 0.85 seçildi: boss güçlü build'i takip eder ama tam yakalamaz —
     * build kurmanın ödülü korunur, "hiç ilerlememişim" hissi doğmaz.
     */
    healthPowerExponent: 0.85,
    /** Can çarpanının alt sınırı — zayıf build boss'u kâğıttan yapmasın. */
    minHealthMultiplier: 1,
    /** Can çarpanının üst sınırı — aşırı build sonsuz canlı boss üretmesin. */
    maxHealthMultiplier: 4.5,
    /**
     * Boss hasarı oyuncunun DAYANIKLILIĞINI (max can) takip eder: canını
     * büyüten oyuncu daha sert vuruş yer, yoksa can kartları boss dövüşünü
     * anlamsızlaştırırdı.
     */
    damagePowerExponent: 0.6,
    minDamageMultiplier: 1,
    maxDamageMultiplier: 2.5,
    /**
     * Boss saldırı hızı oyuncunun HAREKET hızını takip eder: hızlı oyuncu
     * daha sık saldırıyla baskılanır. `fireRate` TERS bir stat (ms cinsinden
     * bekleme), bu yüzden çarpan bölen olarak uygulanır.
     */
    fireRatePowerExponent: 0.5,
    minFireRateMultiplier: 1,
    maxFireRateMultiplier: 1.8,
  },

  /** Saldırı paternleri arasındaki bekleme (ms). */
  attackIntervalMs: 2600,
  /** İlk saldırıya kadar geçen süre (ms) — boss doğar doğmaz vurmaz. */
  openingDelayMs: 1800,

  /** Patern 1 — SLAM: bossun etrafında geniş bir daire. */
  slam: {
    telegraphMs: 900,
    radius: 190,
    /** Hasar = boss `damage` stat'ı x bu çarpan. */
    damageMultiplier: 1.6,
    /** Bu mesafeden yakındaki oyuncu vurulur (yarıçapa eklenir). */
    knockbackPx: 140,
  },

  /** Patern 2 — VOLLEY: oyuncuya doğru üç koridor. */
  volley: {
    telegraphMs: 760,
    /** Koridor sayısı. */
    laneCount: 3,
    /** Koridorlar arası açı farkı (radyan). */
    laneSpreadRad: 0.34,
    laneLengthPx: 620,
    laneWidthPx: 46,
    damageMultiplier: 1,
  },

  /** Patern 3 — SUMMON: boss etrafına koni şeklinde sürü çağırır. */
  summon: {
    telegraphMs: 820,
    minionId: 'swarmling',
    count: 4,
    /** Koninin açıklığı (radyan). */
    spreadRad: 1.5,
    radiusPx: 120,
  },

  /**
   * Faz eşiği: canı bu oranın altına düşünce saldırı arası kısalır.
   * Ayrı bir "faz 2 kiti" YOK — aynı üç patern, daha sıkı tempoda.
   * Yeni saldırılar okunabilirliği düşürürdü; tempo artışı ise dövüşün
   * son çeyreğini gerçekten gerginleştiriyor.
   */
  enrageHealthRatio: 0.4,
  /** Öfke fazında saldırı arasının çarpanı (0.65 = %35 daha sık). */
  enrageIntervalMultiplier: 0.65,
} as const;
