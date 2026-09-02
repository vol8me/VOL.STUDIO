export const arachnidUiConfig = {
  hud: {
    /** Bu hızın altındaki gövde "beklemede" sayılır. */
    movingThresholdPxPerSec: 8,
    /** Hız göstergesinin yuvarlama adımı — sayı her karede zıplamaz. */
    speedDisplayStepPxPerSec: 5,
  },

  /**
   * Dokunmatik yerleşim: ekran İKİYE bölünür.
   *
   * Sol bölge CORE'un hareket çubuğuna aittir ve orada DOM elemanı YOKTUR —
   * bir eleman koymak dokunuşu Phaser'dan önce yakalar ve çubuk hiç doğmaz.
   * Sağ bölge atılım düğmesidir; küçük bir daire yerine bölgenin tamamını
   * kaplar, çünkü başparmak yatay tutuşta sabit bir noktaya nişan alamaz.
   *
   * İkisi de dokunulmadıkça GÖRÜNMEZ: çubuğu CORE yalnız aktifken çizer,
   * düğme ise basılana kadar saydamdır.
   */
  touch: {
    /** Sağ bölgenin ekran genişliğine oranı. */
    dashZoneWidthRatio: 0.5,
    /** Bölgenin HUD boşluklarından uzak duracağı pay (px). */
    edgeInsetPx: 4,
  },
} as const;
