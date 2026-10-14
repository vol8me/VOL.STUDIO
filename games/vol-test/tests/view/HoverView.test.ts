import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { HOVER_ART, HOVER_VIEW } from '@/config/hoverView';
import { MANTA } from '@/config/vehicles';
import { TRACK_LEFT, TRACK_RIGHT } from '@/sim/chassis/parts';
import { muzzlePose } from '@/sim/muzzle';
import { HoverView } from '@/view/HoverView';
import { TEXTURE, TEXTURE_SCALE, hoverFrame } from '@/view/textures';
import type { TankFrame } from '@/view/VehicleView';
import { fakeScene, lastCall, type FakeObject } from '../support/fakeScene';

const INV = 1 / TEXTURE_SCALE;

const frame = (overrides: Partial<TankFrame> = {}): TankFrame => ({
  x: 100,
  y: 200,
  hull: 0.5,
  turret: 1.2,
  pitch: 0,
  roll: 0,
  treadLeft: 0,
  treadRight: 0,
  speed: 0,
  vx: 0,
  vy: 0,
  angularVelocity: 0,
  boosting: false,
  ...overrides,
});

function build() {
  const scene = fakeScene();
  const lighting = scene.add.container(0, 0);
  const view = new HoverView(scene as unknown as Phaser.Scene, MANTA, lighting as never);
  const byTexture = (key: string) => scene.created.filter((object) => object.args.includes(key));
  const containers = scene.created.filter((object) => object.kind === 'container');
  const root = containers.at(-1) as FakeObject;
  const body = containers.at(-2) as FakeObject;
  const turretRig = containers.at(-3) as FakeObject;
  return { scene, lighting, view, byTexture, root, body, turretRig };
}

