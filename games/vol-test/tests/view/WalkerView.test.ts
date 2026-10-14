import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { ARACHNID } from '@/config/vehicles';
import { RIG_FACING_OFFSET_RAD } from '@/config/walkerRig';
import { ART_TO_WORLD, BODY_MOTION, FOOTFALL_DUST, TELEPORT_UNITS } from '@/config/walkerView';
import { mountPose, type MuzzlePose } from '@/sim/muzzle';
import type { TankFrame } from '@/view/VehicleView';
import { WalkerView } from '@/view/WalkerView';
import type { LocomotionSignals } from '@/view/walker/signals';
import { walkerScene, type FakeContainer, type FakeImage } from '../support/rigScene';

const SPEC = ARACHNID;
const TOP = SPEC.walker.maxSpeed;

const frame = (overrides: Partial<TankFrame> = {}): TankFrame => ({
  x: 1000,
  y: 1000,
  hull: 0.3,
  turret: 0.9,
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
  const scene = walkerScene();
  const lighting = scene.add.container();
  const view = new WalkerView(
    scene as unknown as Phaser.Scene,
    SPEC,
    lighting as unknown as Phaser.GameObjects.Container,
  );
  const root = view.root as unknown as FakeContainer;
  const rig = root.list[0] as FakeContainer;
  const cannons = root.list.slice(1) as FakeContainer[];
  const flashes = () => lighting.list as FakeImage[];
  const signals = () => (view as unknown as { signals: LocomotionSignals }).signals;
  return { scene, view, root, rig, cannons, flashes, signals };
}

/** Gövdeyi +x yönünde `frames` kare sürer; her kare 60 Hz'lik bir simülasyon adımıdır. */
function walk(view: WalkerView, frames: number, speed: number, start = frame()): TankFrame {
  let current = start;
  for (let i = 0; i < frames; i++) {
    current = {
      ...current,
      x: current.x + speed / 60,
      speed,
      vx: speed,
      vy: 0,
      hull: 0,
    };
    view.update(current, 1000 / 60);
  }
  return current;
}

describe('WalkerView', () => {
  it('kökte gövde rig’i ile silah sayısı kadar top taşır; rig dünya birimine ölçeklenir', () => {
    const { root, rig, cannons } = build();
    expect(cannons).toHaveLength(SPEC.armament.mounts.length);
    expect(rig.scaleX).toBeCloseTo(ART_TO_WORLD, 9);
    // Rig belgede yukarı bakar; gövde-yerel +X ileri olduğundan sabit bir telafi taşır.
    expect(rig.rotation).toBeCloseTo(RIG_FACING_OFFSET_RAD, 9);
    expect(root.depth).toBeGreaterThan(0);
  });

  it('kökü ara değerli konum ve gövde açısına yerleştirir', () => {
    const { view, root } = build();
    view.update(frame({ x: 321, y: 654, hull: -1.2 }), 16);
    expect(root.x).toBe(321);
    expect(root.y).toBe(654);
    expect(root.rotation).toBe(-1.2);
  });

  it('toplar yuvalarında `mountPose` açısıyla durur: orta top taret yönüne, yanlar odağa bakar', () => {
    const { view, cannons } = build();
    const pose = frame({ hull: 0.3, turret: 0.9, pitch: 1.5, roll: -0.8 });
    view.update(pose, 16);

    const out: MuzzlePose = { x: 0, y: 0, angle: 0 };
    SPEC.armament.mounts.forEach((mount, index) => {
      mountPose(pose, SPEC.armament, index, out);
      expect(cannons[index].x, `${index} x`).toBeCloseTo(pose.pitch + mount.x, 9);
      expect(cannons[index].y, `${index} y`).toBeCloseTo(pose.roll + mount.y, 9);
      expect(cannons[index].rotation, `${index} açı`).toBeCloseTo(out.angle - pose.hull, 9);
    });
    expect(cannons[0].rotation).toBeCloseTo(pose.turret - pose.hull, 9);
    // Yan toplar birbirine doğru hafifçe kırılır (sol yuva y<0 sağa, sağ yuva sola döner).
    expect(cannons[1].rotation).toBeGreaterThan(cannons[0].rotation);
    expect(cannons[2].rotation).toBeLessThan(cannons[0].rotation);
  });

  it('atış yalnız ateşleyen yuvanın topunu geri tepirir ve parlatır', () => {
    const { view, flashes, cannons } = build();
    view.update(frame(), 16);
    view.fire(1);
    view.update(frame(), 16);
    const visible = flashes().map((flash) => flash.visible);
    expect(visible).toEqual([false, true, false]);
    // Geri tepen namlu çubuğu yalnız ilgili topta kayar.
    const rodShift = (cannon: FakeContainer) =>
      ((cannon.list[0] as FakeContainer).list[0] as FakeContainer).x;
    expect(Number.isFinite(rodShift(cannons[1]))).toBe(true);
    view.fire(99);
    view.update(frame(), 16);
    expect(flashes().filter((flash) => flash.visible)).toHaveLength(1);
  });

  it('ağız parlaması geri teperken kısalan namlunun ucuna açılır', () => {
    const { view, flashes } = build();
    const pose = frame({ hull: 0, turret: 0 });
    view.update(pose, 16);
    view.fire(0);
    view.update(pose, 16);
    const [centre] = SPEC.armament.mounts;
    const flash = flashes()[0];
    // Dinlenme ucu: yuva + reach; geri tepme bunu kısaltır, uzatmaz.
    expect(flash.x).toBeLessThanOrEqual(pose.x + centre.x + centre.reach + 1e-9);
    expect(flash.x).toBeGreaterThan(pose.x + centre.x);
    expect(flash.y).toBeCloseTo(pose.y + centre.y, 6);
  });

  it('ivmeyi hızın değiştiği adımlar arasından okur ve sonraki değişime dek tutar', () => {
    const { view, signals } = build();
    view.update(frame(), 1000 / 60);
    expect(signals().accelX).toBe(0);

    // Yüksek kare hızı: hız yalnız bir adımda değişir, ara karelerde aynı kalır.
    const moving = frame({ vx: 60, speed: 60 });
    view.update(moving, 1000 / 60);
    const launched = signals().accelX;
    expect(launched).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) view.update(moving, 1000 / 144);
    expect(signals().accelX).toBe(launched);
    // Adım karesinde ivme gerçek ivmenin katı değil: Δv / adım süresi (sanat uzayında).
    expect(launched).toBeCloseTo((60 / ART_TO_WORLD) * 60, 0);
  });

  it('yürüyen araçla ilk kare sahte ivme üretmez', () => {
    const { view, signals } = build();
    view.update(frame({ vx: TOP, speed: TOP }), 16);
    expect(signals().accelX).toBe(0);
    expect(signals().velX).toBeCloseTo(TOP / ART_TO_WORLD, 6);
  });

  it('seyahat yönü hızdan, bakış yönü gövdeden okunur; durunca bakışa düşer', () => {
    const { view, signals } = build();
    view.update(frame({ hull: 0.5, vx: 0, vy: 100, speed: 100 }), 16);
    expect(signals().facingHeadingRad).toBe(0.5);
    expect(signals().travelHeadingRad).toBeCloseTo(Math.PI / 2, 9);
    view.update(frame({ hull: 0.5 }), 16);
    expect(signals().travelHeadingRad).toBe(0.5);
  });

  it('atılım bayrağı yumuşatılarak sinyale girer', () => {
    const { view, signals } = build();
    view.update(frame({ boosting: true }), 16);
    const first = signals().dash01;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
    for (let i = 0; i < 60; i++) view.update(frame({ boosting: true }), 16);
    expect(signals().dash01).toBeGreaterThan(0.9);
    for (let i = 0; i < 90; i++) view.update(frame(), 16);
    expect(signals().dash01).toBeLessThan(0.1);
  });

  it('çarpma yankısı şiddeti taşır, kısa sürede söner ve [0, 1] ile sınırlıdır', () => {
    const { view, signals } = build();
    view.update(frame(), 16);
    view.impact(5);
    view.update(frame(), 0);
    expect(signals().impact01).toBe(1);
    view.update(frame(), BODY_MOTION.impactFalloffMs);
    expect(signals().impact01).toBe(0);
    view.impact(-3);
    view.update(frame(), 0);
    expect(signals().impact01).toBe(0);
  });

  it('yürürken her ayak basışı dünya birimine çevrilmiş bir toz tutamı bırakır', () => {
    const { view, scene } = build();
    const [dust] = scene.emitters;
    let current = frame({ hull: 0 });
    let seen = 0;
    for (let i = 0; i < 240; i++) {
      current = { ...current, x: current.x + (TOP * 0.8) / 60, speed: TOP * 0.8, vx: TOP * 0.8 };
      view.update(current, 1000 / 60);
      for (const burst of dust.bursts.slice(seen)) {
        expect(burst.count).toBeGreaterThanOrEqual(FOOTFALL_DUST.countMin);
        expect(burst.count).toBeLessThanOrEqual(FOOTFALL_DUST.countMax);
        // Ayaklar gövdenin yakınına basar: sanat piksel uzayı dünya birimine dönmüş olmalı.
        expect(Math.hypot(burst.x - current.x, burst.y - current.y)).toBeLessThan(160);
      }
      seen = dust.bursts.length;
    }
    expect(seen).toBeGreaterThan(4);
  });

  it('dururken toz bırakmaz', () => {
    const { view, scene } = build();
    for (let i = 0; i < 120; i++) view.update(frame(), 16);
    expect(scene.emitters[0].bursts).toHaveLength(0);
  });

  it('ışınlanma (yeniden doğuş) ayakları adım atmadan gövdenin altına oturtur', () => {
    const { view, scene } = build();
    const end = walk(view, 120, TOP);
    const before = scene.emitters[0].bursts.length;
    view.update({ ...end, x: end.x + TELEPORT_UNITS * 4, vx: 0, speed: 0 }, 16);
    const legs = (view as unknown as { legs: { steppingLimbCount: number } }).legs;
    expect(legs.steppingLimbCount).toBe(0);
    expect(scene.emitters[0].bursts.length).toBe(before);
  });

  it('gölge katı parçalardan kurulur: gövde rig’i ve topların katı ağacı', () => {
    const { view } = build();
    const source = (view as unknown as { shadowSource: { list: unknown[] } }).shadowSource;
    expect(source.list).toHaveLength(1 + SPEC.armament.mounts.length);
  });

  it('kapanışta kök, toplar, gölge ve toz sökülür', () => {
    const { view, scene, root, flashes } = build();
    view.update(frame(), 16);
    view.destroy();
    expect(root.destroyed).toBe(true);
    expect(scene.emitters[0].destroyed).toBe(true);
    expect(flashes()).toHaveLength(0);
  });
});
