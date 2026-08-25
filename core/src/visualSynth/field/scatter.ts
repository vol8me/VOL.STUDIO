/**
 * Serpme — §4.2b. Alan-uzayı işlemi DEĞİL, örnekleme işlemi.
 *
 * Bir alan-uzayı işlemi tek çıktı noktasını tek girdi noktasına götürür ve
 * tersi vardır; `scatter` bir çıktı noktasına N aday demektir. Yanlış
 * kategoride durması, ters dönüşümü varmış gibi uygulanmasına yol açardı.
 *
 * **Maliyet.** Piksel başına N örnek denemek 1024²'de N=200 ile 200 milyon
 * değerlendirmedir; kabul edilemez. Belge bunun çözümü olarak sınırlayıcı
 * kutu + uzamsal kova önerir. Burada kutu var, kova YOK ve bu bilinçlidir:
 * kova indeksi "bu pikseli hangi örnekler kapsıyor?" sorusunu cevaplamak
 * içindir; örnekler üzerinde dönüp HER BİRİNİ KENDİ KUTUSUNA damgalamak aynı
 * soruyu inşa gereği cevaplar. Maliyet damgalanan toplam alan kadardır —
 * kovalı çözümle aynı sınıf, bir veri yapısı eksiğiyle.
 *
 * Örnekler DÜZENLİ IZGARAYA yerleştirilip `jitter` kadar sapar. Tamamen
 * rastgele konum kümelenme ve boşluk üretir; ızgara + sapma hem düzgün
 * dağılım hem doğal görünüm verir ve `jitter: 1` neredeyse rastgeleye eşittir.
 *
 * **Kaynak tampona yazılırken KIRPILIR.** Kaynak alanı tuvalin dışına taşacak
 * kadar ötelenmişse taşan kısım hiç üretilmez ve damgalarda da bulunmaz;
 * `tileable` sarması ÖRNEĞİN çıktı konumuna uygulanır, kaynağın kendi
 * çizimine değil. Bu yüzden kaynak KÖKENDE ORTALANMIŞ olmalıdır (şemada da
 * öyle yazar) — konumlandırma serpmenin işidir, kaynağın değil.
 */

import { hash1 } from './hash';
import type { FieldBuffer } from './buffer';
import type { UnitSpace } from './space';
import { toPixelX, toPixelY } from './sample';

export interface ScatterOptions {
  count: number;
  seed: number;
  /** Hücre boyuna oranla azami sapma (0 = tam ızgara). */
  jitter: number;
  /** Azami dönme sapması, RADYAN. */
  rotJitter: number;
  /** Azami ölçek sapması oranı (0.2 → 0.8x–1.2x). */
  scaleJitter: number;
  /** Eski belgeler için varsayılan `grid`; alternatif deterministik Poisson. */
  distribution?: 'grid' | 'poisson';
  /** Poisson merkezleri arası asgari uzaklık, BİRİM uzayda. */
  minDistance?: number;
  tileable: boolean;
}

interface SourceExtent {
  /** Kaynağın merkezine göre azami yarıçap, piksel. */
  radius: number;
  empty: boolean;
}

interface ScatterPoint {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly scale: number;
}

/**
 * Kaynağın sıfırdan büyük piksellerinin merkeze göre azami uzaklığı.
 *
 * Damga kutusu bundan türetilir. Dönme ve ölçek de dâhil edildiği için
 * ÇEVREL yarıçap kullanılır: dikdörtgen bir kutuyu döndürmek köşeleri dışarı
 * taşırır ve damga kırpılırdı.
 */
function measureSource(buffer: FieldBuffer, centerX: number, centerY: number): SourceExtent {
  let radius = 0;
  let empty = true;

  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      if (buffer.data[y * buffer.width + x] <= 0) continue;
      empty = false;
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > radius) radius = distance;
    }
  }

  return { radius, empty };
}

function gridPoints(space: UnitSpace, options: ScatterOptions): ScatterPoint[] {
  const { width, height } = space;
  // Izgara en-boy oranını izler; aksi hâlde dar bir çıktıda örnekler
  // tek eksende sıkışır.
  const columns = Math.max(1, Math.round(Math.sqrt((options.count * width) / height)));
  const rows = Math.max(1, Math.ceil(options.count / columns));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const points: ScatterPoint[] = [];

  for (let index = 0; index < options.count; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    points.push({
      x:
        (column + 0.5) * cellWidth +
        (hash1(index * 4 + 0, options.seed) - 0.5) * options.jitter * cellWidth,
      y:
        (row + 0.5) * cellHeight +
        (hash1(index * 4 + 1, options.seed) - 0.5) * options.jitter * cellHeight,
      angle: (hash1(index * 4 + 2, options.seed) - 0.5) * 2 * options.rotJitter,
      scale: 1 + (hash1(index * 4 + 3, options.seed) - 0.5) * 2 * options.scaleJitter,
    });
  }

  return points;
}