describe('HoverView (manta)', () => {
  const art = HOVER_ART.manta;
  const offset = MANTA.hover.trackOffset;

  it('çizim sırası: iticiler, pervaneler, lüle ışıkları, gövde; taret gövdenin içindedir', () => {
    const { byTexture, root, body, turretRig } = build();
    const children = root.list as FakeObject[];
    const pods = byTexture(hoverFrame('manta', 'pod'));
    const fans = byTexture(hoverFrame('manta', 'fan'));
    expect(pods).toHaveLength(2);
    expect(fans).toHaveLength(2);
    pods.forEach((pod, index) => expect(children[index]).toBe(pod));
    fans.forEach((fan, index) => expect(children[2 + index]).toBe(fan));
    expect(children.at(-1)).toBe(body);
    expect(body.list).toContain(turretRig);
    expect(byTexture(hoverFrame('manta', 'hull'))[0].scale).toBe(INV);
  });

  it('iticiler fizik yan aralığında durur ve sol yan sağın aynasıdır', () => {
    const { byTexture } = build();
    const [left, right] = byTexture(hoverFrame('manta', 'pod'));
    expect(left.args[1]).toBe(-offset);
    expect(right.args[1]).toBe(offset);
    expect(lastCall(left, 'setScale')).toEqual([INV, -INV]);
    expect(lastCall(right, 'setScale')).toEqual([INV, INV]);
  });

  it('ağız parlaması sim namlu ucuyla çakışır (eğik poz ve geri tepme dahil)', () => {
    const poses: Array<Partial<TankFrame>> = [
      { hull: 0.5, turret: 1.2, pitch: 2.5, roll: -3 },
      { hull: -2.4, turret: 0.7, pitch: -3.6, roll: 1.4 },
    ];
    for (const pose of poses) {
      const { view, byTexture } = build();
      view.update(frame(pose), 16);
      const state = frame(pose);
      const tip = muzzlePose(state, MANTA.armament, 0, { x: 0, y: 0, angle: 0 });
      const flash = byTexture(TEXTURE.flash)[0];
      expect(flash.x).toBeCloseTo(tip.x, 6);
      expect(flash.y).toBeCloseTo(tip.y, 6);
      expect(flash.rotation).toBeCloseTo(tip.angle, 9);
    }
  });

  it('atışta ağız parlar ve söner; taret gövdeden bağımsız döner', () => {
    const { view, byTexture, turretRig } = build();
    const flash = byTexture(TEXTURE.flash)[0];
    view.fire();
    expect(flash.visible).toBe(true);
    view.update(frame(), 16);
    expect(turretRig.rotation).toBeCloseTo(1.2 - 0.5);
    view.update(frame(), HOVER_VIEW.flashMs + 1);
    expect(flash.visible).toBe(false);
  });

  it('gövde süspansiyonla kayar, iticiler daha az kayar', () => {
    const { view, body, byTexture } = build();
    view.update(frame({ pitch: -4, roll: 3 }), 16);
    expect(lastCall(body, 'setPosition')).toEqual([-4, 3]);
    const [left] = byTexture(hoverFrame('manta', 'pod'));
    expect(left.x).toBeCloseTo(art.pod.x - 4 * HOVER_VIEW.podFollow);
    expect(left.y).toBeCloseTo(-offset + 3 * HOVER_VIEW.podFollow);
  });

  it('pervane hızla ve atılımla hızlanır; iki yan ters yönde döner', () => {
    const idle = build();
    idle.view.update(frame(), 100);
    const [idleLeft, idleRight] = idle.byTexture(hoverFrame('manta', 'fan'));
    const fast = build();
    fast.view.update(frame({ speed: 300, boosting: true }), 100);
    const [fastLeft, fastRight] = fast.byTexture(hoverFrame('manta', 'fan'));
    expect(Number(idleRight.rotation)).toBeGreaterThan(0);
    expect(Number(idleLeft.rotation)).toBeLessThan(0);
    expect(Math.abs(Number(fastRight.rotation))).toBeGreaterThan(
      Math.abs(Number(idleRight.rotation)) * 2,
    );
    expect(Math.abs(Number(fastLeft.rotation))).toBeGreaterThan(
      Math.abs(Number(idleLeft.rotation)) * 2,
    );
  });

  it('kırık itici kısa kütüğe döner, pervanesi gizlenir, lüle ışığı söner; onarım geri alır', () => {
    const { view, byTexture, scene } = build();
    const [pod] = byTexture(hoverFrame('manta', 'pod'));
    const [fan] = byTexture(hoverFrame('manta', 'fan'));
    view.setParts(TRACK_LEFT);
    view.update(frame({ speed: 200 }), 16);
    expect(Number(lastCall(pod, 'setScale')?.[0])).toBeLessThan(INV);
    expect(fan.visible).toBe(false);
    const glows = scene.created.filter((object) => object.args.includes(TEXTURE.blast));
    expect(glows[0].alpha).toBe(0);
    expect(Number(glows[1].alpha)).toBeGreaterThan(0);
    view.setParts(0);
    expect(lastCall(pod, 'setScale')).toEqual([INV, -INV]);
    expect(fan.visible).toBe(true);
    view.setParts(TRACK_RIGHT);
    expect(byTexture(hoverFrame('manta', 'fan'))[0].visible).toBe(true);
  });

  it('imha edilince gövde, gölge ve ağız parlaması gizlenir; geri gelince görünür', () => {
    const { view, root, byTexture } = build();
    view.fire();
    view.setPresent(false);
    expect(root.visible).toBe(false);
    expect(byTexture(TEXTURE.flash)[0].visible).toBe(false);
    view.setPresent(true);
    expect(root.visible).toBe(true);
  });

  it('kapanışta kökü ve parlamayı söker', () => {
    const { view, root, byTexture } = build();
    view.destroy();
    expect(root.calls.some(([name]) => name === 'destroy')).toBe(true);
    expect(byTexture(TEXTURE.flash)[0].calls.some(([name]) => name === 'destroy')).toBe(true);
  });
});
