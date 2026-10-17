import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SPIDER_ART, SPIDER_LOOKS } from '@/config/spiders';
import { SpiderCannon } from '@/view/spider/SpiderCannon';
import { fakeScene, lastCall } from '../../support/fakeScene';

function build() {
  const scene = fakeScene();
  const lighting = scene.add.container(0, 0);
  const shadowLayer = scene.add.container(0, 0);
  const cannon = new SpiderCannon(
    scene as unknown as Phaser.Scene,
    SPIDER_LOOKS.arachnid,
    lighting as never,
    shadowLayer as never,
  );
  // Gölgeler siyaha boyanan ilk iki görüntüdür: önce yuva, sonra namlu demeti.
  const [housingShadow, barrelShadow] = scene.created.filter(
    (object) => object.kind === 'image' && lastCall(object, 'setTint')?.[0] === 0x000000,
  );
  return { cannon, barrelShadow, housingShadow };
}

describe('SpiderCannon gölgesi', () => {
  it('top gölgesi göğüs gölgesiyle aynı koyulukta ve ışığın yönünde kayar', () => {
    const { cannon, housingShadow } = build();
    expect(housingShadow.alpha).toBe(SPIDER_ART.shadowAlpha);
    cannon.shadowAt(10, 4, 0, 0.4, 0.5);
    const height = SPIDER_LOOKS.arachnid.cannon.height;
    expect(housingShadow.x).toBeCloseTo(10 + 0.4 * height);
    expect(housingShadow.y).toBeCloseTo(4 + 0.5 * height);
  });

  it('gövde yükselince gölge uzaklaşır, çömelince yaklaşır (gövde gölgesiyle birlikte)', () => {
    const { cannon, housingShadow } = build();
    cannon.shadowAt(0, 0, 0, 0.4, 0.5, 0);
    const rest = housingShadow.y as number;
    cannon.shadowAt(0, 0, 0, 0.4, 0.5, 5);
    expect(housingShadow.y as number).toBeGreaterThan(rest);
    cannon.shadowAt(0, 0, 0, 0.4, 0.5, -4);
    expect(housingShadow.y as number).toBeLessThan(rest);
  });
});
