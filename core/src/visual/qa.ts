/**
 * Ölçüm — §9. Ses tarafındaki `audio-qa`nın karşılığı ve D12'nin gereği.
 *
 * "Kötü görünüyor" takip edilemez. Bu modül çıktıyı sayıya çevirir ve
 * **ilk turdan itibaren** vardır; sonradan eklenen bir ölçüm, ölçülmeden
 * biriken bir borcun üstünü örter.
 *
 * **Tarama yöntemi: TAM tarama, örnekleme değil.** Tek bir palet dışı
 * piksel, tam olarak örneklemenin kaçıracağı şeydir. Bütün metrikler tek
 * geçişte birlikte toplanır; 4 milyon pikselin taranması onlarca
 * milisaniyedir ve örnekleme burada sahte tasarruf olurdu.
 */

import { packRgb } from './color/palette';
import { rgbToOklab } from './color/oklab';
import type { RenderResult } from './render';

/**
 * Dikiş farkının iç komşuluk farkına oranı bu değeri aşarsa dikiş GÖRÜNÜR
 * sayılır.
 *
 * Ham fark eşiği yanlış olurdu: dikişsiz bir dokuda karşı kenarlar EŞİT
 * değildir, döşenmiş düzlemde bir piksel komşudurlar. Doğru soru "kenar farkı
 * sıfır mı" değil, "kenar farkı sıradan bir komşu farkı gibi mi". Üç kat
 * pay yerel dalgalanmaya yer bırakır, gerçek bir dikişi (tipik olarak on
 * kat ve üstü) yakalamaya fazlasıyla yeter.
 */
const SEAM_RATIO_LIMIT = 3;

/** 0..255 ölçeğinde bu farkın altı "fark yok" sayılır. */
const SEAM_EPSILON = 1;

/**
 * Çıktının, paletin sunduğu parlaklık aralığından kullanması gereken asgari
 * pay.
 *
 * Mutlak bir kontrast eşiği yanlış olurdu: paletin kendisi düz ise çıktının
 * kontrastlı olması beklenemez. Ölçü ORANdır — "verilen aralığın ne kadarını
 * kullandın". Beş adımlık bir rampanın yalnızca ikisini kullanan bir sprite
 * bu oranın altına düşer.
 */
const CONTRAST_MIN_RATIO = 0.3;

/** Paletin kendisi bu kadar düzse kontrast ölçümü anlamsızdır. */
const FLAT_PALETTE_SPAN = 0.05;

/**
 * Rampanın UÇ adımlarının kaplayabileceği azami pay.
 *
 * Ölçülen şey "bir renk çok yer kaplıyor mu" DEĞİL: geniş ve düz bir yüzey
 * tamamen meşrudur. §9'un sorduğu, gölgenin rampanın UÇLARINDA birikip
 * ortasını boş bırakması — yani aydınlığın iki değere çökmesi. Yalnızca üç ve
 * daha fazla adımlı rampalar sayılır; iki adımlı bir rampanın ortası yoktur.
 */
const BANDING_MAX_EDGE_SHARE = 0.9;
const BANDING_MIN_STEPS = 3;

export interface QaMetric {
  id: string;
  /** Metriğin ne söylediği — rapor satırında görünür. */
  label: string;
  value: number;
  pass: boolean;
  detail: string;
}

interface SeamMeasurement {
  /** Sarma sınırındaki ortalama piksel farkı, 0..255. */
  readonly seam: number;
  /** Sıradan komşu piksellerin ortalama farkı, 0..255. */
  readonly interior: number;
}

/** İki piksel sütunu/satırı arasındaki ortalama mutlak RGBA farkı. */
function meanDelta(
  rgba: Uint8ClampedArray,
  count: number,
  indexA: (i: number) => number,
  indexB: (i: number) => number,
): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    const a = indexA(i) * 4;
    const b = indexB(i) * 4;
    total +=
      Math.abs(rgba[a] - rgba[b]) +
      Math.abs(rgba[a + 1] - rgba[b + 1]) +
      Math.abs(rgba[a + 2] - rgba[b + 2]) +
      Math.abs(rgba[a + 3] - rgba[b + 3]);
  }
  return total / (count * 4);
}

