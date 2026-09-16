import { describe, expect, it } from 'vitest';
import {
  convexHull,
  measureClusterShape,
  memberChurn,
  polygonArea,
  type Point,
} from '@/../scripts/morphology/clusterShape';

/*
 * E5 ground-truth fixture'ları. Kompaktlık tanımı ÖN-KAYITLIDIR: solidity =
 * dolu alan / dışbükey örtü alanı. Halka ayrıca "delik oranı" ile ölçülür ve
 * kompaktlıkla karıştırılmaz — eski `1 − σ/ortalama` tanımı halkayı "çok
 * kompakt" gösteriyordu.
 *
 * Eşikler ÖLÇÜLDÜ (2026-09-16, `scratchpad/e5-groundtruth.mts`):
 * disk 0,892 / 0,108 · gauss 0,758 / 0,242 · halka 0,417 / 0,588 ·
 * çizgi 1,000 / 0,000 (anisotropy 1,00). Aşağıdaki sınırlar bu ayrımın
 * ortasından geçer, bir fixture'ı geçirmek için seçilmemiştir.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function disk(count: number, radius: number, cx = 500, cy = 500): Point[] {
  const random = seededRandom(7);
  return Array.from({ length: count }, () => {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius;
    return { x: cx + Math.cos(angle) * distance, y: cy + Math.sin(angle) * distance };
  });
}

function ring(count: number, radius: number, width: number, cx = 500, cy = 500): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const distance = radius + ((index % 3) - 1) * width;
    return { x: cx + Math.cos(angle) * distance, y: cy + Math.sin(angle) * distance };
  });
}

function line(count: number, length: number): Point[] {
  return Array.from({ length: count }, (_, index) => ({
    x: 400 + (index / (count - 1)) * length,
    y: 500,
  }));
}

function translate(points: readonly Point[], dx: number, dy: number): Point[] {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

function rotate(points: readonly Point[], radians: number, cx = 500, cy = 500): Point[] {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map((point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
}

function scale(points: readonly Point[], factor: number, cx = 500, cy = 500): Point[] {
  return points.map((point) => ({
    x: cx + (point.x - cx) * factor,
    y: cy + (point.y - cy) * factor,
  }));
}

describe('Küme biçimi — ground truth (E5)', () => {
  it('dolu disk yüksek solidity ve düşük delik oranı verir', () => {
    const shape = measureClusterShape(disk(300, 60));

    expect(shape.solidity).toBeGreaterThan(0.75);
    expect(shape.holeRatio).toBeLessThan(0.2);
    expect(shape.anisotropy).toBeLessThan(0.2);
  });

  /* Ayrımın kendisi: halka ile disk aynı yönde ayrılmalı, aksi hâlde ölçüt kör. */
  it('halka düşük solidity ve yüksek delik oranı verir, diskten ayrışır', () => {
    const hollow = measureClusterShape(ring(240, 60, 4));
    const solid = measureClusterShape(disk(300, 60));

    expect(hollow.solidity).toBeLessThan(0.55);
    expect(hollow.holeRatio).toBeGreaterThan(0.4);
    expect(hollow.solidity).toBeLessThan(solid.solidity);
    expect(hollow.holeRatio).toBeGreaterThan(solid.holeRatio);
  });

  it('gauss blob disk ile halka arasında kalır', () => {
    /*
     * TEK üreteç akışı: nokta başına yeni üreteç kurmak (seed = 99 + index)
     * LCG'nin ardışık tohumlarını korele ettiği için gauss değil çarpık bir
     * bulut üretiyordu ve solidity 0,258'e düşüyordu (ölçüldü). Fixture,
     * ground-truth ölçümüyle birebir aynı kurulur; eşik oynatılmadı.
     */
    const random = seededRandom(99);
    const blob = measureClusterShape(
      Array.from({ length: 300 }, () => {
        const u1 = Math.max(random(), 1e-9);
        const u2 = random();
        const magnitude = Math.sqrt(-2 * Math.log(u1));
        return {
          x: 500 + magnitude * Math.cos(Math.PI * 2 * u2) * 25,
          y: 500 + magnitude * Math.sin(Math.PI * 2 * u2) * 25,
        };
      }),
    );

    expect(blob.solidity).toBeGreaterThan(0.4);
    expect(blob.holeRatio).toBeLessThan(0.6);
  });

  /* Dejenere örtü: çizgi sessizce sıfıra düşerse gazdan ayırt edilemez. */
  it('çizgi anisotropy 1’e yaklaşır ve sıfıra düşmez', () => {
    const shape = measureClusterShape(line(60, 200));

    expect(shape.anisotropy).toBeGreaterThan(0.95);
    expect(shape.solidity).toBeGreaterThan(0);
    expect(shape.normalizedGyration).toBeGreaterThan(0);
  });

  it('boş ve tek noktalı bulut sıfır biçim verir', () => {
    expect(measureClusterShape([]).solidity).toBe(0);
    expect(measureClusterShape([{ x: 1, y: 1 }]).anisotropy).toBe(0);
  });
});

