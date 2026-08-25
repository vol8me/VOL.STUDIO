import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSprite } from '../../src/visualSynth/render';
import { formatQaReport, measureSprite } from '../../src/visualSynth/qa';
import type { RenderResult } from '../../src/visualSynth/render';

const loadFixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf-8'),
  ) as unknown;

const metric = (result: RenderResult, id: string) =>
  measureSprite(result).metrics.find((entry) => entry.id === id)!;

describe('ölçüm (§9, D12)', () => {
  it('temiz bir sprite tüm metrikleri geçer', () => {
    const report = measureSprite(renderSprite(loadFixture('composite')));
    expect(report.pass).toBe(true);
    // Her belgede ölçülenler; koşullu metrikler (dikiş, dış çizgi) yok.
    expect(report.metrics.map((entry) => entry.id)).toEqual([
      'paletteCompliance',
      'alphaPurity',
      'colorCount',
      'contrast',
      'banding',
    ]);
  });

  it('palet dışı TEK piksel yakalanır — örnekleme bunu kaçırırdı', () => {
    const result = renderSprite(loadFixture('composite'));
    // Ortadaki bir pikseli paletin dışına taşı.
    const center = (result.height / 2) * result.width + result.width / 2;
    result.rgba[center * 4] = 7;
    result.rgba[center * 4 + 1] = 7;
    result.rgba[center * 4 + 2] = 7;
    result.rgba[center * 4 + 3] = 255;

    const entry = metric(result, 'paletteCompliance');
    expect(entry.value).toBe(1);
    expect(entry.pass).toBe(false);
    expect(measureSprite(result).pass).toBe(false);
  });

  it('şeffaflık palet dışı sayılmaz (§7.2)', () => {
    const result = renderSprite(loadFixture('composite'));
    const report = measureSprite(result);

    expect(report.opaquePixels).toBeLessThan(report.pixelCount);
    expect(report.metrics[0].value).toBe(0);
  });

  it('kenar yumuşatma kapalıyken kısmi alfa kapıyı KIRAR', () => {
    const result = renderSprite(loadFixture('union'));
    expect(metric(result, 'alphaPurity').pass).toBe(true);

    result.rgba[3] = 128;
    const broken = metric(result, 'alphaPurity');
    expect(broken.value).toBe(1);
    expect(broken.pass).toBe(false);
    expect(broken.detail).toMatch(/saçak olmamalı/);
  });

  it('kenar yumuşatma açıkken kısmi alfa BEKLENİR', () => {
    const source = loadFixture('union') as Record<string, unknown>;
    const result = renderSprite({ ...source, antialias: true });
    const entry = metric(result, 'alphaPurity');

    expect(entry.value).toBeGreaterThan(0);
    expect(entry.pass).toBe(true);
    expect(entry.detail).toMatch(/beklenir/);
  });

  it('saydam katman da kısmi alfayı meşrulaştırır', () => {
    const source = loadFixture('union') as Record<string, unknown>;
    const layers = (source.layers as Array<Record<string, unknown>>).map((layer) => ({
      ...layer,
      opacity: 0.4,
    }));
    const entry = metric(renderSprite({ ...source, layers }), 'alphaPurity');

    expect(entry.value).toBeGreaterThan(0);
    expect(entry.pass).toBe(true);
  });

  it('kullanılan renk sayısı paleti aşamaz', () => {
    const entry = metric(renderSprite(loadFixture('union')), 'colorCount');
    expect(entry.value).toBe(5);
    expect(entry.pass).toBe(true);
    expect(entry.detail).toMatch(/5 \/ 5/);
  });

  it('rapor metni her metriği ve sonucunu gösterir', () => {
    const report = measureSprite(renderSprite(loadFixture('noise')));
    const text = formatQaReport(report);
    expect(text).toMatch(/32x32/);
    expect(text).toMatch(/Palet uyumu/);
    expect(text).toMatch(/Alfa saflığı/);
    expect(text).toMatch(/Kullanılan renk sayısı/);
    // Bir başlık satırı + her metrik için bir satır.
    expect(text.split('\n')).toHaveLength(report.metrics.length + 1);
  });

  it('başarısız metrik rapor metninde işaretlenir', () => {
    const result = renderSprite(loadFixture('noise'));
    result.rgba[0] = 1;
    result.rgba[1] = 2;
    result.rgba[2] = 3;
    result.rgba[3] = 255;
    expect(formatQaReport(measureSprite(result))).toMatch(/✗ Palet uyumu/);
  });
});

