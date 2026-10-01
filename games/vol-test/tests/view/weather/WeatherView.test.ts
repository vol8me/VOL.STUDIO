import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { EFFECT_LEVELS } from '@/config/quality';
import { WeatherView } from '@/view/weather/WeatherView';
import { fakeScene, lastCall } from '../../support/fakeScene';
import { frame, sample, vehicle, weather } from '../../support/weatherFixtures';

const rect = { x: 0, y: 0, width: 256, height: 256 };

describe('WeatherView', () => {
  it('kaliteyi canlı uygular, sabit kaynakları tekrar kullanır ve destroy sonrası çizmez', () => {
    const scene = fakeScene();
    const view = new WeatherView(scene as unknown as Phaser.Scene, 8, EFFECT_LEVELS.high);
    const created = scene.created.length;
    view.update(weather(), rect, [vehicle()]);
    expect(view.counts.particles).toBe(512);
    view.applyProfile(EFFECT_LEVELS.low);
    view.update(weather(), rect, [vehicle()]);
    expect(view.counts.particles).toBe(256);
    expect(scene.created.length).toBe(created);
    view.destroy();
    view.destroy();
    const graphics = scene.created.filter((object) => object.kind === 'graphics');
    expect(
      graphics.every((object) => object.calls.filter(([name]) => name === 'destroy').length === 1),
    ).toBe(true);
    const drawCalls = graphics.map((object) => object.calls.length);
    view.update(weather(), rect, []);
    expect(graphics.map((object) => object.calls.length)).toEqual(drawCalls);
    expect(graphics.every((object) => lastCall(object, 'destroy') !== undefined)).toBe(true);
  });
  it('kar ve toz küçük yerel şekillerle çizilir; sakin kuru hava yağış ya da su yansıması üretmez', () => {
    const scene = fakeScene();
    const view = new WeatherView(scene as unknown as Phaser.Scene, 12, EFFECT_LEVELS.high);
    const sky = scene.created.filter((object) => object.kind === 'graphics')[3];
    const source = weather(sample({ wetness: 0, puddleDepth: 0 }));
    view.update({ ...source, frame: frame({ rain: 0, snow: 1 }) }, rect, [vehicle()]);
    expect(sky.calls.filter(([name]) => name === 'fillCircle')).toHaveLength(512);
    expect(view.counts.reflections).toBe(0);
    view.update({ ...source, frame: frame({ rain: 0, dust: 1, elapsedMs: 1200 }) }, rect, []);
    expect(sky.calls.filter(([name]) => name === 'fillCircle')).toHaveLength(512);
    expect(sky.calls.filter(([name]) => name === 'fillEllipse')).toHaveLength(144);
    view.update({ ...source, frame: frame({ rain: 0, kind: 'clear' }) }, rect, []);
    expect(view.counts.particles).toBe(0);
    expect(view.counts.wakes).toBe(0);
    view.destroy();
  });
});
