import { describe, expect, it } from 'vitest';
import { Vector2 } from '@volstudio/core';
import { ArachnidBodyMotion } from '@/runtime/rig/ArachnidBodyMotion';

interface FakePart {
  x: number;
  y: number;
  rotation: number;
}

describe('ArachnidBodyMotion', () => {
  it('gövde parçalarını tek bir rijit grup gibi taşır', () => {
    const parts: FakePart[] = [
      { x: -20, y: 5, rotation: 0 },
      { x: 25, y: -10, rotation: 0.2 },
    ];
    const initialDistance = Math.hypot(parts[1].x - parts[0].x, parts[1].y - parts[0].y);
    const motion = new ArachnidBodyMotion(parts as never);

    for (let i = 0; i < 40; i++) motion.update(new Vector2(1, 0), 16);
    for (let i = 0; i < 12; i++) motion.update(new Vector2(-1, 0), 16);

    const finalDistance = Math.hypot(parts[1].x - parts[0].x, parts[1].y - parts[0].y);
    expect(finalDistance).toBeCloseTo(initialDistance, 6);
    expect(parts[0].x).not.toBeCloseTo(-20, 3);
    expect(parts[1].rotation - parts[0].rotation).toBeCloseTo(0.2, 6);
    for (const part of parts) {
      expect(Number.isFinite(part.x)).toBe(true);
      expect(Number.isFinite(part.y)).toBe(true);
      expect(Number.isFinite(part.rotation)).toBe(true);
    }
  });
});
