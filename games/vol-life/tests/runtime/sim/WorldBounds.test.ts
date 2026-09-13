import { describe, expect, it } from 'vitest';
import { resolveParticleBounds, validateWorldGeometry } from '@/runtime/sim/WorldBounds';

describe('resolveParticleBounds', () => {
  it('fiziksel çarpışma insetini parçacık alanından çıkarır', () => {
    expect(resolveParticleBounds({ x: 20, y: 30, width: 1000, height: 800 }, 6)).toEqual({
      x: 26,
      y: 36,
      width: 988,
      height: 788,
    });
  });

  it('dikdörtgen dünya eksenlerinin spatial-hash hücresine ayrı ayrı bölünmesini ister', () => {
    expect(() =>
      validateWorldGeometry({ x: 0, y: 0, width: 1024, height: 768 }, 6, 128),
    ).not.toThrow();
    expect(() => validateWorldGeometry({ x: 0, y: 0, width: 1000, height: 768 }, 6, 128)).toThrow(
      RangeError,
    );
  });

  it('dünyayı tüketen veya geçersiz fizik insetini reddeder', () => {
    expect(() => resolveParticleBounds({ x: 0, y: 0, width: 10, height: 20 }, 5)).toThrow(
      RangeError,
    );
    expect(() =>
      resolveParticleBounds({ x: 0, y: 0, width: 100, height: 100 }, Number.POSITIVE_INFINITY),
    ).toThrow(RangeError);
    expect(() => resolveParticleBounds({ x: 0, y: 0, width: 100, height: 100 }, -1)).toThrow(
      RangeError,
    );
    expect(() =>
      resolveParticleBounds({ x: 0, y: 0, width: 100, height: 100 }, Number.NaN),
    ).toThrow(RangeError);
  });

  it('geçersiz sınır koordinatlarını ve boyutlarını reddeder', () => {
    expect(() =>
      validateWorldGeometry({ x: Number.NaN, y: 0, width: 1024, height: 768 }, 6, 128),
    ).toThrow(RangeError);
    expect(() =>
      validateWorldGeometry(
        { x: 0, y: Number.POSITIVE_INFINITY, width: 1024, height: 768 },
        6,
        128,
      ),
    ).toThrow(RangeError);
    expect(() => validateWorldGeometry({ x: 0, y: 0, width: 0, height: 768 }, 6, 128)).toThrow(
      RangeError,
    );
    expect(() => validateWorldGeometry({ x: 0, y: 0, width: 1024, height: -10 }, 6, 128)).toThrow(
      RangeError,
    );
    expect(() =>
      validateWorldGeometry({ x: 0, y: 0, width: 1024, height: Number.NaN }, 6, 128),
    ).toThrow(RangeError);
  });

  it('geçersiz veya çok büyük hücre boyutunu reddeder', () => {
    expect(() => validateWorldGeometry({ x: 0, y: 0, width: 1024, height: 768 }, 6, 0)).toThrow(
      RangeError,
    );
    expect(() => validateWorldGeometry({ x: 0, y: 0, width: 1024, height: 768 }, 6, -128)).toThrow(
      RangeError,
    );
    // Oran < 3
    expect(() => validateWorldGeometry({ x: 0, y: 0, width: 256, height: 768 }, 6, 128)).toThrow(
      RangeError,
    );
    expect(() => validateWorldGeometry({ x: 0, y: 0, width: 1024, height: 256 }, 6, 128)).toThrow(
      RangeError,
    );
  });
});
