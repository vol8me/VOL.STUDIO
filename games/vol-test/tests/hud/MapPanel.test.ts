import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOL_COLORS } from '@volstudio/core/ui';
import { gridImage } from '@/hud/MapPanel';

function fakeContext() {
  const lines: Array<[number, number]> = [];
  const context = {
    strokeStyle: '',
    lineWidth: 0,
    beginPath: vi.fn(),
    moveTo: vi.fn((x: number, y: number) => lines.push([x, y])),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
  return { context, lines };
}

describe('harita ızgarası', () => {
  afterEach(() => vi.restoreAllMocks());

  it('dünyayı verilen aralıkla böler; kenarları çizmez, UI tokenıyla boyar', () => {
    const { context, lines } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const canvas = gridImage(4096, 2048, 1024);
    const vertical = lines.filter(([, y]) => y === 0).map(([x]) => x);
    const horizontal = lines.filter(([x]) => x === 0).map(([, y]) => y);
    expect(vertical).toEqual([0.25, 0.5, 0.75].map((ratio) => ratio * canvas.width + 0.5));
    expect(horizontal).toEqual([0.5 * canvas.height + 0.5]);
    expect(context.strokeStyle).toBe(VOL_COLORS.uiBorderSoft);
    expect(context.stroke).toHaveBeenCalledTimes(1);
  });

  it('2B bağlam yoksa boş doku döner (HUD kurulmaya devam eder)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(gridImage(1024, 1024, 256).width).toBeGreaterThan(0);
  });
});
