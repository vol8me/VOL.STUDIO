import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { AimGuide } from '@/view/effects/AimGuide';
import { fakeScene, lastCall } from '../../support/fakeScene';

describe('AimGuide', () => {
  it('nişan alırken namludan tahmini isabete çizilir; bırakınca anında silinir', () => {
    const scene = fakeScene();
    const guide = new AimGuide(scene as unknown as Phaser.Scene);
    const graphics = scene.created[0];
    guide.draw({ x: 10, y: 20, endX: 400, endY: 50, aligned: false }, 100);
    expect(lastCall(graphics, 'lineBetween')).toEqual([10, 20, 400, 50]);
    expect(lastCall(graphics, 'strokeCircle')).toEqual([400, 50, 5]);
    const before = graphics.calls.filter(([method]) => method === 'lineBetween').length;
    guide.draw(null, 200);
    expect(graphics.calls.filter(([method]) => method === 'lineBetween')).toHaveLength(before);
    expect(lastCall(graphics, 'clear')).toBeDefined();
    guide.destroy();
    expect(lastCall(graphics, 'destroy')).toBeDefined();
  });

  it('hedefe oturunca renk değişir; sürekli nişan yeni nesne doğurmaz', () => {
    const scene = fakeScene();
    const guide = new AimGuide(scene as unknown as Phaser.Scene);
    const graphics = scene.created[0];
    guide.draw({ x: 0, y: 0, endX: 600, endY: 0, aligned: false }, 0);
    const turning = lastCall(graphics, 'lineStyle')?.[1];
    for (let frame = 0; frame < 1000; frame++)
      guide.draw({ x: 0, y: 0, endX: 600, endY: 0, aligned: true }, frame);
    expect(lastCall(graphics, 'lineStyle')?.[1]).not.toBe(turning);
    expect(scene.created).toHaveLength(1);
  });
});
