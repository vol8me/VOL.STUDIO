import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { AimGuide } from '@/view/effects/AimGuide';
import { fakeScene, lastCall } from '../../support/fakeScene';

/** Düz bir yol: `x0,y0` başlangıç, her örnek `step` ilerler. */
function straight(fromX: number, fromY: number, count: number, step: number) {
  const path = new Float32Array(count * 2);
  for (let index = 0; index < count; index++) {
    path[index * 2] = fromX + index * step;
    path[index * 2 + 1] = fromY;
  }
  return { path, length: count };
}

describe('AimGuide', () => {
  it('nişan alırken namludan tahmini isabete çizilir; bırakınca anında silinir', () => {
    const scene = fakeScene();
    const guide = new AimGuide(scene as unknown as Phaser.Scene);
    const graphics = scene.created[0];
    guide.draw({ ...straight(10, 20, 31, 13), aligned: false }, 100);
    expect(lastCall(graphics, 'moveTo')).toEqual([10, 20]);
    expect(lastCall(graphics, 'lineTo')).toEqual([400, 20]);
    expect(lastCall(graphics, 'strokeCircle')).toEqual([400, 20, 5]);
    const before = graphics.calls.filter(([method]) => method === 'strokePath').length;
    guide.draw(null, 200);
    expect(graphics.calls.filter(([method]) => method === 'strokePath')).toHaveLength(before);
    expect(lastCall(graphics, 'clear')).toBeDefined();
    guide.destroy();
    expect(lastCall(graphics, 'destroy')).toBeDefined();
  });

  it('hedefe oturunca renk değişir; sürekli nişan yeni nesne doğurmaz', () => {
    const scene = fakeScene();
    const guide = new AimGuide(scene as unknown as Phaser.Scene);
    const graphics = scene.created[0];
    guide.draw({ ...straight(0, 0, 11, 60), aligned: false }, 0);
    const turning = lastCall(graphics, 'lineStyle')?.[1];
    for (let frame = 0; frame < 1000; frame++)
      guide.draw({ ...straight(0, 0, 11, 60), aligned: true }, frame);
    expect(lastCall(graphics, 'lineStyle')?.[1]).not.toBe(turning);
    expect(scene.created).toHaveLength(1);
  });

  it('yol seyrelir ama ilk ve son nokta her zaman çizilir; tek noktalı yol çizilmez', () => {
    const scene = fakeScene();
    const guide = new AimGuide(scene as unknown as Phaser.Scene);
    const graphics = scene.created[0];
    guide.draw({ ...straight(0, 0, 8, 10), aligned: true }, 0);
    const points = graphics.calls
      .filter(([method]) => method === 'lineTo')
      .slice(0, 3)
      .map(([, args]) => args);
    expect(points).toEqual([
      [30, 0],
      [60, 0],
      [70, 0],
    ]);
    const strokes = graphics.calls.filter(([method]) => method === 'strokePath').length;
    guide.draw({ ...straight(0, 0, 1, 10), aligned: true }, 1);
    expect(graphics.calls.filter(([method]) => method === 'strokePath')).toHaveLength(strokes);
  });

  it('görünürlük çizgiyi namludan uzatır ve işareti ucuna taşır; sıfırda hiçbir şey çizilmez', () => {
    const scene = fakeScene();
    const guide = new AimGuide(scene as unknown as Phaser.Scene);
    const graphics = scene.created[0];
    const frame = { ...straight(0, 0, 11, 100), aligned: true };
    guide.draw(frame, 0, 0.2);
    const end = lastCall(graphics, 'lineTo') as number[];
    expect(end[1]).toBe(0);
    expect(end[0]).toBeGreaterThan(0);
    expect(end[0]).toBeLessThan(1000);
    const marker = lastCall(graphics, 'strokeCircle') as number[];
    expect(marker.slice(0, 2)).toEqual(end);
    expect(marker[2]).toBeLessThan(5);
    guide.draw(frame, 0, 1);
    expect(lastCall(graphics, 'lineTo')).toEqual([1000, 0]);
    const strokes = graphics.calls.filter(([method]) => method === 'strokePath').length;
    guide.draw(frame, 0, 0);
    expect(graphics.calls.filter(([method]) => method === 'strokePath')).toHaveLength(strokes);
  });

  it('alfa görünürlükle ölçeklenir', () => {
    const scene = fakeScene();
    const guide = new AimGuide(scene as unknown as Phaser.Scene);
    const graphics = scene.created[0];
    const frame = { ...straight(0, 0, 11, 100), aligned: true };
    guide.draw(frame, 0, 1);
    const full = lastCall(graphics, 'lineStyle')?.[2] as number;
    guide.draw(frame, 0, 0.5);
    expect(lastCall(graphics, 'lineStyle')?.[2] as number).toBeCloseTo(full * 0.5, 9);
  });
});