function poissonPoints(space: UnitSpace, options: ScatterOptions): ScatterPoint[] {
  const { width, height } = space;
  // Açık mesafe verilmezse hedef count ve tuval alanından dengeli bir
  // başlangıç üret. `undefined`ın tamamen rastgele dağılıma dönüşmesi,
  // Poisson kipinin adını boşa çıkarır ve eski grid kipinden daha kötü boşluk
  // kümeleri üretebilirdi.
  const defaultDistancePixels = 0.55 * Math.sqrt((width * height) / options.count);
  const requestedUnitDistance =
    options.minDistance ?? (defaultDistancePixels * 2) / Math.max(1, space.short);
  const minDistance = Math.max(0, (requestedUnitDistance * space.short) / 2);
  if (minDistance === 0) {
    const points: ScatterPoint[] = [];
    for (let index = 0; index < options.count; index++) {
      points.push({
        x: hash1(index * 4 + 0, options.seed) * width,
        y: hash1(index * 4 + 1, options.seed) * height,
        angle: (hash1(index * 4 + 2, options.seed) - 0.5) * 2 * options.rotJitter,
        scale: 1 + (hash1(index * 4 + 3, options.seed) - 0.5) * 2 * options.scaleJitter,
      });
    }
    return points;
  }

  // Hücre köşegeni minDistance'tan küçük tutulur; böylece kabul edilebilir
  // aday yalnızca 5×5 komşulukta aranır. Tamamen rastgele O(N²) tarama yerine
  // sabit bir uzamsal kova kullanmak yüksek count değerlerinde gereklidir.
  const bucketSize = minDistance / Math.SQRT2;
  const columns = Math.max(1, Math.ceil(width / bucketSize));
  const rows = Math.max(1, Math.ceil(height / bucketSize));
  const buckets = new Map<number, number[]>();
  const points: ScatterPoint[] = [];

  const wrapIndex = (value: number, size: number): number => ((value % size) + size) % size;
  const bucketKey = (x: number, y: number): number => y * columns + x;
  const bucketOf = (x: number, y: number): [number, number] => [
    Math.min(columns - 1, Math.floor(x / bucketSize)),
    Math.min(rows - 1, Math.floor(y / bucketSize)),
  ];
  const distanceSquared = (a: ScatterPoint, x: number, y: number): number => {
    let dx = Math.abs(a.x - x);
    let dy = Math.abs(a.y - y);
    if (options.tileable) {
      dx = Math.min(dx, width - dx);
      dy = Math.min(dy, height - dy);
    }
    return dx * dx + dy * dy;
  };

  const isFarEnough = (candidate: ScatterPoint): boolean => {
    const [column, row] = bucketOf(candidate.x, candidate.y);
    const checked = new Set<number>();
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const neighbourX = options.tileable ? wrapIndex(column + ox, columns) : column + ox;
        const neighbourY = options.tileable ? wrapIndex(row + oy, rows) : row + oy;
        if (neighbourX < 0 || neighbourX >= columns || neighbourY < 0 || neighbourY >= rows)
          continue;
        const key = bucketKey(neighbourX, neighbourY);
        if (checked.has(key)) continue;
        checked.add(key);
        for (const index of buckets.get(key) ?? []) {
          if (distanceSquared(points[index], candidate.x, candidate.y) < minDistance * minDistance)
            return false;
        }
      }
    }
    return true;
  };

  // Sabit aday bütçesi sonucu seed'e bağlı ama çağrı sırasından bağımsız
  // kılar. Yüksek minimum mesafe istenirse hedef count'a ulaşılamayabilir;
  // bu durum daha sonra QA/preview katmanında görünür olmalıdır.
  const attempts = Math.max(64, options.count * 64);
  for (let attempt = 0; attempt < attempts && points.length < options.count; attempt++) {
    const candidate: ScatterPoint = {
      x: hash1(attempt * 4 + 0, options.seed) * width,
      y: hash1(attempt * 4 + 1, options.seed) * height,
      angle: (hash1(attempt * 4 + 2, options.seed) - 0.5) * 2 * options.rotJitter,
      scale: 1 + (hash1(attempt * 4 + 3, options.seed) - 0.5) * 2 * options.scaleJitter,
    };
    if (!isFarEnough(candidate)) continue;
    const index = points.push(candidate) - 1;
    const [column, row] = bucketOf(candidate.x, candidate.y);
    const key = bucketKey(column, row);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  }

  return points;
}

/**
 * Kaynağı `count` kez, kendi dönüşümüyle hedefe damgalar; birleştirme `max`.
 *
 * Her örnek dönüşümünü TOHUMDAN türetir (D5): aynı belge aynı serpmeyi verir.
 */
export function renderScatter(
  source: FieldBuffer,
  target: Float32Array,
  space: UnitSpace,
  options: ScatterOptions,
): void {
  const centerX = toPixelX(space, 0);
  const centerY = toPixelY(space, 0);
  const extent = measureSource(source, centerX, centerY);
  if (extent.empty) return;

  const { width, height } = space;
  // Izgara en-boy oranını izler; aksi hâlde dar bir çıktıda örnekler
  // tek eksende sıkışır.
  const points =
    (options.distribution ?? 'grid') === 'poisson'
      ? poissonPoints(space, options)
      : gridPoints(space, options);

  for (const point of points) {
    const { angle, scale } = point;
    if (!(scale > 0)) continue;

    const originX = point.x;
    const originY = point.y;

    const reach = Math.ceil(extent.radius * scale) + 1;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const inverseScale = 1 / scale;

    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        let ox = Math.round(originX) + dx;
        let oy = Math.round(originY) + dy;

        if (options.tileable) {
          ox = ((ox % width) + width) % width;
          oy = ((oy % height) + height) % height;
        } else if (ox < 0 || oy < 0 || ox >= width || oy >= height) {
          continue;
        }

        // Örneğin kendi çerçevesine dön: ölçek ve dönmenin TERSİ.
        const sx = Math.round(centerX + (dx * cos - dy * sin) * inverseScale);
        const sy = Math.round(centerY + (dx * sin + dy * cos) * inverseScale);
        if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;

        // Kaynağın DIŞI sıfırdır, kenar değeri uzatılmaz: damga kendi
        // sınırında bitmeli, tampon kenarına yayılmamalı.
        const value = source.data[sy * source.width + sx];
        const targetIndex = oy * width + ox;
        if (value > target[targetIndex]) target[targetIndex] = value;
      }
    }
  }
}
