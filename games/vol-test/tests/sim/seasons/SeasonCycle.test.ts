import { describe, expect, it } from 'vitest';
import { SeasonCycle } from '@/sim/seasons/SeasonCycle';
import { SEASONS } from '@/config/seasons';

describe('SeasonCycle', () => {
  it('dört mevsim bir saatte döner; on dakikalık oturum ilkbaharda kalır', () => {
    const cycle = new SeasonCycle();
    expect(cycle.frame.kind).toBe('spring');
    cycle.step(600_000);
    expect(cycle.frame.kind).toBe('spring');
    for (let index = 0; index < 8; index++) {
      const frame = cycle.frameAt(index * SEASONS.durationMs);
      expect(frame.kind).toBe(SEASONS.order[index % 4]);
      expect(frame.progress).toBe(0);
    }
    expect(cycle.frameAt(3600_000).kind).toBe('spring');
  });

  it('önizleme başlangıcı oturum saatini değiştirmeden seçilen mevsimde açılır', () => {
    for (const kind of SEASONS.order) {
      const cycle = new SeasonCycle(kind);
      expect(cycle.frame.kind).toBe(kind);
      expect(cycle.frame.elapsedMs).toBe(0);
      expect(cycle.frameAt(600_000).kind).toBe(kind);
      expect(cycle.frameAt(600_000).elapsedMs).toBe(600_000);
    }
  });

  it('sıcaklık, gün ışığı ve hava olasılıkları mevsim sınırında süreklidir', () => {
    const cycle = new SeasonCycle();
    for (let index = 1; index <= 4; index++) {
      const before = cycle.frameAt(index * SEASONS.durationMs - 1);
      const after = cycle.frameAt(index * SEASONS.durationMs);
      expect(before.temperature).toBeCloseTo(after.temperature, 6);
      expect(before.daylight).toBeCloseTo(after.daylight, 6);
      const sum = Object.values(before.weather).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
      expect(Object.isFrozen(before.weather)).toBe(true);
    }
  });

  it('duraklayan saat değişmez ve bozuk zaman değeri reddedilir', () => {
    const cycle = new SeasonCycle();
    const before = cycle.frame;
    cycle.step(0);
    expect(cycle.frame).toEqual(before);
    for (const time of [-1, Infinity, NaN]) {
      expect(() => cycle.step(time)).toThrow(RangeError);
      expect(() => cycle.frameAt(time)).toThrow(RangeError);
    }
  });
});
