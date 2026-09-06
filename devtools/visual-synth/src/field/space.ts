/**
 * Piksel ↔ birim uzay eşlemesi (D2 koordinat sözleşmesi). Köken MERKEZDE,
 * birim KISA KENARIN YARISI: kısa eksen `[-1,1]`, uzun eksen `[-a,a]`.
 *
 * `[0,1]²`yi esnetmek daireyi elipse çevirir ve her SDF'yi en-boy oranına
 * bağlar; kısa kenar normalizasyonu şekli korur. Simetri de ucuzlar.
 *
 * **+y AŞAĞIDIR:** tampon indeksi doğrudan satıra eşlenir ve ışık yönü bu
 * eksende sol-üst olur. Yan sonucu, pozitif açı SAAT YÖNÜNDE döner.
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
