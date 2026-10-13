import { describe, expect, it } from 'vitest';
import { muzzlePose, pivotPose, type MuzzlePose } from '@/sim/muzzle';
import type { ChassisPose } from '@/sim/tank/Tank';

const out = (): MuzzlePose => ({ x: 0, y: 0, angle: 0 });
const pose = (overrides: Partial<ChassisPose> = {}): ChassisPose => ({
  x: 100,
  y: 200,
  hull: 0,
  turret: 0,
  pitch: 0,
  roll: 0,
  ...overrides,
});

describe('muzzlePose', () => {
  it('süspansiyonsuz poz: mil gövde merkezidir, uç taret yönünde `reach` kadar uzaktır', () => {
    const tip = muzzlePose(pose({ turret: Math.PI / 2 }), 30, out());
    expect(tip.x).toBeCloseTo(100);
    expect(tip.y).toBeCloseTo(230);
    expect(tip.angle).toBe(Math.PI / 2);
  });

  it('pitch gövde ekseninde ileri, roll yana kayar; mil gövdeyle birlikte döner', () => {
    const forward = pivotPose(pose({ hull: Math.PI / 2, pitch: 3 }), out());
    expect(forward.x).toBeCloseTo(100);
    expect(forward.y).toBeCloseTo(203);
    const side = pivotPose(pose({ hull: Math.PI / 2, roll: 3 }), out());
    expect(side.x).toBeCloseTo(97);
    expect(side.y).toBeCloseTo(200);
  });

  it('taretten bağımsız mil: namlu ucu daima milden `reach` uzaklıkta ve taret yönündedir', () => {
    for (const [hull, turret, pitch, roll] of [
      [0.4, 2.2, 3.1, -2.7],
      [-2.9, 0.1, -1.4, 3.5],
      [3.1, -1.7, 0, 3.6],
    ]) {
      const state = pose({ hull, turret, pitch, roll });
      const pivot = pivotPose(state, out());
      const tip = muzzlePose(state, 29.4, out());
      expect(Math.hypot(tip.x - pivot.x, tip.y - pivot.y)).toBeCloseTo(29.4, 9);
      expect(Math.atan2(tip.y - pivot.y, tip.x - pivot.x)).toBeCloseTo(
        Math.atan2(Math.sin(turret), Math.cos(turret)),
        9,
      );
    }
  });

  it('çıktı nesnesini yeniden kullanır ve girdiyi değiştirmez', () => {
    const state = pose({ hull: 1, turret: 2, pitch: 1, roll: 1 });
    const copy = { ...state };
    const target = out();
    expect(muzzlePose(state, 10, target)).toBe(target);
    expect(state).toEqual(copy);
  });
});
