import { describe, expect, it } from 'vitest';
import { StepClock } from '../../server/stepClock';

/** Düzgün `intervalMs` aralıklı tetiklemelerde `seconds` saniyede koşulan adım ve en uzun adım aralığı. */
function simulate(
  stepMs: number,
  intervalMs: number,
  seconds: number,
): { steps: number; longestGap: number } {
  const clock = new StepClock(stepMs, 0);
  let steps = 0;
  let lastStepAt = 0;
  let longestGap = 0;
  for (let now = intervalMs; now <= seconds * 1000; now += intervalMs) {
    const due = clock.due(now);
    if (due > 0) {
      longestGap = Math.max(longestGap, now - lastStepAt);
      lastStepAt = now;
    }
    steps += due;
  }
  return { steps, longestGap };
}

describe('StepClock', () => {
  it('adım süresinden kısa aralıkla hedef hızı tutar ve boşluk bir aralığı geçmez', () => {
    const { steps, longestGap } = simulate(1000 / 30, 10, 60);
    expect(Math.abs(steps - 30 * 60)).toBeLessThanOrEqual(1);
    expect(longestGap).toBeLessThanOrEqual(40);
  });

  it('kırpılmış aralık (33 ms) ile 33,33 ms adımda iki adımlık boşluk üretir; bu yüzden kullanılmaz', () => {
    expect(simulate(1000 / 30, 33, 60).longestGap).toBeGreaterThanOrEqual(66);
  });

  it('uzun duraklamadan sonra en çok maxCatchUp adım koşar ve birikim atılır', () => {
    const clock = new StepClock(10, 0, 3);
    expect(clock.due(1000)).toBe(3);
    expect(clock.due(1005)).toBe(0);
    expect(clock.due(1010)).toBe(1);
  });

  it('geriye giden saat adım üretmez', () => {
    const clock = new StepClock(10, 100);
    expect(clock.due(50)).toBe(0);
    expect(clock.due(110)).toBe(1);
  });
});
