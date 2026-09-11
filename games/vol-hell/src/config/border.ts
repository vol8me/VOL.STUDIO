/** Saha sınırı parametreleri. Kameradan küçük bir alan — hiçbir şey dışarı çıkamaz. */
export const borderConfig = {
  /** Viewport kenarından içeri boşluk (piksel). Border rect bu kadar içeride çizilir. */
  margin: 60,
  /** Margin'in viewport boyutuna oranla ust sınırı — dar pencerede sahanin ters dönmesini onler. */
  maxMarginRatio: 0.25,
  /** HUD ile oynanabilir saha arasında bırakılan görsel nefes payı. */
  hudGapPx: 12,
  /** Üst ve alt rezervin birlikte kaplayabileceği viewport oranı. */
  maxReserveRatio: 0.7,
  /** Çizgi kalınlığı (piksel). */
  lineWidth: 2,
  /** Çizgi rengi (0xRRGGBB, Phaser sayısal format). */
  color: 0x4488cc,
  /** Çizgi opaklığı (0-1). */
  alpha: 0.6,
} as const;

/** Saha sınırlarını temsil eden dikdörtgen. */
export interface BorderBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}