describe('Küme biçimi — metamorfik değişmezlikler (E5)', () => {
  const base = disk(200, 50);

  it('öteleme biçimi değiştirmez, merkezi kaydırır', () => {
    const moved = measureClusterShape(translate(base, 120, -80));
    const origin = measureClusterShape(base);

    expect(moved.solidity).toBeCloseTo(origin.solidity, 6);
    expect(moved.holeRatio).toBeCloseTo(origin.holeRatio, 6);
    expect(moved.anisotropy).toBeCloseTo(origin.anisotropy, 6);
    expect(moved.centroidX - origin.centroidX).toBeCloseTo(120, 6);
  });

  it('dönme normalize ölçüleri korur', () => {
    const turned = measureClusterShape(rotate(base, Math.PI / 3));
    const origin = measureClusterShape(base);

    expect(turned.normalizedGyration).toBeCloseTo(origin.normalizedGyration, 2);
    expect(turned.anisotropy).toBeCloseTo(origin.anisotropy, 2);
  });

  it('ölçek normalize ölçüleri korur', () => {
    const bigger = measureClusterShape(scale(base, 3));
    const origin = measureClusterShape(base);

    expect(bigger.normalizedGyration).toBeCloseTo(origin.normalizedGyration, 6);
    expect(bigger.solidity).toBeCloseTo(origin.solidity, 6);
    expect(bigger.anisotropy).toBeCloseTo(origin.anisotropy, 6);
  });

  /*
   * İddia BİT eşitliği değil sayısal eşdeğerliktir: ağırlık merkezi toplamı
   * farklı sırayla biriktiği için kayan noktada 1e-12 mertebesinde fark kalır
   * (ölçüldü). Bit-eşitliği bu fonksiyonun sözleşmesi değildir.
   */
  it('nokta sırası permütasyonu sonucu değiştirmez', () => {
    const shuffled = measureClusterShape([...base].reverse());
    const origin = measureClusterShape(base);

    expect(shuffled.solidity).toBeCloseTo(origin.solidity, 9);
    expect(shuffled.holeRatio).toBeCloseTo(origin.holeRatio, 9);
    expect(shuffled.normalizedGyration).toBeCloseTo(origin.normalizedGyration, 9);
    expect(shuffled.anisotropy).toBeCloseTo(origin.anisotropy, 9);
    expect(shuffled.centroidX).toBeCloseTo(origin.centroidX, 9);
    expect(shuffled.centroidY).toBeCloseTo(origin.centroidY, 9);
  });
});

describe('Dışbükey örtü ve churn', () => {
  it('kare için örtü dört köşe ve alan tamdır', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ];

    expect(convexHull(square)).toHaveLength(4);
    expect(polygonArea(convexHull(square))).toBeCloseTo(100, 6);
  });

  it('churn giren ve çıkan üyelerin birleşime oranıdır', () => {
    expect(memberChurn([1, 2, 3, 4], [1, 2, 3, 4])).toBe(0);
    expect(memberChurn([1, 2, 3, 4], [5, 6, 7, 8])).toBe(1);
    expect(memberChurn([1, 2, 3, 4], [1, 2, 3, 5])).toBeCloseTo(2 / 5, 6);
    expect(memberChurn([], [])).toBe(0);
  });
});
