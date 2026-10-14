import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { PLASMA_CANNON_RIG } from '@/config/rigAssets';
import { CANNON_VIEW, WALKER_ART } from '@/config/walkerView';
import { TEXTURE } from '@/view/textures';
import { PlasmaCannon } from '@/view/walker/PlasmaCannon';
import { rigScene, type FakeContainer, type FakeImage } from '../../support/rigScene';

function build() {
  const scene = rigScene(PLASMA_CANNON_RIG);
  const lighting = scene.add.container();
  const cannon = new PlasmaCannon(
    scene as unknown as Phaser.Scene,
    lighting as unknown as Phaser.GameObjects.Container,
  );
  const part = (id: string): FakeContainer => {
    const found = scene.containers.find((container) =>
      container.list.some(
        (child) => child.kind === 'image' && (child as FakeImage).texture.key.endsWith(id),
      ),
    );
    if (!found) throw new Error(`${id} parçası yok`);
    return found;
  };
  const glows = () => scene.images.filter((image) => image.texture.key === TEXTURE.blast);
  return { scene, lighting, cannon, part, glows };
}

describe('PlasmaCannon', () => {
  it('rig parçalarını kurar, yuva ölçeğini uygular ve dönme eksenini gövde merkezine alır', () => {
    const { cannon } = build();
    const root = cannon.root as unknown as FakeContainer;
    expect(root.scaleX).toBe(WALKER_ART.cannonScale);
    // Gövde (housing_body) merkezi (28, 25), rig kökü merkezi (40, 28): kayma (12, 3).
    expect((cannon.solid as unknown as FakeContainer).x).toBeCloseTo(12, 6);
    expect((cannon.solid as unknown as FakeContainer).y).toBeCloseTo(3, 6);
  });

  it('ışıklar katı ağacın dışındadır: gölge yalnız katı parçaları örnekler', () => {
    const { cannon, glows } = build();
    const solid = cannon.solid as unknown as FakeContainer;
    const inSolid = (node: FakeContainer | FakeImage): boolean => {
      if (node.kind === 'image') return false;
      return node.list.some((child) => {
        if (child.kind === 'container') return inSolid(child as FakeContainer);
        return (child as FakeImage).texture.key === TEXTURE.blast;
      });
    };
    expect(inSolid(solid)).toBe(false);
    expect(glows().length).toBeGreaterThanOrEqual(3);
  });

  it('atış namluyu geri iter, yay yerine oturtur ve en çok `max` kadar kaydırır', () => {
    const { cannon, part } = build();
    const rod = part('barrel_rod');
    const rest = rod.x;
    cannon.fire();
    let deepest = 0;
    for (let frame = 0; frame < 6; frame++) {
      cannon.advance(16);
      deepest = Math.min(deepest, rod.x - rest);
    }
    expect(deepest).toBeLessThan(-0.5);
    expect(deepest).toBeGreaterThanOrEqual(-CANNON_VIEW.recoil.max - 1e-9);
    expect(cannon.recoilWorld).toBeLessThanOrEqual(0);
    for (let frame = 0; frame < 120; frame++) cannon.advance(16);
    expect(rod.x).toBeCloseTo(rest, 2);
    expect(cannon.recoilWorld).toBeCloseTo(0, 2);
  });

  it('ağız parlaması atışta namlu ucunda açılır, süre dolunca kapanır', () => {
    const { cannon, lighting } = build();
    const flash = lighting.list[0] as FakeImage;
    expect(flash.visible).toBe(false);

    cannon.fire();
    cannon.flashAt(0, 120, 80, 0.5);
    expect(flash.visible).toBe(true);
    expect(flash.x).toBe(120);
    expect(flash.y).toBe(80);
    expect(flash.rotation).toBe(0.5);
    expect(flash.tint).toBe(CANNON_VIEW.glow);

    cannon.flashAt(CANNON_VIEW.flashMs, 120, 80, 0.5);
    expect(flash.visible).toBe(false);
  });

  it('atış sonrası ısınma ışığı yanar ve sönme süresince söner', () => {
    const { cannon, glows } = build();
    const [lens] = glows();
    cannon.advance(16);
    const idle = lens.alpha;
    cannon.fire();
    cannon.advance(16);
    expect(lens.alpha).toBeGreaterThan(idle + 0.3);
    for (let ms = 0; ms < CANNON_VIEW.heatMs + 100; ms += 16) cannon.advance(16);
    expect(lens.alpha).toBeLessThan(idle + 0.15);
  });

  it('kapanışta kök ve parlama sökülür', () => {
    const { cannon, lighting } = build();
    cannon.destroy();
    expect((cannon.root as unknown as FakeContainer).destroyed).toBe(true);
    expect(lighting.list).toHaveLength(0);
  });
});
