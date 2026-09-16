import { describe, expect, it } from 'vitest';
import { habitatConfig } from '@/config/habitat';
import { worldConfig } from '@/config/world';
import type { DomainSample, HabitatSDF } from '@/runtime/sim/WorldDomain';
import {
  createHabitatDomain,
  rasterizeHabitatMask,
  rasterizeHabitatShade,
} from '@/runtime/sim/WorldDomain';

const STORAGE = worldConfig.boundsUnits;
const CENTER = { x: STORAGE.x + STORAGE.width / 2, y: STORAGE.y + STORAGE.height / 2 };

function domain(seed = 7, config = habitatConfig): HabitatSDF {
  return createHabitatDomain(STORAGE, config, seed);
}

function distanceAt(sdf: HabitatSDF, x: number, y: number): number {
  return sdf.sampleDistanceAndNormal(x, y).distance;
}

function normalAt(sdf: HabitatSDF, x: number, y: number): { x: number; y: number } {
  const sample = sdf.sampleDistanceAndNormal(x, y);
  return { x: sample.normalX, y: sample.normalY };
}

describe('HabitatSDF işaret sözleşmesi', () => {
  it('merkez pozitif, kontur sıfıra yakın, depolama köşesi negatiftir', () => {
    const sdf = domain();
    const contour = sdf.contour(64);

    expect(distanceAt(sdf, CENTER.x, CENTER.y)).toBeGreaterThan(100);
    expect(distanceAt(sdf, CENTER.x, CENTER.y)).toBeLessThanOrEqual(
      Math.min(distanceAt(sdf, CENTER.x + 1, CENTER.y), distanceAt(sdf, CENTER.x, CENTER.y + 1)) +
        1.5,
    );
    for (let index = 0; index < contour.length; index += 2) {
      expect(Math.abs(distanceAt(sdf, contour[index], contour[index + 1]))).toBeLessThan(1e-3);
    }
    expect(distanceAt(sdf, STORAGE.x, STORAGE.y)).toBeLessThan(0);
    expect(distanceAt(sdf, STORAGE.x + STORAGE.width, STORAGE.y + STORAGE.height)).toBeLessThan(0);
  });

  /*
   * Merkezden çıkan her ışında işaret TAM BİR KEZ değişir: cep, delik ve
   * kendini kesen kontur olsaydı ışın habitattan Void'e birden çok kez geçerdi.
   *
   * "Mesafe ışın boyunca hep azalır" İDDİA EDİLMEZ, çünkü gerçek işaretli
   * mesafede doğru değildir: merkez çevresinde en yakın kontur noktası
   * değiştikçe mesafe artabilir. Ölçüldü — bağımsız referans (20.000 segmentli
   * kontur) aynı ışınlarda 4,0 birime kadar artış veriyor. Eski test bu artışı
   * yakalamıyordu çünkü polar yaklaşım yapısı gereği monotondu; yani ölçtüğü
   * şey geometri değil, yaklaşımın kendisiydi.
   */
  it('her ışında işaret tam bir kez değişir: cep, delik ve kendini kesme yoktur', () => {
    const sdf = domain(3);
    for (let step = 0; step < 72; step++) {
      const theta = (step / 72) * Math.PI * 2;
      let signChanges = 0;
      let lastSign = 1;
      for (let rho = 4; rho <= STORAGE.width / 2; rho += 4) {
        const value = distanceAt(
          sdf,
          CENTER.x + Math.cos(theta) * rho,
          CENTER.y + Math.sin(theta) * rho,
        );
        const sign = value >= 0 ? 1 : -1;
        if (sign !== lastSign) signChanges++;
        lastSign = sign;
      }
      expect(signChanges).toBe(1);
    }
  });

  it('normal birim uzunluktadır, dışa bakar ve merkezden uzaklaşan yönle uyumludur', () => {
    const sdf = domain(11);
    const contour = sdf.contour(48);
    for (let index = 0; index < contour.length; index += 2) {
      const x = contour[index];
      const y = contour[index + 1];
      const normal = normalAt(sdf, x, y);
      expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1, 6);
      const outwardDot = normal.x * (x - CENTER.x) + normal.y * (y - CENTER.y);
      expect(outwardDot).toBeGreaterThan(0);
      expect(distanceAt(sdf, x + normal.x * 2, y + normal.y * 2)).toBeLessThan(0);
      expect(distanceAt(sdf, x - normal.x * 2, y - normal.y * 2)).toBeGreaterThan(0);
    }
  });

  it('merkezde gradyan tanımsızken normal sabit ve sonludur; `out` tamponu yeniden kullanılır', () => {
    const sdf = domain(5, { ...habitatConfig, noiseAmplitudeRatio: 0 });
    const out: DomainSample = { distance: 9, normalX: 9, normalY: 9 };
    const result = sdf.sampleDistanceAndNormal(CENTER.x, CENTER.y, out);
    expect(result).toBe(out);
    expect(Number.isFinite(out.normalX) && Number.isFinite(out.normalY)).toBe(true);
    expect(Math.hypot(out.normalX, out.normalY)).toBeCloseTo(1, 6);
    expect(out.distance).toBeGreaterThan(0);
  });

  it('sonlu olmayan örnekleme noktasını reddeder', () => {
    const sdf = domain();
    expect(() => sdf.sampleDistanceAndNormal(Number.NaN, 0)).toThrow(RangeError);
    expect(() => sdf.sampleDistanceAndNormal(0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('aynı girdi aynı örneği verir', () => {
    const sdf = domain(19);
    const first = sdf.sampleDistanceAndNormal(CENTER.x + 120, CENTER.y - 40);
    const second = sdf.sampleDistanceAndNormal(CENTER.x + 120, CENTER.y - 40);
    expect(second).toEqual(first);
  });
});

describe('HabitatSDF determinizm ve geometri', () => {
  it('aynı tohum aynı digest ve konturu, farklı tohum farklı ama geçerli konturu üretir', () => {
    const left = domain(42);
    const right = domain(42);
    const other = domain(43);

    expect(left.digest).toBe(right.digest);
    expect(left.digest).toMatch(/^[0-9a-f]{16}$/);
    expect(left.contour(32)).toEqual(right.contour(32));
    expect(other.digest).not.toBe(left.digest);
    expect(other.contour(32)).not.toEqual(left.contour(32));
    expect(distanceAt(other, CENTER.x, CENTER.y)).toBeGreaterThan(0);
  });

  it('gürültü kapalıyken kontur saf superellipse’tir ve simetriktir', () => {
    const sdf = domain(1, { ...habitatConfig, noiseAmplitudeRatio: 0 });
    const contour = sdf.contour(8);
    expect(contour[0] - CENTER.x).toBeCloseTo(CENTER.x - contour[8], 4);
    expect(sdf.digest).toBe(domain(2, { ...habitatConfig, noiseAmplitudeRatio: 0 }).digest);
  });

  it('bbox depolama kenar boşluğunun içinde kalır ve konturu kapsar', () => {
    const sdf = domain(9);
    const { bbox, storage } = sdf;
    const margin = habitatConfig.storageMarginUnits;
    expect(bbox.x).toBeGreaterThanOrEqual(storage.x + margin);
    expect(bbox.y).toBeGreaterThanOrEqual(storage.y + margin);
    expect(bbox.x + bbox.width).toBeLessThanOrEqual(storage.x + storage.width - margin);
    expect(bbox.y + bbox.height).toBeLessThanOrEqual(storage.y + storage.height - margin);
    const contour = sdf.contour(256);
    for (let index = 0; index < contour.length; index += 2) {
      expect(contour[index]).toBeGreaterThanOrEqual(bbox.x - 1e-3);
      expect(contour[index]).toBeLessThanOrEqual(bbox.x + bbox.width + 1e-3);
    }
  });

  it('depolama kenar boşluğunu ihlal eden yapılandırmayı kurulumda reddeder', () => {
    expect(() =>
      createHabitatDomain(STORAGE, { ...habitatConfig, radiusRatioX: 0.97, radiusRatioY: 0.97 }, 1),
    ).toThrow(/kenar boşluğunu/);
    expect(() =>
      createHabitatDomain(STORAGE, { ...habitatConfig, storageMarginUnits: 200 }, 1),
    ).toThrow(RangeError);
  });

  it('dünya tohumu uint32 olmalı ve kontur en az üç segment ister', () => {
    expect(() => createHabitatDomain(STORAGE, habitatConfig, -1)).toThrow(RangeError);
    expect(() => createHabitatDomain(STORAGE, habitatConfig, 1.5)).toThrow(RangeError);
    expect(() => createHabitatDomain(STORAGE, habitatConfig, 0x1_0000_0000)).toThrow(RangeError);
    expect(() => domain().contour(2)).toThrow(RangeError);
    expect(() => domain().contour(3.5)).toThrow(RangeError);
  });

  it('depolama dikdörtgeni çağıranın sonradan değiştirmesinden yalıtılır', () => {
    const storage = { ...STORAGE };
    const sdf = createHabitatDomain(storage, habitatConfig, 4);
    const before = distanceAt(sdf, CENTER.x, CENTER.y);
    storage.width = 10;
    expect(distanceAt(sdf, CENTER.x, CENTER.y)).toBe(before);
    expect(sdf.storage.width).toBe(STORAGE.width);
  });
});

describe('habitat rasterleştirme', () => {
  it('maske Void hücrelerini 0, habitatı 1 işaretler ve mesafe işaretiyle uyuşur', () => {
    const sdf = domain(8);
    const resolution = 32;
    const mask = rasterizeHabitatMask(sdf, resolution);
    expect(mask).toHaveLength(resolution * resolution);
    expect(mask[0]).toBe(0);
    expect(mask[(resolution / 2) * resolution + resolution / 2]).toBe(1);
    const cell = STORAGE.width / resolution;
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const distance = distanceAt(
          sdf,
          STORAGE.x + (x + 0.5) * cell,
          STORAGE.y + (y + 0.5) * cell,
        );
        expect(mask[y * resolution + x]).toBe(distance >= 0 ? 1 : 0);
      }
    }
  });

  it('gölge kıyıya yaklaşırken 1→0 iner ve Void’da sıfırdır', () => {
    const sdf = domain(8);
    const shade = rasterizeHabitatShade(sdf, 32, 64);
    expect(shade[0]).toBe(0);
    expect(shade[16 * 32 + 16]).toBe(1);
    expect(shade.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(shade.some((value) => value > 0 && value < 1)).toBe(true);
  });

  it('geçersiz çözünürlük ve karartma mesafesini reddeder', () => {
    const sdf = domain(8);
    expect(() => rasterizeHabitatMask(sdf, 1)).toThrow(RangeError);
    expect(() => rasterizeHabitatShade(sdf, 32, 0)).toThrow(RangeError);
    expect(() => rasterizeHabitatShade(sdf, 32, Number.NaN)).toThrow(RangeError);
  });
});