/**
 * Sarma sınırındaki farkı, sıradan komşuluk farkıyla birlikte ölçer.
 *
 * İç referans TÜM komşu sütun/satır çiftleri üzerinden alınır; örnekleme
 * burada da sahte tasarruf olurdu (§9).
 */
function measureSeams(result: RenderResult): SeamMeasurement {
  const { rgba, width, height } = result;

  const columnSeam = meanDelta(
    rgba,
    height,
    (y) => y * width + (width - 1),
    (y) => y * width,
  );
  const rowSeam = meanDelta(
    rgba,
    width,
    (x) => (height - 1) * width + x,
    (x) => x,
  );

  let columnInterior = 0;
  for (let x = 0; x < width - 1; x++) {
    columnInterior += meanDelta(
      rgba,
      height,
      (y) => y * width + x,
      (y) => y * width + x + 1,
    );
  }
  let rowInterior = 0;
  for (let y = 0; y < height - 1; y++) {
    rowInterior += meanDelta(
      rgba,
      width,
      (x) => y * width + x,
      (x) => (y + 1) * width + x,
    );
  }

  return {
    seam: Math.max(columnSeam, rowSeam),
    interior: Math.max(
      width > 1 ? columnInterior / (width - 1) : 0,
      height > 1 ? rowInterior / (height - 1) : 0,
    ),
  };
}

/** Paletin sunduğu OKLab parlaklık aralığı — kontrast ölçümünün paydası. */
function paletteLightnessSpan(result: RenderResult): number {
  const { palette } = result;
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < palette.colorCount; i++) {
    const lightness = rgbToOklab(
      palette.rgb[i * 3],
      palette.rgb[i * 3 + 1],
      palette.rgb[i * 3 + 2],
    ).L;
    if (lightness < low) low = lightness;
    if (lightness > high) high = lightness;
  }
  return palette.colorCount > 0 ? high - low : 0;
}

/** Görüntü KENARINA değen opak piksel sayısı — dış çizgi orada kırpılır. */
function countBorderPixels(result: RenderResult): number {
  const { rgba, width, height } = result;
  let count = 0;
  const opaque = (x: number, y: number): boolean => rgba[(y * width + x) * 4 + 3] > 0;

  for (let x = 0; x < width; x++) {
    if (opaque(x, 0)) count++;
    if (height > 1 && opaque(x, height - 1)) count++;
  }
  for (let y = 1; y < height - 1; y++) {
    if (opaque(0, y)) count++;
    if (width > 1 && opaque(width - 1, y)) count++;
  }
  return count;
}

/**
 * Silüetin kopuk parça sayısı — dört komşuluk, yığın tabanlı taşma doldurma.
 *
 * Özyineleme KULLANILMAZ: büyük bir silüet 4 milyon derinliğe inebilir ve
 * ölçüm aracı, ölçtüğü şeyi bildirmek yerine süreci öldürür.
 */
function countComponents(result: RenderResult): number {
  const { rgba, width, height } = result;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  let components = 0;

  for (let start = 0; start < seen.length; start++) {
    if (seen[start] === 1 || rgba[start * 4 + 3] === 0) continue;
    components++;
    stack.push(start);
    seen[start] = 1;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index / width) | 0;
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      for (const next of neighbours) {
        if (next < 0 || seen[next] === 1 || rgba[next * 4 + 3] === 0) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
  }

  return components;
}

interface BandingMeasurement {
  /** Üç ve daha fazla adımlı rampa kullanan opak piksel sayısı. */
  readonly considered: number;
  /** Bunların kaçı rampanın ilk ya da son adımına düştü. */
  readonly atEdges: number;
}

