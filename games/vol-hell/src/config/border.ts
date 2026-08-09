/** Saha sınırı parametreleri. Kameradan küçük bir alan — hiçbir şey dışarı çıkamaz. */
export const borderConfig = {
  /** Viewport kenarından içeri boşluk (piksel). Border rect bu kadar içeride çizilir. */
  margin: 60,
  /** Çizgi kalınlığı (piksel). */
  lineWidth: 2,
  /** Çizgi rengi (0xRRGGBB, Phaser sayısal format). */
  color: 0x4488cc,
  /** Çizgi opaklığı (0-1). */
  alpha: 0.6,
} as const;

export type BorderConfig = typeof borderConfig;

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
