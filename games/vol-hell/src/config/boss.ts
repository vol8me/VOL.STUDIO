/**
 * Boss (Sovereign) davranışı ve ölçekleme. Taban stat'lar
 * `ENEMY_CATALOG.sovereign`ta; gerçek değerler spawn anında oyuncunun gücüne
 * oranlanır (bkz. `scaleBossStats`). Mesafeler piksel, süreler ms.
 */
export const bossConfig = {
  scaling: {
    /**
     * Oyuncunun DPS oranı bu üsse yükseltilir. 1 = birebir takip. 0.85 seçildi:
     * boss güçlü build'i takip eder ama YAKALAMAZ, build kurmanın ödülü kalır.
     */
    healthPowerExponent: 0.85,
    /** Zayıf build boss'u kâğıttan, aşırı build sonsuz canlı yapmasın. */
    minHealthMultiplier: 1,
    maxHealthMultiplier: 4.5,
    /** Hasar oyuncunun DAYANIKLILIĞINI takip eder; yoksa can kartları dövüşü anlamsızlaştırır. */
    damagePowerExponent: 0.6,
    minDamageMultiplier: 1,
    maxDamageMultiplier: 2.5,
    /** Saldırı hızı oyuncunun HAREKET hızını takip eder. `fireRate` ters stat: çarpan bölendir. */
    fireRatePowerExponent: 0.5,
    minFireRateMultiplier: 1,
    maxFireRateMultiplier: 1.8,
  },

  attackIntervalMs: 2600,
  /** Boss doğar doğmaz vurmaz. */
  openingDelayMs: 1800,

  /** SLAM — bossun etrafında geniş daire. */
  slam: {
    telegraphMs: 900,
    radiusPx: 190,
    /** Hasar = boss `damage` × bu çarpan. */
    damageMultiplier: 1.6,
    /** Yarıçapa EKLENİR; bu kadar yakındaki oyuncu da vurulur. */
    knockbackPx: 140,
  },

  /** VOLLEY — oyuncuya doğru üç koridor. */
  volley: {
    telegraphMs: 760,
    laneCount: 3,
    laneSpreadRad: 0.34,
    laneLengthPx: 620,
    laneWidthPx: 46,
    damageMultiplier: 1,
  },

  /** SUMMON — koni şeklinde sürü. */
  summon: {
    telegraphMs: 820,
    minionId: 'swarmling',
    count: 4,
    spreadRad: 1.5,
    radiusPx: 120,
  },

  /**
   * Bu oranın altında saldırı arası kısalır. Ayrı bir "faz 2 kiti" YOK: yeni
   * saldırılar okunabilirliği düşürürdü, tempo artışı yeterli gerginlik veriyor.
   */
  enrageHealthRatio: 0.4,
  /** 0.65 = %35 daha sık. */
  enrageIntervalMultiplier: 0.65,
} as const;
