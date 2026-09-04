/**
 * Telegraph (saldırı uyarısı) görsel sabitleri.
 *
 * Telegraph, bir saldırının NEREYE ve NE ZAMAN vuracağını saldırıdan önce
 * gösterir. Elite ve Boss'un tüm saldırıları bunu kullanır: okunabilirlik
 * olmadan "zorlu" dövüş adaletsiz dövüşe dönüşür.
 */
export const telegraphConfig = {
  /** Uyarı alanının dolgu saydamlığı — başlangıç (soluk). */
  fillAlphaStart: 0.08,
  /** Uyarı alanının dolgu saydamlığı — patlama anı (belirgin). */
  fillAlphaEnd: 0.34,
  /** Kenar çizgisi kalınlığı (piksel). */
  strokeWidthPx: 2,
  /** Kenar saydamlığı — başlangıç. */
  strokeAlphaStart: 0.35,
  /** Kenar saydamlığı — patlama anı. */
  strokeAlphaEnd: 1,
  /**
   * Son uyarı penceresi (süreye oran): bu eşiği geçince telegraph titrer.
   * "Şimdi kaç" sinyali — sabit bir dolgu artışı yeterince acil hissettirmiyor.
   */
  flashStartRatio: 0.72,
  /** Titreme periyodu (ms) — son pencerede. */
  flashPeriodMs: 120,
  /** Titremede saydamlığın düştüğü oran. */
  flashDepthRatio: 0.45,
  /** Koni telegraph'ının yay çözünürlüğü (segment sayısı). */
  coneSegments: 18,
  /** Varsayılan uyarı rengi (0xRRGGBB) — saldırı sahibi ezebilir. */
  defaultColor: 0xff4466,
} as const;
