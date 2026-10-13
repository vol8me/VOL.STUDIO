import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { TANK_ART, TANK_LIGHTS, tankSpecs } from '@/config/tankView';
import { BULWARK, DART, STRIKER, type TankSpec } from '@/config/vehicles';
import { muzzlePose } from '@/sim/muzzle';
import { TankView, type TankFrame } from '@/view/TankView';
import { TEXTURE, TEXTURE_SCALE, tankTexture, treadBandTexture } from '@/view/textures';
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

function build(spec: TankSpec = STRIKER) {
  const scene = fakeScene();
  const view = new TankView(scene as unknown as Phaser.Scene, spec);
  const byTexture = (key: string) => scene.created.filter((object) => object.args.includes(key));
  const containers = scene.created.filter((object) => object.kind === 'container');
  const [turretRig, body, root] = containers.slice(-3);
  return { scene, view, byTexture, turretRig: turretRig, body: body, root: root };
}

describe.each(tankSpecs().map((spec) => [spec.id, spec] as const))('TankView (%s)', (_id, spec) => {
  const hull = tankTexture(spec.id, 'hull');
  const turretKey = tankTexture(spec.id, 'turret');
  const feelerKey = tankTexture(spec.id, 'feeler');
  const reach = spec.armament.mounts[0].reach;

  it('ışıklar gövde ötelemesini ve bağımsız taretin dünya yönünü izler', () => {
    const { view, byTexture, body, turretRig } = build(spec);
    view.fire();
    view.update(frame({ hull: Math.PI / 2, turret: 0, pitch: 2, roll: 3 }), 0);
    const core = byTexture(TEXTURE.core)[0];
    const flash = byTexture(TEXTURE.flash)[0];
    const children = body.list as unknown[];
    expect(children).toContain(core);
    expect(children).toContain(turretRig);
    expect(children.indexOf(byTexture(hull)[0])).toBeLessThan(children.indexOf(core));
    expect(children.indexOf(core)).toBeLessThan(children.indexOf(turretRig));
    expect(flash.x).toBeCloseTo(97 + reach);
    expect(flash.y).toBeCloseTo(202);
    expect(flash.rotation).toBeCloseTo(0);
  });

  it('ağız parlaması ile sahne zincirindeki namlu ucu ortak geometriyle çakışır (eğik poz dahil)', () => {
    const poses: Array<Partial<TankFrame>> = [
      { hull: 0.5, turret: 1.2, pitch: 2.5, roll: -3 },
      { hull: -2.4, turret: 0.7, pitch: -3.6, roll: 1.4 },
      { hull: 3, turret: -3, pitch: 0, roll: 3.6 },
    ];
    for (const pose of poses) {
      const { view, byTexture, body, root, turretRig } = build(spec);
      view.fire();
      const state = frame(pose);
      view.update(state, 0);
      const turret = byTexture(turretKey)[0];
      // Sahne zinciri: kök (poz, gövde yönü) → gövde (süspansiyon) → taret kabı (dönüş) → resim.
      const local = { x: Number(turret.x ?? 0) + reach, y: 0 };
      const rotated = (point: { x: number; y: number }, angle: number) => ({
        x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
        y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
      });
      const inRig = rotated(local, Number(turretRig.rotation));
      const inBody = { x: Number(body.x) + inRig.x, y: Number(body.y) + inRig.y };
      const world = rotated(inBody, Number(root.rotation));
      const tip = muzzlePose(state, spec.armament, 0, { x: 0, y: 0, angle: 0 });
      expect(Number(root.x) + world.x).toBeCloseTo(tip.x, 6);
      expect(Number(root.y) + world.y).toBeCloseTo(tip.y, 6);
      const flash = byTexture(TEXTURE.flash)[0];
      expect(flash.x).toBeCloseTo(tip.x, 6);
      expect(flash.y).toBeCloseTo(tip.y, 6);
      expect(flash.rotation).toBeCloseTo(tip.angle, 9);
    }
  });

  it('palet geometrisi aracın fizik ayarından türer', () => {
    const { byTexture } = build(spec);
    const { trackOffset, halfWidth, halfLength } = spec.tank;
    const treads = byTexture(treadBandTexture(spec.id));
    expect(treads).toHaveLength(2);
    expect(treads.map((tread) => tread.args[1])).toEqual([-trackOffset, trackOffset]);
    const ends = byTexture(TEXTURE.treadEnd);
    expect(ends).toHaveLength(4);
    const outer = Math.max(...ends.map((end) => Math.abs(end.args[0] as number)));
    const radius = halfWidth - trackOffset;
    expect(outer + radius).toBeCloseTo(halfLength);
    expect(byTexture(hull)[0].scale).toBe(1 / TEXTURE_SCALE);
  });

  it('gövde ve taret resimleri sanat tablosunun ölçüsünde yerleşir', () => {
    const { byTexture } = build(spec);
    const art = TANK_ART[spec.id];
    expect(lastCall(byTexture(turretKey)[0], 'setOrigin')).toEqual([
      art.turret.pivotX / art.turret.width,
      0.5,
    ]);
    const feelers = byTexture(feelerKey);
    expect(feelers).toHaveLength(2);
    expect(feelers.map((feeler) => feeler.args[0])).toEqual([
      art.feeler.anchorX,
      art.feeler.anchorX,
    ]);
    expect(feelers.map((feeler) => feeler.args[1])).toEqual([
      -art.feeler.anchorY,
      art.feeler.anchorY,
    ]);
  });

  it('paletler yüzey yoluyla akar, uç halkaları aynı yolla döner', () => {
    const { view, byTexture, root } = build(spec);
    view.update(frame({ treadLeft: 10, treadRight: -5 }), 16);
    expect(lastCall(root, 'setPosition')).toEqual([100, 200]);
    expect(root.rotation).toBe(0.5);
    const [left, right] = byTexture(treadBandTexture(spec.id));
    expect(left.frame).toBe(8);
    expect(right.frame).toBe(12);
    const ends = byTexture(TEXTURE.treadEnd);
    const radius = spec.tank.halfWidth - spec.tank.trackOffset;
    expect(ends[0].rotation).toBeCloseTo(10 / radius);
    expect(ends[3].rotation).toBeCloseTo(-5 / radius);
  });

  it('gövde süspansiyonla paletlerin üstünde kayar, paletler yerinde kalır', () => {
    const { view, body, byTexture } = build(spec);
    view.update(frame({ pitch: -2, roll: 1.5 }), 16);
    expect(lastCall(body, 'setPosition')).toEqual([-2, 1.5]);
    expect(byTexture(treadBandTexture(spec.id))[0].args[0]).toBe(0);
  });

  it('taret gövdeden bağımsız döner', () => {
    const { view, turretRig } = build(spec);
    view.update(frame({ hull: 0.5, turret: 1.2 }), 16);
    expect(turretRig.rotation).toBeCloseTo(0.7);
    view.update(frame({ hull: 2, turret: 1.2 }), 16);
    expect(turretRig.rotation).toBeCloseTo(-0.8);
  });

  it('atışta namlu aracın yayıyla geri teper ve sınırını aşmaz; parlama kısa sürer', () => {
    const { view, byTexture } = build(spec);
    const flash = byTexture(TEXTURE.flash)[0];
    const turret = byTexture(turretKey)[0];
    const max = TANK_ART[spec.id].barrel.max;
    view.fire();
    expect(flash.visible).toBe(true);
    let deepest = 0;
    for (let step = 0; step < 6; step++) {
      view.update(frame(), 16);
      deepest = Math.min(deepest, turret.x as number);
    }
    expect(deepest).toBeLessThan(-1);
    expect(deepest).toBeGreaterThanOrEqual(-max);
    for (let step = 0; step < 60; step++) view.update(frame(), 16);
    expect(flash.visible).toBe(false);
    expect(Math.abs(turret.x as number)).toBeLessThan(0.05);
  });

  it('çekirdek hızlanmada büyür, duyargalar dönüşe savrulur', () => {
    const calm = build(spec);
    const boosted = build(spec);
    calm.view.update(frame(), 16);
    boosted.view.update(frame({ boosting: true, speed: spec.tank.maxSpeed }), 16);
    const coreScale = (b: ReturnType<typeof build>) => b.byTexture(TEXTURE.core)[0].scale as number;
    expect(coreScale(boosted)).toBeGreaterThan(coreScale(calm));
    const turning = build(spec);
    const feeler = () => turning.byTexture(feelerKey)[0].rotation as number;
    turning.view.update(frame(), 16);
    const rest = feeler();
    for (let step = 0; step < 20; step++) turning.view.update(frame({ angularVelocity: 3 }), 16);
    expect(feeler()).not.toBeCloseTo(rest, 2);
  });

  it('gölge CORE PoseShadow ile katı parçaların pozundan üretilir; ışık kaynakları gölge vermez', () => {
    const scene = fakeScene();
    const view = new TankView(scene as unknown as Phaser.Scene, spec);
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
    expect(keys).toContain(hull);
  });

  it('yok edilince kök kaldırılır', () => {
    const { view, root } = build(spec);
    view.destroy();
    expect(lastCall(root, 'destroy')).toBeDefined();
  });
});

