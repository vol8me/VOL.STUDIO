/**
 * Cephe hattının dünyadaki sunumu (bölge halkaları, üsler). Oynanış sayısı değildir; yalnız çizimi
 * belirler. Cephe renkleri `ONLINE_VIEW.colors.teams` ile aynı tablodan gelir.
 */
export const FRONT_VIEW = {
  /** Izgara (-100) ve sınırın (-95) üstünde, araç gölgelerinin (9) altında. */
  depth: -80,
  colors: {
    /** Sahipsiz bölge. */
    neutral: 0x9aa4ab,
  },
  zone: {
    fillAlpha: 0.1,
    ringAlpha: 0.55,
    ringWidth: 6,
    /** Ele geçirme ilerlemesi halkanın içinde, bu oranda küçük bir yayla gösterilir. */
    progressInset: 0.86,
    progressWidth: 14,
    progressAlpha: 0.85,
    /** Tartışmalı bölgenin halkası bu hızla (Hz) soluklaşıp parlar. */
    contestedPulseHz: 1.6,
  },
  base: {
    ringAlpha: 0.7,
    ringWidth: 8,
    fillAlpha: 0.08,
    /** Üs merkezindeki işaretin yarı kenarı (birim). */
    markHalf: 56,
  },
  /** Halkası kameranın görünen alanına bu kadar (birim) yaklaşmamışsa çizilmez. */
  cullMargin: 80,
} as const;