/** Gölgenin rampa adımlarına dağılımını ölçer (§9 "uç birikme"). */
function measureBanding(result: RenderResult): BandingMeasurement {
  const { rgba, shade, channels, palette } = result;
  let considered = 0;
  let atEdges = 0;

  for (let i = 0; i < shade.length; i++) {
    if (rgba[i * 4 + 3] === 0) continue;
    const indices = palette.ramps.get(channels.material[i]);
    if (!indices || indices.length < BANDING_MIN_STEPS) continue;

    considered++;
    const value = shade[i] < 0 ? 0 : shade[i] > 1 ? 1 : shade[i];
    const step = Math.min(indices.length - 1, Math.floor(value * indices.length));
    if (step === 0 || step === indices.length - 1) atEdges++;
  }

  return { considered, atEdges };
}

export interface QaReport {
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  /** Alfası sıfırdan büyük piksel sayısı — ölçümlerin paydası. */
  readonly opaquePixels: number;
  readonly metrics: readonly QaMetric[];
  /** Metriklerin hepsi geçti mi? */
  readonly pass: boolean;
}

/**
 * Sprite'ı ölçer.
 *
 * Palet uyumu, alfa saflığı ve renk sayısı her belgede ölçülür; dikiş farkı
 * yalnızca `tileable: true` iken eklenir çünkü döşenmeyen bir çıktıda
 * kenarların birbirini tutması için hiçbir sebep yoktur.
 *
 * Kalan metrikler (dış çizgi sürekliliği, kontrast, bantlaşma) ölçtükleri
 * özellikler uygulandığında eklenir — ölçülecek şey yokken ölçüm yazmak
 * sıfır bilgi taşıyan yeşil bir satır üretir.
 */
