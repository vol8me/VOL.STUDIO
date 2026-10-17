import { describe, expect, it } from 'vitest';
import { World } from '@/sim/world/World';

describe('World', () => {
  it('geçersiz ölçüleri reddeder', () => {
    expect(() => new World(0, 10, 10)).toThrow(RangeError);
    expect(() => new World(10, 10, 0)).toThrow(RangeError);
  });

  it('dört duvarın iç normali dünyanın içini gösterir', () => {
    const world = new World(400, 300, 50);
    const inside = { x: 200, y: 150 };
    for (const wall of world.walls) {
      expect(inside.x * wall.nx + inside.y * wall.ny - wall.offset).toBeGreaterThan(0);
    }
    expect(world.center).toEqual({ x: 200, y: 150 });
    expect(world.contains(0, 0)).toBe(true);
    expect(world.contains(401, 10)).toBe(false);
    expect(world.contains(10, -1)).toBe(false);
  });
});
