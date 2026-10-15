import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { PhaserVegetationHost } from '@/view/weather/VegetationHost';
import { fakeObject, fakeScene, lastCall, type FakeObject } from '../../support/fakeScene';

/** Doku boyu gerçek `RenderTexture` gibi okunabilir: sahte nesne `width`i kurulurken yazılır. */
function host() {
  const base = fakeScene();
  const scene = {
    ...base,
    add: {
      renderTexture: (...args: unknown[]): FakeObject => {
        const texture = base.add.renderTexture(...args);
        texture.width = args[2];
        return texture;
      },
    },
  };
  const textures = () => base.created.filter((object) => object.kind === 'renderTexture');
  const pens = () => base.created.filter((object) => object.kind === 'graphics');
  return {
    textures,
    pens,
    host: new PhaserVegetationHost(scene as unknown as Phaser.Scene, -92, -88.5),
  };
}

const pen = () => fakeObject('graphics') as unknown as Phaser.GameObjects.Graphics;

describe('PhaserVegetationHost', () => {
  it('geçici kalemleri sahneye eklemeden kurar ve katman başına ayrı kalem verir', () => {
    const { host: vegetation, pens } = host();
    const kinds = ['region', 'core', 'clumps', 'tips'] as const;
    expect(new Set(kinds.map((kind) => vegetation.pen(kind))).size).toBe(4);
    expect(pens()).toHaveLength(4);
  });

  it('dokuyu döşeme boyunda kurar, kalemi doku pikseline ölçekleyip köşeye kaydırarak basar', () => {
    const { host: vegetation, textures } = host();
    const brush = fakeObject('graphics');
    vegetation
      .create('body')
      .bake([brush as unknown as Phaser.GameObjects.Graphics], 784, 7184, 432, 1.5);
    const [texture] = textures();
    // 432 birim × 1,5 = 648 piksel; konum dünyadaki köşe, görünür boy 432 birimdir.
    expect(texture.args).toEqual([784, 7184, 648, 648]);
    expect(lastCall(texture, 'setDisplaySize')).toEqual([432, 432]);
    expect(lastCall(brush, 'setScale')).toEqual([1.5]);
    const drawn = lastCall(texture, 'draw')!;
    expect(drawn[0]).toBe(brush);
    expect(drawn.slice(1)).toEqual([-784 * 1.5, -7184 * 1.5]);
    const order = texture.calls.map(([name]) => name);
    expect(order.indexOf('clear')).toBeLessThan(order.indexOf('draw'));
    expect(order.indexOf('draw')).toBeLessThan(order.lastIndexOf('render'));
  });

  it('katman derinliğini taşır: gövde karın altında, uçlar karın üstünde', () => {
    const { host: vegetation, textures } = host();
    for (const kind of ['body', 'tips'] as const)
      vegetation.create(kind).bake([pen()], 0, 0, 100, 1);
    const depths = textures().map((object) => lastCall(object, 'setDepth')![0] as number);
    expect(depths).toEqual([-92, -88.5]);
  });

  it('doku boyu kademe değişince dokuyu yeniden kurar, aynı boyda aynı dokuyu yeniden kullanır', () => {
    const { host: vegetation, textures } = host();
    const image = vegetation.create('body');
    image.bake([pen()], 0, 0, 100, 1);
    image.bake([pen()], 0, 0, 100, 1);
    expect(textures()).toHaveLength(1);
    image.bake([pen()], 0, 0, 100, 2);
    expect(textures()).toHaveLength(2);
    expect(lastCall(textures()[0], 'destroy')).toBeDefined();
  });

  it('boya ve görünürlüğü sonradan kurulan dokuya da uygular; dispose her şeyi bırakır', () => {
    const { host: vegetation, textures, pens } = host();
    const image = vegetation.create('body');
    image.tone(0x808080);
    image.show(false);
    image.bake([pen()], 0, 0, 100, 1);
    const [texture] = textures();
    expect(lastCall(texture, 'setTint')).toEqual([0x808080]);
    expect(lastCall(texture, 'setVisible')).toEqual([false]);
    vegetation.dispose();
    expect(lastCall(texture, 'destroy')).toBeDefined();
    expect(pens().every((object) => lastCall(object, 'destroy') !== undefined)).toBe(true);
  });
});
