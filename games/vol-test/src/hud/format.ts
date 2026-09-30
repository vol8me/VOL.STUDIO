/** HUD sayı biçimleri. */

/** Birim/saniyeyi metre/saniyeye çevirir, bir ondalıkla. */
export function formatSpeed(unitsPerSecond: number, metre: number): string {
  return (unitsPerSecond / metre).toFixed(1);
}

/**
 * Ekran açısını (0 = sağ, saat yönü artı) pusula derecesine çevirir:
 * 0° kuzey (ekranın üstü), 90° doğu.
 */
export function compassDegrees(angle: number): number {
  const degrees = Math.round(((angle * 180) / Math.PI + 90) % 360);
  return (degrees + 360) % 360;
}

export function formatHeading(angle: number): string {
  return `${String(compassDegrees(angle)).padStart(3, '0')}°`;
}

/** Dünya konumunu metreye çevirir. */
export function formatMetres(value: number, metre: number): string {
  return String(Math.round(value / metre));
}
