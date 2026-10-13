import { describe, expect, it } from 'vitest';
import { STRIKER, type Armament } from '@/config/vehicles';
import { mountPose, muzzlePose, pivotPose, type MuzzlePose } from '@/sim/muzzle';
import type { ChassisPose } from '@/sim/chassis/ChassisState';

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

/** Tek taretli silahlanma: mil gövde merkezindedir. */
const single: Armament = { ...STRIKER.armament, mounts: [{ x: 0, y: 0, reach: 30 }] };
/** İki yan yuvalı silahlanma: 0. yuva önde, ikisi arkada ve iki yanda. */
const wide: Armament = {
  ...STRIKER.armament,
  mounts: [
    { x: 8, y: 0, reach: 30 },
    { x: -6, y: -14, reach: 24 },
    { x: -6, y: 14, reach: 24 },
  ],
  salvo: [[0], [1, 2]],
  toeInRange: 360,
};

describe('muzzlePose', () => {
  it('süspansiyonsuz poz: mil gövde merkezidir, uç taret yönünde `reach` kadar uzaktır', () => {
    const tip = muzzlePose(pose({ turret: Math.PI / 2 }), single, 0, out());
    expect(tip.x).toBeCloseTo(100);
    expect(tip.y).toBeCloseTo(230);
    expect(tip.angle).toBe(Math.PI / 2);
  });

  it('pitch gövde ekseninde ileri, roll yana kayar; mil gövdeyle birlikte döner', () => {
    const forward = pivotPose(pose({ hull: Math.PI / 2, pitch: 3 }), single, out());
    expect(forward.x).toBeCloseTo(100);
    expect(forward.y).toBeCloseTo(203);
    const side = pivotPose(pose({ hull: Math.PI / 2, roll: 3 }), single, out());
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
      const pivot = pivotPose(state, single, out());
      const tip = muzzlePose(state, single, 0, out());
      expect(Math.hypot(tip.x - pivot.x, tip.y - pivot.y)).toBeCloseTo(30, 9);
      expect(Math.atan2(tip.y - pivot.y, tip.x - pivot.x)).toBeCloseTo(
        Math.atan2(Math.sin(turret), Math.cos(turret)),
        9,
      );
    }
  });

  it('`reach` verilirse yuvanın kendi mesafesi yerine o kullanılır (geri tepen namlu)', () => {
    const state = pose({ turret: 0 });
    const tip = muzzlePose(state, single, 0, out(), 25);
    expect(tip.x).toBeCloseTo(125);
  });

  it('çıktı nesnesini yeniden kullanır ve girdiyi değiştirmez', () => {
    const state = pose({ hull: 1, turret: 2, pitch: 1, roll: 1 });
    const copy = { ...state };
    const target = out();
    expect(muzzlePose(state, single, 0, target)).toBe(target);
    expect(state).toEqual(copy);
  });
});

describe('yan yuvalar', () => {
  it('yuva konumu gövdeyle döner ve süspansiyon kaymasını taşır', () => {
    const state = pose({ hull: Math.PI / 2, pitch: 2, roll: 1 });
    const side = mountPose(state, wide, 1, out());
    // Gövde +y'ye bakar: ileri +y, sağ -x. x=-6 geri, y=-14 sol (+x).
    expect(side.x).toBeCloseTo(100 - 1 + 14);
    expect(side.y).toBeCloseTo(200 + 2 - 6);
  });

  it('0. yuvanın yönü taret yönüdür; yan yuvalar nişan noktasına bakar', () => {
    const state = pose({ hull: 0.3, turret: 0.7, pitch: 1.2, roll: -0.8 });
    expect(mountPose(state, wide, 0, out()).angle).toBe(0.7);
    const first = pivotPose(state, wide, out());
    const focus = {
      x: first.x + Math.cos(0.7) * wide.toeInRange,
      y: first.y + Math.sin(0.7) * wide.toeInRange,
    };
    for (const index of [1, 2]) {
      const mount = mountPose(state, wide, index, out());
      expect(mount.angle).toBeCloseTo(Math.atan2(focus.y - mount.y, focus.x - mount.x), 12);
    }
  });

  it('yan yuvaların namlu uçları kendi yuvasından `reach` uzaktadır', () => {
    const state = pose({ hull: -1.2, turret: 2.1, pitch: 0.5, roll: 2 });
    for (const index of [0, 1, 2]) {
      const mount = mountPose(state, wide, index, out());
      const tip = muzzlePose(state, wide, index, out());
      expect(Math.hypot(tip.x - mount.x, tip.y - mount.y)).toBeCloseTo(wide.mounts[index].reach, 9);
    }
  });

  it('simetrik poz simetrik ışınlar verir: iki yan yuva aynı açıda içe bakar', () => {
    const state = pose({ hull: 0, turret: 0 });
    const left = mountPose(state, wide, 1, out());
    const right = mountPose(state, wide, 2, out());
    expect(left.angle).toBeCloseTo(-right.angle, 12);
    expect(left.angle).toBeGreaterThan(0);
  });
});
