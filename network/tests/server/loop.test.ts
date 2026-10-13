import { describe, expect, it } from 'vitest';
import { pumpIntervalMs, runRoomLoop, StepClock } from '../../src/server';

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

  it('kırpılmış 33 ms aralığı 33,33 ms adımda iki adımlık boşluk üretir; bu yüzden aralık kırpılmaz', () => {
    expect(simulate(1000 / 30, 33, 60).longestGap).toBeGreaterThanOrEqual(66);
  });

  it('uzun duraklamadan sonra en çok maxCatchUp adım koşar ve birikim atılır', () => {
    const clock = new StepClock(10, 0, 3);
    expect(clock.due(1000)).toBe(3);
    expect(clock.due(1005)).toBe(0);
    expect(clock.due(1010)).toBe(1);
  });

  it('tam maxCatchUp adım borçluyken kalan kesri atmaz', () => {
    const clock = new StepClock(10, 0, 3);
    expect(clock.due(35)).toBe(3);
    expect(clock.due(40)).toBe(1);
  });

  it('geriye giden saat adım üretmez ve birikimi bozmaz', () => {
    const clock = new StepClock(10, 100);
    expect(clock.due(50)).toBe(0);
    expect(clock.due(110)).toBe(1);
  });

  it('geçersiz adım süresini ve yakalama sınırını reddeder', () => {
    expect(() => new StepClock(0, 0)).toThrow(RangeError);
    expect(() => new StepClock(Number.NaN, 0)).toThrow(RangeError);
    expect(() => new StepClock(Number.POSITIVE_INFINITY, 0)).toThrow(RangeError);
    expect(() => new StepClock(10, 0, 0)).toThrow(RangeError);
    expect(() => new StepClock(10, 0, 1.5)).toThrow(RangeError);
  });
});

describe('pumpIntervalMs', () => {
  it('adımın üçte biridir ve 4-10 ms arasında kalır', () => {
    expect(pumpIntervalMs(1000 / 30)).toBe(10);
    expect(pumpIntervalMs(1000 / 60)).toBeCloseTo(1000 / 180, 6);
    expect(pumpIntervalMs(1000 / 240)).toBe(4);
    expect(pumpIntervalMs(2)).toBe(4);
  });
});

describe('runRoomLoop', () => {
  function fakeRoom(): {
    room: { setTimestep: (callback?: (deltaTime: number) => void, ms?: number) => void };
    tick: () => void;
    delay: () => number;
  } {
    let callback: ((deltaTime: number) => void) | undefined;
    let delay = 0;
    return {
      room: {
        setTimestep: (next, ms) => {
          callback = next;
          delay = ms ?? 0;
        },
      },
      tick: () => callback?.(0),
      delay: () => delay,
    };
  }

  it('odaya tek tetikleyici bağlar ve her tetiklemede borçlu adım sayısını koşar', () => {
    const { room, tick, delay } = fakeRoom();
    let now = 0;
    let steps = 0;
    runRoomLoop(room, 30, () => steps++, { now: () => now });
    expect(delay()).toBe(10);
    now = 10;
    tick();
    expect(steps).toBe(0);
    now = 70;
    tick();
    expect(steps).toBe(2);
  });

  it('geçersiz hızı reddeder', () => {
    const { room } = fakeRoom();
    expect(() => runRoomLoop(room, 0, () => undefined)).toThrow(RangeError);
    expect(() => runRoomLoop(room, Number.NaN, () => undefined)).toThrow(RangeError);
  });

  it('varsayılan saat gerçek zamandır: bekledikten sonra borçlu adımlar koşar', async () => {
    const { room, tick } = fakeRoom();
    let steps = 0;
    runRoomLoop(room, 1000, () => steps++);
    await new Promise((resolve) => setTimeout(resolve, 20));
    tick();
    expect(steps).toBeGreaterThanOrEqual(1);
    expect(steps).toBeLessThanOrEqual(5);
  });
});