export function measureSprite(result: RenderResult): QaReport {
  const { rgba, palette, doc } = result;
  const pixelCount = result.width * result.height;

  let opaquePixels = 0;
  let offPalette = 0;
  let partialAlpha = 0;
  let usedLow = Infinity;
  let usedHigh = -Infinity;
  const distinct = new Set<number>();

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const alpha = rgba[offset + 3];

    // Şeffaflık istisnadır (§7.2): alfa 0 piksel palet dışı sayılmaz.
    if (alpha === 0) continue;
    if (alpha !== 255) partialAlpha++;
    opaquePixels++;

    const packedColor = packRgb(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
    distinct.add(packedColor);
    if (!palette.packed.has(packedColor)) offPalette++;

    const lightness = rgbToOklab(rgba[offset], rgba[offset + 1], rgba[offset + 2]).L;
    if (lightness < usedLow) usedLow = lightness;
    if (lightness > usedHigh) usedHigh = lightness;
  }

  const usedSpan = opaquePixels > 0 ? usedHigh - usedLow : 0;
  const paletteSpan = paletteLightnessSpan(result);
  const banding = measureBanding(result);

  // Kısmi alfa, kenar yumuşatma açıkken ya da bir katman saydamken BEKLENİR;
  // ikisi de kapalıyken saçak demektir ve kapıyı kırmalıdır.
  const softnessRequested =
    (doc.antialias ?? false) || doc.layers.some((layer) => (layer.opacity ?? 1) < 1);

  const metrics: QaMetric[] = [
    {
      id: 'paletteCompliance',
      label: 'Palet uyumu',
      value: offPalette,
      pass: offPalette === 0,
      detail:
        offPalette === 0
          ? 'palet dışı piksel yok'
          : `${offPalette} piksel palet dışı — nicemleme sonrası renk üreten bir adım var`,
    },
    {
      id: 'alphaPurity',
      label: 'Alfa saflığı',
      value: partialAlpha,
      pass: softnessRequested || partialAlpha === 0,
      detail: softnessRequested
        ? `${partialAlpha} kısmi alfa piksel — kenar yumuşatma ya da saydam katman istendiği için beklenir`
        : `${partialAlpha} kısmi alfa piksel — antialias kapalı ve her katman opak, saçak olmamalı`,
    },
    {
      id: 'colorCount',
      label: 'Kullanılan renk sayısı',
      value: distinct.size,
      pass: distinct.size <= palette.colorCount,
      detail: `${distinct.size} / ${palette.colorCount} palet rengi kullanıldı`,
    },
  ];

  // Silüet bileşenleri — dış çizgi ölçümünün ayrıntısında raporlanır.
  const components = countComponents(result);

  if (doc.post?.outline && (doc.post.outline.mode ?? 'outside') !== 'inside') {
    // Dış çizgi DIŞARI doğru büyür; silüet görüntü kenarına değiyorsa o
    // kenarda çizilecek yer yoktur ve halka kırpılır. `dilate` her zaman
    // kapalı bir halka ürettiği için tek gerçek kopma biçimi budur — §9'un
    // "tek bileşen" eşiği ise `scatter` ile geçersiz kaldı: çok parçalı
    // sprite meşrudur.
    const clipped = countBorderPixels(result);
    metrics.push({
      id: 'outlineContinuity',
      label: 'Dış çizgi sürekliliği',
      value: clipped,
      pass: clipped === 0,
      detail:
        clipped === 0
          ? `halka kapalı; silüet ${components} parça`
          : `${clipped} piksel görüntü kenarına değiyor, dış çizgi orada kırpıldı`,
    });
  }

  if (paletteSpan > FLAT_PALETTE_SPAN) {
    const ratio = usedSpan / paletteSpan;
    metrics.push({
      id: 'contrast',
      label: 'Kontrast oranı',
      value: Number(ratio.toFixed(3)),
      pass: ratio >= CONTRAST_MIN_RATIO,
      detail: `paletin OKLab L aralığının %${Math.round(
        ratio * 100,
      )}'i kullanıldı (asgari %${Math.round(CONTRAST_MIN_RATIO * 100)})`,
    });
  }

  if (banding.considered > 0) {
    const share = banding.atEdges / banding.considered;
    metrics.push({
      id: 'banding',
      label: 'Bantlaşma',
      value: Number(share.toFixed(3)),
      pass: share <= BANDING_MAX_EDGE_SHARE,
      detail: `çok adımlı rampalarda piksellerin %${Math.round(
        share * 100,
      )}'i UÇ adımlarda (azami %${Math.round(BANDING_MAX_EDGE_SHARE * 100)})`,
    });
  }

  if (doc.tileable === true) {
    const seams = measureSeams(result);
    const ratio = seams.interior > SEAM_EPSILON ? seams.seam / seams.interior : seams.seam;
    const pass =
      seams.interior > SEAM_EPSILON ? ratio <= SEAM_RATIO_LIMIT : seams.seam <= SEAM_EPSILON;
    metrics.push({
      id: 'seamDelta',
      label: 'Dikiş farkı',
      value: Number(ratio.toFixed(2)),
      pass,
      detail: `sarma sınırı ${seams.seam.toFixed(2)}, iç komşuluk ${seams.interior.toFixed(
        2,
      )} (oran ${ratio.toFixed(2)}, sınır ${SEAM_RATIO_LIMIT})`,
    });
  }

  return {
    width: result.width,
    height: result.height,
    pixelCount,
    opaquePixels,
    metrics,
    pass: metrics.every((metric) => metric.pass),
  };
}

/** Raporu insan okunur satırlara çevirir — CLI ve editör aynı metni gösterir. */
export function formatQaReport(report: QaReport): string {
  const lines = [
    `${report.width}x${report.height} — ${report.opaquePixels}/${report.pixelCount} piksel opak`,
  ];
  for (const metric of report.metrics) {
    lines.push(`  ${metric.pass ? '✓' : '✗'} ${metric.label}: ${metric.value} — ${metric.detail}`);
  }
  return lines.join('\n');
}
