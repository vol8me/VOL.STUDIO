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
  /** Tam belgenin boyutları; bölge değerlendirmesinde koordinat referansıdır. */
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** Bölgenin tam belge içindeki piksel başlangıcı. */
  readonly offsetX: number;
  readonly offsetY: number;
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
  return createUnitRegionSpace(width, height, width, height, 0, 0);
}

/**
 * Tam belgenin koordinat sisteminde bir bölge için örnekleme uzayı kurar.
 *
 * `width`/`height` çıktı tamponunun boyutudur; `canvasWidth`/`canvasHeight`
 * şeklin ve döşenebilir kafesin referans aldığı tam belgedir. Bu ayrım
 * olmadan bir tile kendi kısa kenarına yeniden normalize olur ve bölge
 * render'ı tam görüntünün crop'u olmaktan çıkar.
 */
export function createUnitRegionSpace(
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
  offsetX: number,
  offsetY: number,
): UnitSpace {
  const short = Math.min(canvasWidth, canvasHeight);
  return {
    width,
    height,
    canvasWidth,
    canvasHeight,
    offsetX,
    offsetY,
    short,
    pixelUnit: 2 / short,
    // Piksel MERKEZİ örneklenir: (px + 0.5). Köşe örneklemek şekilleri yarım
    // piksel kaydırır ve simetrik bir belge asimetrik çıkar.
    unitX: (px: number) => (2 * (px + offsetX) + 1 - canvasWidth) / short,
    unitY: (py: number) => (2 * (py + offsetY) + 1 - canvasHeight) / short,
  };
}
