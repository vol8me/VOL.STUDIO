import { describe, expect, it } from 'vitest';
import { spatialSound, blastDistance } from '@/audio/spatial';

describe('konumsal ses', () => {
  it('yakında tam seviye, iki kat mesafede yarı seviye ve stereo konum verir', () => {
    const listener = { x: 100, y: 50 };
    expect(spatialSound({ x: 100, y: 50 }, listener)).toEqual({ gain: 1, pan: 0 });
    expect(spatialSound({ x: 420, y: 50 }, listener)).toEqual({ gain: 0.5, pan: 0.5 });
    expect(spatialSound({ x: -540, y: 50 }, listener)).toEqual({ gain: 0.25, pan: -1 });
    expect(spatialSound({ x: 100, y: 3250 }, listener).gain).toBe(0);
  });
  it('mesafe katmanını dünya birimleriyle seçer', () => {
    expect(blastDistance(200)).toBe('near');
    expect(blastDistance(600)).toBe('mid');
    expect(blastDistance(1500)).toBe('far');
  });
});