describe('TankView araçlar arası ayrım', () => {
  it('her araç yalnız kendi gövde, taret ve duyarga dokusunu kurar', () => {
    for (const spec of tankSpecs()) {
      const { scene } = build(spec);
      const keys = new Set(scene.created.map((object) => object.args[2]));
      for (const other of tankSpecs()) {
        for (const part of ['hull', 'turret', 'feeler'] as const)
          expect(keys.has(tankTexture(other.id, part))).toBe(other.id === spec.id);
      }
    }
  });

  it('ağır araçta çekirdek ve ağız parlaması büyük, hafifte küçüktür; geri tepme sırası silah ağırlığını izler', () => {
    const scale = (spec: TankSpec, key: string) => {
      const { view, byTexture } = build(spec);
      view.fire();
      view.update(frame(), 0);
      return byTexture(key)[0].scale as number;
    };
    expect(scale(BULWARK, TEXTURE.core)).toBeGreaterThan(scale(STRIKER, TEXTURE.core));
    expect(scale(STRIKER, TEXTURE.core)).toBeGreaterThan(scale(DART, TEXTURE.core));
    const kicks = [DART, STRIKER, BULWARK].map((spec) => Math.abs(TANK_ART[spec.id].barrel.kick));
    expect(kicks).toEqual([...kicks].sort((a, b) => a - b));
    expect(TANK_LIGHTS.flashMs).toBeGreaterThan(0);
  });

  it('ağız parlaması ölçeği aracın sanat tablosundan gelir', () => {
    const flashScale = (spec: TankSpec) => {
      const { view, byTexture } = build(spec);
      view.fire();
      return byTexture(TEXTURE.flash)[0].scale as number;
    };
    const base = (spec: TankSpec) => TANK_ART[spec.id].flashScale / TEXTURE_SCALE;
    for (const spec of tankSpecs()) {
      expect(flashScale(spec)).toBeGreaterThanOrEqual(base(spec) * 0.85 - 1e-9);
      expect(flashScale(spec)).toBeLessThanOrEqual(base(spec) * 1.2 + 1e-9);
    }
  });
});
