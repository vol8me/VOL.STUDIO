import { describe, expect, it } from 'vitest';
import { ServerTimeline } from '../../src/client/timeline';
describe('ServerTimeline', () => {
  it('ilk gözlemden önce bilinmez, sonra farkı ekler', () => {
    const timeline = new ServerTimeline();
    expect(timeline.known).toBe(false);
    expect(timeline.toServer(100)).toBeUndefined();
    timeline.observe(1000, 5000);
    expect(timeline.known).toBe(true);
    expect(timeline.toServer(1500)).toBe(5500);
  });

  it('farkı üstel ortalamayla izler', () => {
    const timeline = new ServerTimeline(0.5);
    timeline.observe(0, 1000);
    timeline.observe(100, 1120);
    // 1000 → 1020 arasının yarısı.
    expect(timeline.toServer(0)).toBe(1010);
  });

  it('geçersiz gözlemi yok sayar ve yumuşatmayı doğrular', () => {
    const timeline = new ServerTimeline();
    timeline.observe(Number.NaN, 5);
    timeline.observe(5, 0);
    timeline.observe(5, Number.POSITIVE_INFINITY);
    expect(timeline.known).toBe(false);
    expect(() => new ServerTimeline(0)).toThrow(RangeError);
    expect(() => new ServerTimeline(1.5)).toThrow(RangeError);
  });
});
