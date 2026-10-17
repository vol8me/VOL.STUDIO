import Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { setCharred } from '@/view/charring';
import { addGlowPose, GlowMirror } from '@/view/glow';
import { TEXTURE } from '@/view/textures';
import { fakeObject, fakeScene, lastCall, type FakeObject } from '../support/fakeScene';

/** Dünya dönüşümü verilen sahte kapsayıcı: `decomposeMatrix` ayrıştırılmış konum, açı ve ölçek döner. */
function container(world: {
  translateX: number;
  translateY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}): FakeObject {
  const parent = fakeObject('container');
  Object.assign(parent, {
    active: true,
    alpha: 1,
    parentContainer: null,
    getWorldTransformMatrix: () => ({ decomposeMatrix: () => world }),
  });
  return parent;
}

function mirror(parent: FakeObject) {
  const scene = fakeScene();
  const lighting = fakeObject('container');
  const pose = addGlowPose(
    scene as unknown as Phaser.Scene,
    10,
    0,
    TEXTURE.blast,
  ) as unknown as FakeObject;
  Object.assign(pose, { texture: { key: 'vehicle-atlas' }, frame: { name: TEXTURE.blast } });
  const glow = new GlowMirror(
    scene as unknown as Phaser.Scene,
    lighting as unknown as Phaser.GameObjects.Container,
    parent as unknown as Phaser.GameObjects.Container,
    pose as unknown as Phaser.GameObjects.Image,
  );
  const shine = scene.created.at(-1) as FakeObject;
  return { scene, lighting, pose, glow, shine };
}

describe('GlowMirror', () => {
  it('tutucu sahneye çizilmez; gerçek görüntü ortak ışık katmanına girer ve ADD çizer', () => {
    const { scene, lighting, pose, shine } = mirror(
      container({ translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
    );
    expect(pose.calls.some(([name]) => name === 'removeFromDisplayList')).toBe(true);
    expect(lighting.calls.some(([name, args]) => name === 'add' && args[0] === shine)).toBe(true);
    expect(
      shine.calls.some(
        ([name, args]) => name === 'setBlendMode' && args[0] === Phaser.BlendModes.ADD,
      ),
    ).toBe(true);
    expect(scene.events.on).toHaveBeenCalledWith(
      Phaser.Scenes.Events.PRE_RENDER,
      expect.any(Function),
      expect.anything(),
    );
  });

  it('yerel pozu ata kapsayıcının dünya dönüşümüyle taşır: konum, dönüş ve ölçek', () => {
    const { glow, pose, shine } = mirror(
      container({ translateX: 100, translateY: 50, rotation: Math.PI / 2, scaleX: 2, scaleY: 2 }),
    );
    Object.assign(pose, {
      x: 10,
      y: 0,
      rotation: 0.25,
      scaleX: 3,
      scaleY: 3,
      alpha: 0.5,
      visible: true,
    });
    glow.sync();
    // (10, 0) iki kat büyür, 90° döner ve (100, 50)ye kayar: (100, 70).
    expect(shine.x as number).toBeCloseTo(100);
    expect(shine.y as number).toBeCloseTo(70);
    expect(shine.rotation as number).toBeCloseTo(Math.PI / 2 + 0.25);
    expect(lastCall(shine, 'setScale')).toEqual([6, 6]);
    expect(shine.alpha as number).toBeCloseTo(0.5);
    expect(shine.visible).toBe(true);
  });

  it('ata gizli, soluk ya da yanmışsa ışık gizlenir; geri gelince açılır', () => {
    const parent = container({ translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const { glow, pose, shine } = mirror(parent);
    Object.assign(pose, { alpha: 1, visible: true });
    glow.sync();
    expect(shine.visible).toBe(true);

    parent.visible = false;
    glow.sync();
    expect(shine.visible).toBe(false);
    parent.visible = true;

    parent.alpha = 0;
    glow.sync();
    expect(shine.visible).toBe(false);
    parent.alpha = 0.5;
    glow.sync();
    expect(shine.alpha as number).toBeCloseTo(0.5);

    setCharred(parent as unknown as Phaser.GameObjects.Container, true);
    glow.sync();
    expect(shine.visible).toBe(false);
    setCharred(parent as unknown as Phaser.GameObjects.Container, false);
    glow.sync();
    expect(shine.visible).toBe(true);

    pose.visible = false;
    glow.sync();
    expect(shine.visible).toBe(false);
  });

  it('üst kapsayıcının atası da hesaba katılır; yıkılınca olay, ışık ve tutucu temizlenir', () => {
    const grand = container({ translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const parent = container({ translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    Object.assign(parent, { parentContainer: grand });
    const { scene, glow, pose, shine } = mirror(parent);
    Object.assign(pose, { alpha: 1, visible: true });
    grand.alpha = 0.4;
    glow.sync();
    expect(shine.alpha as number).toBeCloseTo(0.4);
    grand.visible = false;
    glow.sync();
    expect(shine.visible).toBe(false);

    glow.destroy();
    expect(scene.events.off).toHaveBeenCalled();
    expect(shine.calls.some(([name]) => name === 'destroy')).toBe(true);
    expect(pose.calls.some(([name]) => name === 'destroy')).toBe(true);
    vi.clearAllMocks();
  });
});
