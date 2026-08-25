/**
 * Piksel ↔ birim uzay eşlemesi — D2'nin koordinat sözleşmesi.
 *
 * Birim uzayın **kökeni merkezdedir** ve birim **kısa kenarın yarısıdır**:
 * kısa eksen `[-1, 1]`, uzun eksen `[-a, a]` (`a = uzun / kısa`).
 *
 * İki gerekçe (§ D2):
 * 1. `[0,1]²`yi dikdörtgene esnetmek daireyi elipse çevirir ve her SDF'yi
 *    en-boy oranına bağımlı kılar. Kısa kenar normalizasyonu şekli korur.
 * 2. Simetri doğal olur: `x = 0` etrafında aynalamak, `x = 0.5` etrafında
 *    aynalamaktan daha az parametre taşır.
 *
 * **+y AŞAĞIDIR.** Çıktı bir görüntüdür ve tampon indeksi doğrudan satıra
 * eşlenir; ayrıca ışık yönü `[-0.55, -0.7, …]` bu eksende sol-üst demektir
 * ki piksel sanatının alışılmış anahtar ışığı odur. Bunun yan sonucu:
 * pozitif açı görsel olarak SAAT YÖNÜNDE döner.
 */

export interface UnitSpace {
  readonly width: number;
  readonly height: number;
  /** Kısa kenar — normalizasyon böleni. */
  readonly short: number;
  /** Bir pikselin birim uzaydaki uzunluğu. */
  readonly pixelUnit: number;
  /** Piksel merkezinin birim-uzay x'i. */
  unitX(px: number): number;
  /** Piksel merkezinin birim-uzay y'si. */
  unitY(py: number): number;
}

export function createUnitSpace(width: number, height: number): UnitSpace {
  const short = Math.min(width, height);
  return {
    width,
    height,
    short,
    pixelUnit: 2 / short,
    // Piksel MERKEZİ örneklenir: (px + 0.5). Köşe örneklemek şekilleri yarım
    // piksel kaydırır ve simetrik bir belge asimetrik çıkar.
    unitX: (px: number) => (2 * px + 1 - width) / short,
    unitY: (py: number) => (2 * py + 1 - height) / short,
  };
}
