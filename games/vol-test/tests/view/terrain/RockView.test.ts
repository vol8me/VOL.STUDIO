import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { OUTCROP_SPECS } from '@/config/rocks';
import { ROCK_VIEW } from '@/config/rockView';
import { WORLD } from '@/config/world';
import { RockField } from '@/sim/world/RockField';
import { RockView } from '@/view/terrain/RockView';
import { fakeScene } from '../../support/fakeScene';
import { frame, sample } from '../../support/weatherFixtures';

const field = new RockField(WORLD.width, WORLD.height, OUTCROP_SPECS);

function build(rocks = field) {
  const scene = fakeScene();
  const view = new RockView(scene as unknown as Phaser.Scene, rocks);
  const graphics = scene.created.find((object) => object.kind === 'graphics')!;
  return { view, graphics, scene };
}

/** Bir öbeğin üstünü gören görünür alan. */
function over(index: number) {
  const outcrop = field.outcrops[index];
  return {
    x: outcrop.x - outcrop.reach - 20,
    y: outcrop.y - outcrop.reach - 20,
    width: (outcrop.reach + 20) * 2,
    height: (outcrop.reach + 20) * 2,
  };
}

const weather = (overrides = {}) => ({
  frame: frame({ season: 'summer', daylight: 1 }),
  sample: () => sample({ wetness: 0, puddleDepth: 0, growth: 0, ...overrides }),
});

describe('RockView', () => {
  it('yalnız görünür alana değen öbekleri çizer; dışarıdakini çizmez', () => {
    const { view, graphics } = build();
    view.update({ x: -5000, y: -5000, width: 100, height: 100 }, weather());
    expect(view.drawn).toBe(0);
    expect(graphics.calls.filter(([name]) => name === 'fillPath')).toHaveLength(0);
    view.update(over(0), weather());
    expect(view.drawn).toBeGreaterThanOrEqual(field.outcrops[0].rocks.length);
    expect(graphics.calls.filter(([name]) => name === 'fillPath').length).toBeGreaterThan(0);
    view.update({ x: 0, y: 0, width: 0, height: 10 }, weather());
    expect(view.drawn).toBe(0);
  });

  it('yüzler ışıkla boyanır: aynı kaya iki kez aynı çizilir (tohumlu), ışık yüzleri farklı renk alır', () => {
    const a = build();
    const b = build();
    a.view.update(over(0), weather());
    b.view.update(over(0), weather());
    expect(a.graphics.calls).toEqual(b.graphics.calls);
    const colors = new Set(
      a.graphics.calls.filter(([name]) => name === 'fillStyle').map(([, args]) => args[0]),
    );
    // Yüzler tek renk değildir: aydınlık ve gölge yüzleri ile üst düzlem ayrışır.
    expect(colors.size).toBeGreaterThan(ROCK_VIEW.vertices / 2);
  });

  it('kar başlığı kaya rengini beyaza çeker; ıslaklık koyulaştırır', () => {
    const brightness = (overrides: object) => {
      const { view, graphics } = build();
      view.update(over(0), weather(overrides));
      const colors = graphics.calls
        .filter(([name]) => name === 'fillStyle')
        .map(([, args]) => Number(args[0]));
      return colors.reduce((sum, color) => sum + (color & 255), 0) / colors.length;
    };
    const dry = brightness({});
    expect(brightness({ snowDepth: 0.06 })).toBeGreaterThan(dry);
    expect(brightness({ wetness: 1 })).toBeLessThan(dry);
  });

  it('dibindeki yosun yeşillikle çıkar, karda gizlenir; destroy grafiği kaldırır', () => {
    const count = (overrides: object) => {
      const { view, graphics } = build();
      view.update(over(0), weather(overrides));
      return graphics.calls.filter(([name]) => name === 'fillEllipse').length;
    };
    expect(count({ growth: 0 })).toBe(0);
    expect(count({ growth: 1 })).toBeGreaterThan(0);
    expect(count({ growth: 1, snowDepth: 0.2 })).toBeLessThan(count({ growth: 1 }));
    const { view, graphics } = build();
    view.destroy();
    expect(graphics.calls.some(([name]) => name === 'destroy')).toBe(true);
  });
});
