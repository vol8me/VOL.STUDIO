/** HUD sayı biçimleri. */

/** Dünya konumunu metreye çevirir. */
export function formatMetres(value: number, metre: number): string {
  return String(Math.round(value / metre));
}
