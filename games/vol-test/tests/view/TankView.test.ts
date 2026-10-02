import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { TANK } from '@/config/tank';
import { TankView, type TankFrame } from '@/view/TankView';
import { TEXTURE, TEXTURE_SCALE } from '@/view/textures';
import { fakeScene, lastCall } from '../support/fakeScene';

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
  angularVelocity: 0,
  boosting: false,
  ...overrides,
});

function build() {
  const scene = fakeScene();
  const view = new TankView(scene as unknown as Phaser.Scene);
  const byTexture = (key: string) => scene.created.filter((object) => object.args.includes(key));
  const containers = scene.created.filter((object) => object.kind === 'container');
  const [turretRig, body, root] = containers.slice(-3);
  return { view, byTexture, turretRig: turretRig, body: body, root: root };
}

describe('TankView', () => {
  it('ışıklar gövde ötelemesini ve bağımsız taretin dünya yönünü izler', () => {
    const { view, byTexture, body, turretRig } = build();
    view.fire();
    view.update(frame({ hull: Math.PI / 2, turret: 0, pitch: 2, roll: 3 }), 0);
    const core = byTexture(TEXTURE.core)[0];
    const flash = byTexture(TEXTURE.flash)[0];
    const children = body.list as unknown[];
    expect(children.indexOf(core)).toBeLessThan(children.indexOf(turretRig));
    expect(flash.x).toBeCloseTo(126);
    expect(flash.y).toBeCloseTo(202);
    expect(flash.rotation).toBeCloseTo(0);
  });
  it('palet geometrisi fizik ayarından türer', () => {
    const { byTexture } = build();
    const treads = byTexture(TEXTURE.treadBand);
    expect(treads).toHaveLength(2);
    expect(treads.map((tread) => tread.args[1])).toEqual([-TANK.trackOffset, TANK.trackOffset]);
    const ends = byTexture(TEXTURE.treadEnd);
    expect(ends).toHaveLength(4);
    const outer = Math.max(...ends.map((end) => Math.abs(end.args[0] as number)));
    const radius = TANK.halfWidth - TANK.trackOffset;
    expect(outer + radius).toBeCloseTo(TANK.halfLength);
    expect(byTexture(TEXTURE.hull)[0].scale).toBe(1 / TEXTURE_SCALE);
  });

  it('paletler yüzey yoluyla akar, uç halkaları aynı yolla döner', () => {
    const { view, byTexture, root } = build();
    view.update(frame({ treadLeft: 10, treadRight: -5 }), 16);
    expect(lastCall(root, 'setPosition')).toEqual([100, 200]);
    expect(root.rotation).toBe(0.5);
    const [left, right] = byTexture(TEXTURE.treadBand);
    expect(left.frame).toBe(8);
    expect(right.frame).toBe(12);
    const ends = byTexture(TEXTURE.treadEnd);
    const radius = TANK.halfWidth - TANK.trackOffset;
    expect(ends[0].rotation).toBeCloseTo(10 / radius);
    expect(ends[3].rotation).toBeCloseTo(-5 / radius);
  });

  it('gövde süspansiyonla paletlerin üstünde kayar, paletler yerinde kalır', () => {
    const { view, body, byTexture } = build();
    view.update(frame({ pitch: -2, roll: 1.5 }), 16);
    expect(lastCall(body, 'setPosition')).toEqual([-2, 1.5]);
    expect(byTexture(TEXTURE.treadBand)[0].args[0]).toBe(0);
  });

  it('taret gövdeden bağımsız döner', () => {
    const { view, turretRig } = build();
    view.update(frame({ hull: 0.5, turret: 1.2 }), 16);
    expect(turretRig.rotation).toBeCloseTo(0.7);
    view.update(frame({ hull: 2, turret: 1.2 }), 16);
    expect(turretRig.rotation).toBeCloseTo(-0.8);
  });

  it('atışta namlu geri teper, yayla döner; parlama kısa sürer', () => {
    const { view, byTexture } = build();
    const flash = byTexture(TEXTURE.flash)[0];
    const turret = byTexture(TEXTURE.turret)[0];
    view.fire();
    expect(flash.visible).toBe(true);
    view.update(frame(), 16);
    view.update(frame(), 16);
    expect(turret.x as number).toBeLessThan(-1);
    for (let step = 0; step < 60; step++) view.update(frame(), 16);
    expect(flash.visible).toBe(false);
    expect(Math.abs(turret.x as number)).toBeLessThan(0.05);
  });

  it('çekirdek hızlanmada büyür, duyargalar dönüşe savrulur', () => {
    const calm = build();
    const boosted = build();
    calm.view.update(frame(), 16);
    boosted.view.update(frame({ boosting: true, speed: 380 }), 16);
    const coreScale = (b: ReturnType<typeof build>) => b.byTexture(TEXTURE.core)[0].scale as number;
    expect(coreScale(boosted)).toBeGreaterThan(coreScale(calm));
    const turning = build();
    const feeler = () => turning.byTexture(TEXTURE.feeler)[0].rotation as number;
    turning.view.update(frame(), 16);
    const rest = feeler();
    for (let step = 0; step < 20; step++) turning.view.update(frame({ angularVelocity: 3 }), 16);
    expect(feeler()).not.toBeCloseTo(rest, 2);
  });

  it('gölge CORE PoseShadow ile katı parçaların pozundan üretilir; ışık kaynakları gölge vermez', () => {
    const scene = fakeScene();
    const view = new TankView(scene as unknown as Phaser.Scene);
    const before = scene.created.length;
    view.update(frame(), 16);
    const shadows = scene.created.slice(before);
    // Palet tabanları (2), palet uçları (4), duyargalar (2), gövde, taret.
    expect(shadows).toHaveLength(10);
    const keys = shadows.map((sprite) => sprite.args[2]);
    expect(keys).not.toContain(TEXTURE.core);
    expect(keys).not.toContain(TEXTURE.flash);
    expect(keys).not.toContain(TEXTURE.tread);
    expect(keys).toContain(TEXTURE.treadBase);
  });

  it('yok edilince kök kaldırılır', () => {
    const { view, root } = build();
    view.destroy();
    expect(lastCall(root, 'destroy')).toBeDefined();
  });
});
