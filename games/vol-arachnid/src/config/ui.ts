export const arachnidUiConfig = {
  hud: {
    /** Bu hızın altındaki gövde "beklemede" sayılır. */
    movingThresholdPxPerSec: 8,
    /** Hız göstergesinin yuvarlama adımı — sayı her karede zıplamaz. */
    speedDisplayStepPxPerSec: 5,
  },

  /**
   * Dokunmatik yerleşim.
   *
   * Sol yarı CORE'un hareket çubuğuna aittir ve orada DOM elemanı YOKTUR —
   * bir eleman dokunuşu Phaser'dan önce yakalar ve çubuk hiç doğmaz.
   * Sağ altta gerçek bir DÜĞME durur: bölgenin tamamını kaplayan bir tuş oyun
   * alanının yarısını yutuyor ve basıldığında yaratığı gizliyordu.
   *
   * Düğme beklerken SÖNÜKTÜR, görünmez değil: sabit bir noktadaki görünmez
   * tuş bulunamaz. Basıldığında tam parlaklığa çıkar.
   */
  touch: {
    dashButtonSizePx: 84,
    /** Ekran kenarından pay (px). */
    edgeInsetPx: 22,
    /** Beklerken saydamlık; basınca 1'e çıkar. */
    idleOpacity: 0.35,
  },
} as const;