describe('Tur 3 metrikleri', () => {
  const WIDE_PALETTE = {
    colors: ['#0a0a0a', '#333333', '#666666', '#999999', '#cccccc', '#f5f5f5'],
    ramps: [{ id: 0, indices: [0, 1, 2, 3, 4, 5] }],
  };

  function doc(overrides: Record<string, unknown>): unknown {
    return {
      schemaVersion: 1,
      size: [40, 40],
      seed: 3,
      palette: WIDE_PALETTE,
      layers: [{ id: 'a', source: { kind: 'sdf.circle', r: 0.6 }, material: 0 }],
      ...overrides,
    };
  }

  const metricOf = (input: unknown, id: string) =>
    measureSprite(renderSprite(input)).metrics.find((metric) => metric.id === id);

  it('dış çizgi sürekliliği yalnızca DIŞA büyüyen kiplerde ölçülür', () => {
    expect(metricOf(doc({}), 'outlineContinuity')).toBeUndefined();
    expect(
      metricOf(doc({ post: { outline: { px: 1, mode: 'inside' } } }), 'outlineContinuity'),
    ).toBeUndefined();
    expect(
      metricOf(doc({ post: { outline: { px: 1, mode: 'outside' } } }), 'outlineContinuity')?.pass,
    ).toBe(true);
  });

  it('silüet görüntü kenarına değince dış çizgi KIRPILIR ve kapı düşer', () => {
    const metric = metricOf(
      doc({
        layers: [{ id: 'a', source: { kind: 'const', value: 1 }, material: 0 }],
        post: { outline: { px: 1, mode: 'outside' } },
      }),
      'outlineContinuity',
    )!;

    expect(metric.pass).toBe(false);
    expect(metric.value).toBeGreaterThan(0);
    expect(metric.detail).toMatch(/kırpıldı/);
  });

  it('kontrast oranı paletin SUNDUĞU aralığa göre ölçülür', () => {
    // Yükseklik sabit → tek renk → paletin aralığının hiçbiri kullanılmıyor.
    const flat = metricOf(
      doc({
        layers: [
          {
            id: 'a',
            source: { kind: 'sdf.circle', r: 0.6 },
            height: { kind: 'const', value: 0.5 },
            material: 0,
          },
        ],
      }),
      'contrast',
    )!;
    expect(flat.pass).toBe(false);
    expect(flat.value).toBeCloseTo(0, 3);

    // Kubbe biçimli yükseklik rampanın tamamını gezer.
    const domed = metricOf(
      doc({
        layers: [
          {
            id: 'a',
            source: { kind: 'sdf.circle', r: 0.6 },
            height: { kind: 'gradient.radial', radius: 0.6 },
            material: 0,
          },
        ],
      }),
      'contrast',
    )!;
    expect(domed.pass).toBe(true);
  });

  it('düz palette kontrast ölçülmez — payda sıfır olurdu', () => {
    const flatPalette = {
      colors: ['#808080', '#828282'],
      ramps: [{ id: 0, indices: [0, 1] }],
    };
    expect(metricOf(doc({ palette: flatPalette }), 'contrast')).toBeUndefined();
  });

  it('bantlaşma gölgenin UÇ adımlarda birikmesini yakalar', () => {
    // Gölge yalnızca 0 ya da 1: rampanın ortası hiç kullanılmıyor.
    const banded = metricOf(
      doc({
        layers: [
          {
            id: 'a',
            source: { kind: 'sdf.circle', r: 0.6 },
            height: {
              kind: 'step',
              edge: 0,
              input: { kind: 'gradient.linear', angle: 0, from: -0.001, to: 0.001 },
            },
            material: 0,
          },
        ],
      }),
      'banding',
    )!;
    expect(banded.pass).toBe(false);
    expect(banded.value).toBeCloseTo(1, 2);

    const smooth = metricOf(
      doc({
        layers: [
          {
            id: 'a',
            source: { kind: 'sdf.circle', r: 0.6 },
            height: { kind: 'gradient.linear', angle: 0, from: -0.6, to: 0.6 },
            material: 0,
          },
        ],
      }),
      'banding',
    )!;
    expect(smooth.pass).toBe(true);
  });

  it('iki adımlı rampada bantlaşma ölçülmez — ortası yoktur', () => {
    const twoStep = {
      colors: ['#101010', '#f0f0f0'],
      ramps: [{ id: 0, indices: [0, 1] }],
    };
    expect(metricOf(doc({ palette: twoStep }), 'banding')).toBeUndefined();
  });
});
