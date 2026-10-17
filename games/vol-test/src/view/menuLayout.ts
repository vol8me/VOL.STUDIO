/** Panelin ekran CSS pikselindeki kenarları (`DOMRect` bunu karşılar). */
export interface PanelRect {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly width: number;
}

/** Ekranın panelden arta kalan boş alanı (CSS piksel): vitrin ve arka plan odağı buraya oturur. */
export interface FreeArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Oyun kayıt defterindeki anahtar: menü sahnesi boş alanı yazar, arka plan sahnesi okur. */
export const MENU_AREA_KEY = 'vol-test:menu-area';

/** Karartma seviyesi anahtarı: vitrinli ekran `showcase`, diğerleri `base` yazar; arka plan sahnesi okur. */
export const MENU_DIM_KEY = 'vol-test:menu-dim';

/**
 * Panelin bıraktığı boş alanı bulur. Panel kenar şeritse (en çok `stackedFraction` genişlikte) boş
 * alan şeridin geniş kalan yanıdır; ekranı kaplayan alt levhaysa levhanın üstüdür. Panel yoksa tüm
 * ekran boştur.
 */
export function freeArea(
  width: number,
  height: number,
  stackedFraction: number,
  panel?: PanelRect,
): FreeArea {
  if (!panel || panel.width <= 0) return { x: 0, y: 0, width, height };
  if (panel.width > width * stackedFraction)
    return { x: 0, y: 0, width, height: Math.max(0, Math.min(height, panel.top)) };
  const left = Math.max(0, panel.left);
  const right = Math.max(0, width - panel.right);
  return right > left
    ? { x: panel.right, y: 0, width: right, height }
    : { x: 0, y: 0, width: left, height };
}
