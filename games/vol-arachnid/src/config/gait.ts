/**
 * Yürüyüş ayarları.
 *
 * `standReach`, ayağın kalçadan uzaklığını uzvun TAM uzanımına oran olarak
 * verir. 1'e yaklaştıkça bacak düzleşir ve gövde yere yapışır; küçüldükçe diz
 * bükülür ve gövde yükselir — "ayakta duran örümcek" hissi bu orandan gelir.
 */
const LEG_STANCE_OFFSETS_DEG: Readonly<Record<string, number>> = {
  r0: -18,
  r1: -10,
  r2: 10,
  r3: 25,
  l0: 18,
  l1: 10,
  l2: -10,
  l3: -25,
};

export const gaitConfig = {
  standReach: 0.8,
  /** Düz export pozunu, ön/arka bacakları okunur kılan simetrik bir yelpazeye açar. */
  legStanceOffsetsDeg: LEG_STANCE_OFFSETS_DEG,
  /** Kuyruk uzuvları gövdeye daha yakın durur. */
  tailStandReach: 0.86,

  stepTriggerPx: 30,
  runStepTriggerPx: 48,
  stepDurationMs: 180,
  runStepDurationMs: 105,
  /** Bu hızda koşu adımının tam tempo değerleri kullanılır. */
  fullTempoSpeedPxPerSec: 260,
  /** Adım hedefini hız yönünde ileri koyar; ayak gideceği yere basar. */
  stepLeadSeconds: 0.13,

  /**
   * Adım havadayken ayağı kalçaya doğru KISALTIR: diz daha çok bükülür, uzuv
   * yerden çekilmiş görünür. Salt ekran kaydırması tek başına bunu vermez.
   */
  swingTuckPx: 16,
} as const;
