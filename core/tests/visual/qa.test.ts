import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSprite } from '../../src/visual/render';
import { formatQaReport, measureSprite } from '../../src/visual/qa';
import type { RenderResult } from '../../src/visual/render';

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
    expect(report.metrics.map((entry) => entry.id)).toEqual([
      'paletteCompliance',
      'alphaPurity',
      'colorCount',
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
    const text = formatQaReport(measureSprite(renderSprite(loadFixture('noise'))));
    expect(text).toMatch(/32x32/);
    expect(text).toMatch(/Palet uyumu/);
    expect(text).toMatch(/Alfa saflığı/);
    expect(text).toMatch(/Kullanılan renk sayısı/);
    expect(text.split('\n')).toHaveLength(4);
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
