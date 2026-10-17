import { WORLD } from './world';

export const WEATHER = {
  seed: 0x51eaf,
  transitionMs: 6000,
  events: { minMs: 30_000, maxMs: 120_000 },
  profiles: {
    clear: { dust: 0, rain: 0, snow: 0, windX: 0, windY: 0, airDrag: 1 },
    dust: {
      dust: 1,
      rain: 0,
      snow: 0,
      windX: 5 * WORLD.metre,
      windY: 2 * WORLD.metre,
      airDrag: 1.12,
    },
    rain: { dust: 0, rain: 1, snow: 0, windX: 2 * WORLD.metre, windY: WORLD.metre, airDrag: 1.08 },
    snow: {
      dust: 0,
      rain: 0,
      snow: 1,
      windX: WORLD.metre,
      windY: 0.5 * WORLD.metre,
      airDrag: 1.04,
    },
  },
  wind: { gustAmount: 0.18, periodMs: 27_000 },
  tank: { snowCompactionPerMetre: 0.35 },
  /**
   * Yeşillik: hücre başına örtü [0, fertility]. Yağmur ve ıslak toprak büyütür; kuru zemin, don ve
   * kar örtüsü çeker. Büyüme yalnız ekilebilir yamalarda (`fertility`) olur: yamalar tohumdan
   * türeyen sabit coğrafyadır, göl ve kaya maskeyle dışlanır.
   */
  growth: {
    /** Yama ölçeği (birim) ve gürültü eşiği [alt, üst]: aralık dışı çıplak toprak, üstü tam verimli. */
    patchSize: 1500,
    threshold: [0.6, 0.7],
    /** Yeni dünyanın verimli yamalarındaki başlangıç örtüsü (fertility oranı). */
    initial: 0.55,
    /** Tam nem ve ideal sıcaklıkta saniyede büyüme: tam örtü ~4 dakikalık yağmur/ıslaklıktır. */
    growPerSecond: 1 / 240,
    /** Bu nemin (ıslaklık) altı büyütmez; üstü doğrusal artar. */
    minMoisture: 0.12,
    /** Bu sıcaklığın (°C) altında büyüme durur, `idealTemperature`'da tam hızdır. */
    minTemperature: 3,
    idealTemperature: 15,
    /** Kuru zeminde saniyede çekilme: tam örtü ~25 dakikada solar; uykuda bu oranla yavaşlar. */
    wiltPerSecond: 1 / 1500,
    dormantWilt: 0.4,
    /** Don (bu sıcaklıkta ve altında) ek olarak çeker: tam örtü ~8 dakikada çöker. */
    frostTemperature: 0,
    frostPerSecond: 1 / 500,
    /** Kar örtüsü bu derinliğe (m) varınca ışığı keser; örtü ~20 dakikada çekilir. */
    snowSmotherDepth: 0.02,
    snowSmotherPerSecond: 1 / 1200,
    /**
     * Dayanıklı çim tabanı (fertility oranı): kuraklık, don ve kar örtüyü buraya kadar çeker. Kışın ve kar
     * altında seyrek yeşillik kalır; yağmur yeniden büyütür.
     */
    hardyFloor: 0.3,
    /** Paletin ezdiği yeşillik: yol başına üstel azalma (metre başına oran). */
    tramplePerMetre: 0.06,
  },
  temperature: { snowMaximum: -4, rainMinimum: 3 },
  surface: {
    stepMs: 100,
    cellSize: 128,
    maxCells: 9216,
    maxPuddleDepth: 0.035,
    maxSnowDepth: 0.3,
    rainMetresPerSecond: 0.00035,
    snowWaterMetresPerSecond: 0.00014,
    wetnessPerMetre: 40,
    wetDryPerSecond: 0.004,
    puddleDryMetresPerSecond: 0.00008,
    soilDrainMetresPerSecond: 0.00012,
    meltMetresPerDegreeSecond: 0.00002,
    looseSnowDensity: 0.1,
    packedSnowDensity: 0.45,
    freshSnowCompactionDecay: 12,
    wetGripLoss: 0.18,
    puddleGripLoss: 0.16,
    snowGripLoss: 0.35,
    packedSnowGripLoss: 0.15,
    minGrip: 0.28,
    puddleRolling: 0.45,
    snowRolling: 1.8,
    packedSnowRollingReduction: 0.65,
  },
} as const;

export type WeatherKind = keyof typeof WEATHER.profiles;
