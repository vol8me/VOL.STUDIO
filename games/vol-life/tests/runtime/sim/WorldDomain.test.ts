import { describe, expect, it } from 'vitest';
import { habitatConfig } from '@/config/habitat';
import { worldConfig } from '@/config/world';
import type { HabitatSDF } from '@/runtime/sim/WorldDomain';
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

describe('HabitatSDF işaret sözleşmesi', () => {
  it('merkez pozitif, kontur sıfıra yakın, depolama köşesi negatiftir', () => {
    const sdf = domain();
    const contour = sdf.contour(64);

    expect(sdf.distance(CENTER.x, CENTER.y)).toBeGreaterThan(100);
    expect(sdf.distance(CENTER.x, CENTER.y)).toBeLessThanOrEqual(
      Math.min(sdf.distance(CENTER.x + 1, CENTER.y), sdf.distance(CENTER.x, CENTER.y + 1)) + 1.5,
    );
    for (let index = 0; index < contour.length; index += 2) {
      expect(Math.abs(sdf.distance(contour[index], contour[index + 1]))).toBeLessThan(1e-3);
    }
    expect(sdf.distance(STORAGE.x, STORAGE.y)).toBeLessThan(0);
    expect(sdf.distance(STORAGE.x + STORAGE.width, STORAGE.y + STORAGE.height)).toBeLessThan(0);
  });

  it('her ışın boyunca mesafe kesin azalır: cep, kendini kesme ve girinti yoktur', () => {
    const sdf = domain(3);
    for (let step = 0; step < 72; step++) {
      const theta = (step / 72) * Math.PI * 2;
      let previous = Number.POSITIVE_INFINITY;
      let signChanges = 0;
      let lastSign = 1;
      for (let rho = 4; rho <= STORAGE.width / 2; rho += 4) {
        const value = sdf.distance(
          CENTER.x + Math.cos(theta) * rho,
          CENTER.y + Math.sin(theta) * rho,
        );
        expect(value).toBeLessThanOrEqual(previous + 1e-6);
        previous = value;
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
      const normal = sdf.normal(x, y);
      expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1, 6);
      const outwardDot = normal.x * (x - CENTER.x) + normal.y * (y - CENTER.y);
      expect(outwardDot).toBeGreaterThan(0);
      expect(sdf.distance(x + normal.x * 2, y + normal.y * 2)).toBeLessThan(0);
      expect(sdf.distance(x - normal.x * 2, y - normal.y * 2)).toBeGreaterThan(0);
    }
  });

  it('merkezde gradyan tanımsızken normal sabit ve sonludur; `out` tamponu yeniden kullanılır', () => {
    const sdf = domain(5, { ...habitatConfig, noiseAmplitudeRatio: 0 });
    const out = { x: 9, y: 9 };
    const result = sdf.normal(CENTER.x, CENTER.y, out);
    expect(result).toBe(out);
    expect(Number.isFinite(out.x) && Number.isFinite(out.y)).toBe(true);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 6);
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
    expect(other.distance(CENTER.x, CENTER.y)).toBeGreaterThan(0);
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
    const before = sdf.distance(CENTER.x, CENTER.y);
    storage.width = 10;
    expect(sdf.distance(CENTER.x, CENTER.y)).toBe(before);
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
        const distance = sdf.distance(STORAGE.x + (x + 0.5) * cell, STORAGE.y + (y + 0.5) * cell);
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
