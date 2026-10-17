import { describe, expect, it } from 'vitest';
import { summarizeFrameIntervals } from '../../src/time/frameSummary';

describe('summarizeFrameIntervals', () => {
  it('boş ve geçersiz zamanları istatistiğe sokmaz', () => {
    expect(summarizeFrameIntervals([])).toBeNull();
    expect(summarizeFrameIntervals([NaN, Infinity, 0, -1])).toBeNull();
    expect(summarizeFrameIntervals([16, NaN, 16, -1])?.frames).toBe(2);
  });
  it('kare yüzdeliklerini ve eşik sayaçlarını aynı örneklemden üretir', () => {
    const result = summarizeFrameIntervals([...Array<number>(99).fill(16.7), 50]);
    expect(result).toMatchObject({
      frames: 100,
      p50: 16.7,
      p95: 16.7,
      p99: 50,
      over20ms: 1,
      over34ms: 1,
    });
    expect(result?.fps).toBe(58.7);
  });
});
