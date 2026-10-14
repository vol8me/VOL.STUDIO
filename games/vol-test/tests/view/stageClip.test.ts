import { describe, expect, it } from 'vitest';
import { clipStage } from '@/view/stageClip';

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
});

describe('clipStage', () => {
  it('görünümden uzun sahneyi görünür alana keser', () => {
    expect(clipStage(rect(300, 80, 200, 900), rect(40, 80, 760, 200))).toEqual(
      rect(300, 80, 200, 200),
    );
  });
  it('kaydırılmış sahnenin görünür kısmını verir', () => {
    expect(clipStage(rect(300, -400, 200, 900), rect(40, 80, 760, 200))).toEqual(
      rect(300, 80, 200, 200),
    );
  });
  it('sahne tümüyle görünürse değişmez', () => {
    expect(clipStage(rect(300, 100, 200, 100), rect(40, 80, 760, 300))).toEqual(
      rect(300, 100, 200, 100),
    );
  });
  it('kesişim yoksa sıfır boyutlu döner', () => {
    const clipped = clipStage(rect(300, 500, 200, 100), rect(40, 80, 760, 200));
    expect(clipped.width).toBeGreaterThanOrEqual(0);
    expect(clipped.height).toBe(0);
  });
});
