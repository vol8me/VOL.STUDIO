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
import type { RenderResult } from './render';

export interface QaMetric {
  id: string;
  /** Metriğin ne söylediği — rapor satırında görünür. */
  label: string;
  value: number;
  pass: boolean;
  detail: string;
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
 * Tur 1 üç metrik taşır: palet uyumu, alfa saflığı, kullanılan renk sayısı.
 * Kalan metrikler (dikiş farkı, dış çizgi sürekliliği, kontrast, bantlaşma)
 * ölçtükleri özellikler uygulandığında eklenir — ölçülecek şey yokken
 * ölçüm yazmak sıfır bilgi taşıyan yeşil bir satır üretir.
 */
export function measureSprite(result: RenderResult): QaReport {
  const { rgba, palette, doc } = result;
  const pixelCount = result.width * result.height;

  let opaquePixels = 0;
  let offPalette = 0;
  let partialAlpha = 0;
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
  }

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
