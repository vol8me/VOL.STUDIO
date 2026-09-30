import { describe, expect, it } from 'vitest';
import { angleDelta, lerpAngle, rotateTowards, wrapAngle } from '../../src/math/angle';

describe('angle', () => {
  it('açıyı (-π, π] aralığına sarar', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
  });

  it('en kısa farkı işaretiyle verir', () => {
    expect(angleDelta(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2);
    expect(angleDelta(0, -0.5)).toBeCloseTo(-0.5);
  });

  it('hedefi aşmadan döndürür', () => {
    expect(rotateTowards(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(rotateTowards(0, 0.1, 0.25)).toBeCloseTo(0.1);
    expect(rotateTowards(Math.PI * 0.95, -Math.PI * 0.95, 0.05)).toBeCloseTo(
      wrapAngle(Math.PI * 0.95 + 0.05),
    );
  });

  it('ara değeri kısa yoldan alır', () => {
    expect(Math.abs(lerpAngle(Math.PI * 0.9, -Math.PI * 0.9, 0.5))).toBeCloseTo(Math.PI);
  });
});
