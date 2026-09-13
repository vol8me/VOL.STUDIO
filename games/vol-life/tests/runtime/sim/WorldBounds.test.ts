import { describe, expect, it } from 'vitest';
import { resolveParticleBounds } from '@/runtime/sim/WorldBounds';

describe('resolveParticleBounds', () => {
  it('görsel duvar bandını fiziksel parçacık alanından çıkarır', () => {
    expect(resolveParticleBounds({ x: 20, y: 30, width: 1000, height: 800 }, 6)).toEqual({
      x: 26,
      y: 36,
      width: 988,
      height: 788,
    });
  });

  it('dünyayı tüketen duvar kalınlığını reddeder', () => {
    expect(() => resolveParticleBounds({ x: 0, y: 0, width: 10, height: 20 }, 5)).toThrow(
      RangeError,
    );
    expect(() =>
      resolveParticleBounds({ x: 0, y: 0, width: 100, height: 100 }, Number.POSITIVE_INFINITY),
    ).toThrow(RangeError);
  });
});
