import { describe, expect, it } from 'vitest';
import { AimPresence } from '@/view/effects/AimPresence';

describe('AimPresence', () => {
  it('etkinleşince fadeIn sürede tam açılır, bırakılınca fadeOut sürede söner', () => {
    const presence = new AimPresence(100, 400);
    expect(presence.update(true, 50)).toBeCloseTo(0.5, 9);
    expect(presence.update(true, 50)).toBe(1);
    expect(presence.update(true, 1000)).toBe(1);
    expect(presence.update(false, 200)).toBeCloseTo(0.5, 9);
    expect(presence.update(false, 200)).toBe(0);
    expect(presence.update(false, 1000)).toBe(0);
  });

  it('geçiş yumuşaktır: baştaki ve sondaki hız yarı doğrusal hızdan yavaş, ortada hızlıdır', () => {
    const presence = new AimPresence(100, 100);
    const early = presence.update(true, 10);
    expect(early).toBeLessThan(0.1);
    presence.update(true, 30);
    const before = presence.value;
    const middle = presence.update(true, 10) - before;
    expect(middle).toBeGreaterThan(0.1);
  });

  it('yarıda bırakılan açılış kaldığı yerden söner; reset sıfırlar', () => {
    const presence = new AimPresence(100, 200);
    presence.update(true, 50);
    const half = presence.value;
    expect(presence.update(false, 50)).toBeLessThan(half);
    presence.reset();
    expect(presence.value).toBe(0);
  });

  it('geçersiz süreyi reddeder', () => {
    expect(() => new AimPresence(0, 100)).toThrow(RangeError);
    expect(() => new AimPresence(100, -1)).toThrow(RangeError);
  });
});
