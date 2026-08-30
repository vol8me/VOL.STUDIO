import { describe, it, expect } from 'vitest';
import { solveTwoBoneIk } from '../../src/math/ik';

const L1 = 90;
const L2 = 72;

/** IK çözümünden uç noktayı ileri kinematikle geri hesaplar. */
function tipOf(upperRad: number, lowerRad: number): { x: number; y: number } {
  const kx = Math.cos(upperRad) * L1;
  const ky = Math.sin(upperRad) * L1;
  return { x: kx + Math.cos(lowerRad) * L2, y: ky + Math.sin(lowerRad) * L2 };
}

describe('solveTwoBoneIk', () => {
  it('erişilebilir hedefe uç noktayı TAM oturtur', () => {
    for (const [dx, dy] of [
      [120, 0],
      [0, 120],
      [-90, 60],
      [70, -95],
      [-40, -130],
    ]) {
      const solved = solveTwoBoneIk(dx, dy, L1, L2, 1);
      const tip = tipOf(solved.upperRad, solved.lowerRad);
      expect(tip.x).toBeCloseTo(dx, 4);
      expect(tip.y).toBeCloseTo(dy, 4);
      expect(solved.clamped).toBe(false);
    }
  });

  it('bendSign dizi zıt tarafa bükerken uç nokta AYNI kalır', () => {
    const positive = solveTwoBoneIk(100, 40, L1, L2, 1);
    const negative = solveTwoBoneIk(100, 40, L1, L2, -1);

    expect(positive.upperRad).not.toBeCloseTo(negative.upperRad, 3);

    const a = tipOf(positive.upperRad, positive.lowerRad);
    const b = tipOf(negative.upperRad, negative.lowerRad);
    expect(a.x).toBeCloseTo(b.x, 4);
    expect(a.y).toBeCloseTo(b.y, 4);
  });

  it('erişim dışı hedefte uzuv tam gerilir ve clamped bildirir', () => {
    const solved = solveTwoBoneIk(500, 0, L1, L2, 1);
    expect(solved.clamped).toBe(true);
    // Kelepçe epsilonu kadar bir artık bükülme kalır (~0.06°) — düz sayılır.
    expect(solved.upperRad).toBeCloseTo(0, 2);
    expect(solved.lowerRad).toBeCloseTo(0, 2);

    const tip = tipOf(solved.upperRad, solved.lowerRad);
    expect(Math.hypot(tip.x, tip.y)).toBeCloseTo(L1 + L2, 2);
  });

  it('erişemeyecek kadar yakın hedefte tamamen katlanır, NaN üretmez', () => {
    const solved = solveTwoBoneIk(0.5, 0, L1, L2, 1);
    expect(solved.clamped).toBe(true);
    expect(Number.isFinite(solved.upperRad)).toBe(true);
    expect(Number.isFinite(solved.lowerRad)).toBe(true);
  });

  it('sıfır vektörde bile sonlu bir çözüm döner', () => {
    const solved = solveTwoBoneIk(0, 0, L1, L2, 1);
    expect(Number.isFinite(solved.upperRad)).toBe(true);
    expect(Number.isFinite(solved.lowerRad)).toBe(true);
  });
});
