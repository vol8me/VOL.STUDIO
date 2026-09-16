import type { Rect } from '@volstudio/core/math/geometry';
import type { DomainSample, WorldDomain } from '@/runtime/sim/WorldDomain';

export interface HabitatGlowStyle {
  /** Void tarafında ışımanın e katı söndüğü mesafe. */
  readonly decayUnits: number;
  /** |d| ≈ 0 çevresindeki kıyı vurgusunun yarı genişliği. */
  readonly shoreWidthUnits: number;
  /** Habitat içinde ışımanın tamamen bittiği mesafe. */
  readonly interiorFadeUnits: number;
  /** Void tarafındaki taban ışıma alfası (0–1). */
  readonly voidAlpha: number;
  /** Kıyı vurgusunun tepe alfası (0–1). */
  readonly shoreAlpha: number;
  readonly color: number;
}

export interface HabitatGlowRaster {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

/**
 * Kıyı ışıması doğrudan SDF MESAFESİNDEN rasterize edilir (DESIGN.md §6).
 * Kontur noktalarını normal yönünde öteleyip çizgiyle bağlamak reddedilmiştir:
 * yüksek eğrilikte ötelenen noktalar çaprazlanır ve düz kiriş Void'den habitatın
 * içine geçen bir çizgi olarak görünür. Mesafe rasterı kendiliğinden kapalıdır
 * ve fizikle AYNI mesafe kaynağını kullanır.
 *
 * Saf fonksiyondur: aynı girdi aynı baytı verir, Phaser bilmez.
 */
export function rasterizeHabitatGlow(
  domain: WorldDomain,
  rect: Readonly<Rect>,
  resolution: number,
  style: HabitatGlowStyle,
  target = new Uint8ClampedArray(resolution * resolution * 4),
): HabitatGlowRaster {
  validate(rect, resolution, style, target);
  rasterizeRows(domain, rect, resolution, style, target, 0, resolution);
  return { width: resolution, height: resolution, pixels: target };
}

/**
 * Tek satır bandı rasterize eder ve bandın dışındaki baytlara DOKUNMAZ. Bütün
 * bantlar koşturulduğunda sonuç tek seferlik rasterle bayt bayt aynıdır (testle
 * sabit) — bölme yalnız işi kareye yayar, görüntüyü değiştirmez. 512² raster
 * ölçüldü: satır başına 1,41 ms, tek seferde 723 ms ana iş parçacığını kilitler
 * (DESIGN §18).
 */
export function rasterizeHabitatGlowRows(
  domain: WorldDomain,
  rect: Readonly<Rect>,
  resolution: number,
  style: HabitatGlowStyle,
  target: Uint8ClampedArray,
  startRow: number,
  rowCount: number,
): void {
  validate(rect, resolution, style, target);
  if (!Number.isInteger(startRow) || startRow < 0 || startRow >= resolution) {
    throw new RangeError(`Başlangıç satırı 0–${resolution - 1} aralığında olmalı: ${startRow}`);
  }
  if (!Number.isInteger(rowCount) || rowCount < 1 || startRow + rowCount > resolution) {
    throw new RangeError(`Satır sayısı bandı taşırıyor: ${startRow}+${rowCount}`);
  }
  rasterizeRows(domain, rect, resolution, style, target, startRow, rowCount);
}

function rasterizeRows(
  domain: WorldDomain,
  rect: Readonly<Rect>,
  resolution: number,
  style: HabitatGlowStyle,
  target: Uint8ClampedArray,
  startRow: number,
  rowCount: number,
): void {
  const red = (style.color >> 16) & 0xff;
  const green = (style.color >> 8) & 0xff;
  const blue = style.color & 0xff;
  const sample: DomainSample = { distance: 0, normalX: 1, normalY: 0 };
  const cellWidth = rect.width / resolution;
  const cellHeight = rect.height / resolution;
  for (let row = startRow; row < startRow + rowCount; row++) {
    const worldY = rect.y + (row + 0.5) * cellHeight;
    for (let column = 0; column < resolution; column++) {
      const worldX = rect.x + (column + 0.5) * cellWidth;
      const distance = domain.sampleDistanceAndNormal(worldX, worldY, sample).distance;
      const pixel = (row * resolution + column) * 4;
      target[pixel] = red;
      target[pixel + 1] = green;
      target[pixel + 2] = blue;
      target[pixel + 3] = Math.round(alphaAt(distance, style) * 255);
    }
  }
}

/**
 * Void tarafında üstel sönüm, kıyıda Gauss vurgusu, içeride hızlı geçiş.
 * Habitat içinde geçiş bandından uzakta alfa TAM SIFIRDIR: kiriş ya da sızıntı
 * bırakmaz.
 */
export function alphaAt(distance: number, style: HabitatGlowStyle): number {
  const shore = style.shoreAlpha * Math.exp(-((distance / style.shoreWidthUnits) ** 2));
  if (distance >= style.interiorFadeUnits) return 0;
  if (distance >= 0) {
    const interior = 1 - distance / style.interiorFadeUnits;
    return clamp01(shore * interior);
  }
  const voidGlow = style.voidAlpha * Math.exp(distance / style.decayUnits);
  return clamp01(Math.max(voidGlow, shore));
}

function validate(
  rect: Readonly<Rect>,
  resolution: number,
  style: HabitatGlowStyle,
  target: Uint8ClampedArray,
): void {
  if (!Number.isInteger(resolution) || resolution < 2) {
    throw new RangeError(`Işıma çözünürlüğü en az 2 olmalı: ${resolution}`);
  }
  if (target.length !== resolution * resolution * 4) {
    throw new RangeError(`Işıma tamponu ${resolution * resolution * 4} bayt olmalı`);
  }
  if (!(rect.width > 0) || !(rect.height > 0)) {
    throw new RangeError('Işıma dikdörtgeni pozitif boyutlu olmalı.');
  }
  const positives = [style.decayUnits, style.shoreWidthUnits, style.interiorFadeUnits];
  if (!positives.every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Işıma mesafeleri pozitif ve sonlu olmalı.');
  }
  const alphas = [style.voidAlpha, style.shoreAlpha];
  if (!alphas.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new RangeError('Işıma alfaları 0–1 aralığında olmalı.');
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
