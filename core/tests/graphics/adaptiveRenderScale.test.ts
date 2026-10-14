import { describe, expect, it } from 'vitest';
import { AdaptiveRenderScale } from '../../src/graphics/AdaptiveRenderScale';

/** Penceredeki bütün kareleri aynı süreyle besler; son örneğin sonucunu döndürür. */
function feed(scale: AdaptiveRenderScale, ms: number, frames: number): boolean {
  let changed = false;
  for (let index = 0; index < frames; index++) changed = scale.sample(ms) || changed;
  return changed;
}

describe('AdaptiveRenderScale', () => {
  it('hızlı karelerde çarpan 1 kalır', () => {
    const scale = new AdaptiveRenderScale();
    expect(feed(scale, 8, 600)).toBe(false);
    expect(scale.scale).toBe(1);
  });

  it('pencere boyunca yavaş kare çarpanı bir adım kısar; bekleme dolmadan ikinci kısılma olmaz', () => {
    const scale = new AdaptiveRenderScale({ windowFrames: 30, cooldownMs: 1000, shrink: 0.8 });
    expect(feed(scale, 35, 30)).toBe(true);
    expect(scale.scale).toBeCloseTo(0.8, 9);
    // 1000 ms bekleme ≈ 29 kare × 35 ms; sonra yeni pencere ölçülür.
    expect(feed(scale, 35, 29)).toBe(false);
    expect(scale.scale).toBeCloseTo(0.8, 9);
    expect(feed(scale, 35, 30)).toBe(true);
    expect(scale.scale).toBeCloseTo(0.64, 9);
  });

  it('alt sınırın altına inmez ve tek yavaş kare karar vermez', () => {
    const scale = new AdaptiveRenderScale({
      windowFrames: 10,
      cooldownMs: 0,
      min: 0.5,
      shrink: 0.5,
    });
    feed(scale, 40, 10);
    expect(scale.scale).toBe(0.5);
    expect(feed(scale, 40, 100)).toBe(false);
    expect(scale.scale).toBe(0.5);
    const calm = new AdaptiveRenderScale({ windowFrames: 10 });
    feed(calm, 8, 9);
    expect(calm.sample(60)).toBe(false);
    expect(calm.scale).toBe(1);
  });

  it('sekme dönüşü gibi uzun kareler ve geçersiz süreler ölçüme girmez', () => {
    const scale = new AdaptiveRenderScale({ windowFrames: 5, cooldownMs: 0, ignoreAboveMs: 100 });
    for (const bad of [Number.NaN, -3, 0, 5000]) expect(scale.sample(bad)).toBe(false);
    feed(scale, 8, 4);
    expect(scale.sample(900)).toBe(false);
    expect(scale.sample(8)).toBe(false);
    expect(scale.scale).toBe(1);
  });

  it('reset çarpanı 1 yapar ve yeni ölçüme başlar', () => {
    const scale = new AdaptiveRenderScale({ windowFrames: 10, cooldownMs: 0 });
    feed(scale, 40, 10);
    expect(scale.scale).toBeLessThan(1);
    expect(scale.reset()).toBe(true);
    expect(scale.scale).toBe(1);
    expect(scale.reset()).toBe(false);
  });

  it('saçma seçenekler güvenli aralığa çekilir', () => {
    const scale = new AdaptiveRenderScale({
      min: Number.NaN,
      shrink: 7,
      slowFrameMs: -1,
      windowFrames: 0,
    });
    for (let frame = 0; frame < 5000; frame++) scale.sample(60);
    expect(scale.scale).toBeGreaterThanOrEqual(0.25);
    expect(scale.scale).toBeLessThanOrEqual(1);
  });
});
