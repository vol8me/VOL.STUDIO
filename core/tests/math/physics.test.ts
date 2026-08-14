import { describe, it, expect } from 'vitest';
import { toStepVelocity } from '../../src/math/physics';

describe('toStepVelocity', () => {
  it('piksel/saniyeyi adım başına piksele çevirir', () => {
    const step = toStepVelocity(60, 16.666_666_666_666_666);
    expect(step).toBeCloseTo(60 / 60, 10);
  });

  it('varsayılan adım süresi 60 FPS eşdeğeridir', () => {
    expect(toStepVelocity(60)).toBeCloseTo(60 / 60, 10);
  });

  it('NaN, Infinity veya negatif deltaMs için sıfır döner', () => {
    expect(toStepVelocity(60, NaN)).toBe(0);
    expect(toStepVelocity(60, Infinity)).toBe(0);
    expect(toStepVelocity(60, -1)).toBe(0);
    expect(toStepVelocity(NaN, 16)).toBe(0);
    expect(toStepVelocity(Infinity, 16)).toBe(0);
  });

  it('deltaMs 0 ise sıfır döner', () => {
    expect(toStepVelocity(60, 0)).toBe(0);
  });
});
