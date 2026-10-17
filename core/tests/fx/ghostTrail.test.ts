import { describe, expect, it, vi } from 'vitest';
import { GhostTrail, type GhostTrailOptions } from '../../src/fx/GhostTrail';
import type { PoseSprite, PoseSpriteScene } from '../../src/fx/PoseSpritePool';
import type { PoseSourceNode } from '../../src/fx/poseSample';

const OPTIONS: GhostTrailOptions = { maxGhosts: 2, lifespanMs: 100, startAlpha: 0.5, depth: 1 };
const ROOT: PoseSourceNode = {
  texture: { key: 'ghost' },
  getWorldTransformMatrix: () => ({
    decomposeMatrix: () => ({ translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
  }),
};

function scene() {
  const sprite: PoseSprite = {
    setTexture: vi.fn(),
    setPosition: vi.fn(),
    setRotation: vi.fn(),
    setScale: vi.fn(),
    setOrigin: vi.fn(),
    setAlpha: vi.fn(),
    setTint: vi.fn(),
    setVisible: vi.fn(),
    setDepth: vi.fn(),
    setBlendMode: vi.fn(),
    destroy: vi.fn(),
  };
  const target: PoseSpriteScene = { add: { image: () => sprite } };
  return { target, sprite };
}

describe('GhostTrail yapılandırma sınırı', () => {
  it('temsil edilemeyen havuz sayısını kaynak ayırmadan reddeder', () => {
    const { target } = scene();
    expect(
      () => new GhostTrail(target, { ...OPTIONS, maxGhosts: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow(RangeError);
  });
  it('prototip/getter değerlerini bir kez saklar; poz solar ve süresinde kapanır', () => {
    const { target, sprite } = scene();
    let reads = 0;
    const prototype = {
      ...OPTIONS,
      captureIntervalMs: 50,
      get maxGhosts() {
        reads++;
        return 2;
      },
    };
    const trail = new GhostTrail(target, Object.create(prototype) as GhostTrailOptions);
    prototype.lifespanMs = 10000;
    prototype.startAlpha = 0.1;
    trail.capture(ROOT);
    expect(sprite.setAlpha).toHaveBeenLastCalledWith(0.5);
    trail.update(25);
    expect(sprite.setAlpha).toHaveBeenLastCalledWith(0.375);
    trail.capture(ROOT);
    expect(trail.activeCount).toBe(1);
    trail.update(75);
    expect(trail.activeCount).toBe(0);
    expect(sprite.setVisible).toHaveBeenLastCalledWith(false);
    expect(reads).toBe(1);
    trail.destroy();
  });

  it.each(['captureIntervalMs', 'endAlpha', 'depth', 'tint', 'blendMode'] as const)(
    '%s sonlu olmayan değeri çizim kaynağı kurulmadan reddeder',
    (field) => {
      const { target } = scene();
      const create = vi.spyOn(target.add, 'image');
      for (const value of [NaN, Infinity, -Infinity]) {
        expect(() => new GhostTrail(target, { ...OPTIONS, [field]: value })).toThrow(TypeError);
      }
      expect(create).not.toHaveBeenCalled();
    },
  );
});
