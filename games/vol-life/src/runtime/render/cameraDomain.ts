import type { Rect } from '@volstudio/core/math/geometry';

/**
 * Kamera gezinme alanı: habitat kutusu + kontrollü Void payı (DESIGN.md §6).
 * Azami zoom-out bütün habitatı ve çevresinde anlamlı karanlığı gösterir;
 * kullanıcı sonsuz Void'a kayamaz. Sonuç depolama dikdörtgenine KIRPILMAZ —
 * Void depolamanın ötesinde de karanlıktır ve kamera oraya bakabilir.
 */
export function resolveCameraDomain(habitatBbox: Readonly<Rect>, voidMarginRatio: number): Rect {
  if (!(voidMarginRatio >= 0) || !Number.isFinite(voidMarginRatio)) {
    throw new RangeError(`Void payı negatif olmayan sonlu bir oran olmalı: ${voidMarginRatio}`);
  }
  if (!(habitatBbox.width > 0) || !(habitatBbox.height > 0)) {
    throw new RangeError('Habitat kutusu pozitif boyutlu olmalı.');
  }
  const margin = Math.max(habitatBbox.width, habitatBbox.height) * voidMarginRatio;
  return {
    x: habitatBbox.x - margin,
    y: habitatBbox.y - margin,
    width: habitatBbox.width + margin * 2,
    height: habitatBbox.height + margin * 2,
  };
}
