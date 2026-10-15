import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { HOVER_ART, HOVER_VIEW } from '@/config/hoverView';
import { BARRACUDA, LEVIATHAN, MANTA, type HoverSpec } from '@/config/vehicles';
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

  it('reaktör çekirdeği pencerede atar ve atılımla büyür; duyargalar kanat uçlarında dönüşe savrulur', () => {
    const sensors = art.sensors;
    const calm = build();
    const boosted = build();
    calm.view.update(frame(), 16);
    boosted.view.update(frame({ boosting: true, speed: 300 }), 16);
    const core = (b: ReturnType<typeof build>) => b.byTexture(TEXTURE.core)[0];
    expect(core(calm).x).toBe(sensors.core.x);
    expect(core(calm).y).toBe(sensors.core.y);
    expect(core(boosted).scale as number).toBeGreaterThan(core(calm).scale as number);
    // Çekirdek ve duyargalar gövde kapsayıcısındadır: yatış ve nefes onları da taşır; taret üsttedir.
    expect(calm.body.list).toContain(core(calm));
    const stalksOf = (b: ReturnType<typeof build>) =>
      (b.body.list as FakeObject[]).filter((child) => child.args[2] === TEXTURE.antenna);
    const stalks = stalksOf(calm);
    expect(stalks).toHaveLength(2);
    expect(stalks.map((stalk) => stalk.y)).toEqual([
      -sensors.feelers.anchorY,
      sensors.feelers.anchorY,
    ]);
    const list = calm.body.list as unknown[];
    expect(list.indexOf(stalks[0])).toBeLessThan(list.indexOf(calm.turretRig));

    const turning = build();
    turning.view.update(frame(), 16);
    const rest = stalksOf(turning)[1].rotation as number;
    for (let step = 0; step < 20; step++) turning.view.update(frame({ angularVelocity: 3 }), 16);
    expect(stalksOf(turning)[1].rotation as number).not.toBeCloseTo(rest, 2);
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

  it('dönerken gövde dönüşün tersine yatar ve sınırlanır; taret dünya açısını korur', () => {
    const { view, body, turretRig } = build();
    for (let step = 0; step < 90; step++) view.update(frame({ angularVelocity: 9 }), 16);
    const [bank] = lastCall(body, 'setRotation') as [number];
    expect(bank).toBeLessThan(-0.05);
    expect(bank).toBeGreaterThanOrEqual(-HOVER_VIEW.bank.max * 1.35);
    const [turret] = lastCall(turretRig, 'setRotation') as [number];
    expect(turret + bank).toBeCloseTo(1.2 - 0.5, 6);
    for (let step = 0; step < 240; step++) view.update(frame({ angularVelocity: 0 }), 16);
    expect(Math.abs((lastCall(body, 'setRotation') as [number])[0])).toBeLessThan(0.005);
  });

  it('hızlı süzülürken iki iticiden toz ve enerji kıvılcımı çıkar; yavaşken ve kırıkta çıkmaz', () => {
    const emitters = (scene: ReturnType<typeof build>['scene']) =>
      scene.created.filter((object) => object.kind === 'particles');
    const count = (emitter: FakeObject) =>
      emitter.calls.filter(([name]) => name === 'emitParticleAt').length;

    const slow = build();
    slow.view.update(frame({ speed: 5 }), 16);
    expect(emitters(slow.scene).reduce((sum, emitter) => sum + count(emitter), 0)).toBe(0);

    const fast = build();
    for (let step = 0; step < 30; step++) fast.view.update(frame({ speed: 220 }), 16);
    const [dust, glow] = emitters(fast.scene);
    expect(count(glow)).toBe(60);
    expect(count(dust)).toBeGreaterThan(0);

    const broken = build();
    broken.view.setParts(TRACK_LEFT | TRACK_RIGHT);
    for (let step = 0; step < 10; step++) broken.view.update(frame({ speed: 220 }), 16);
    expect(emitters(broken.scene).reduce((sum, emitter) => sum + count(emitter), 0)).toBe(0);
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

  it('kapanışta kökü, parlamayı ve parçacıkları söker', () => {
    const { view, root, byTexture, scene } = build();
    view.destroy();
    expect(root.calls.some(([name]) => name === 'destroy')).toBe(true);
    expect(byTexture(TEXTURE.flash)[0].calls.some(([name]) => name === 'destroy')).toBe(true);
    const particles = scene.created.filter((object) => object.kind === 'particles');
    expect(particles).toHaveLength(2);
    expect(particles.every((emitter) => emitter.calls.some(([name]) => name === 'destroy'))).toBe(
      true,
    );
  });
});

describe('HoverView (çok yuvalı araçlar)', () => {
  function buildOf(spec: HoverSpec) {
    const scene = fakeScene();
    const lighting = scene.add.container(0, 0);
    const view = new HoverView(scene as unknown as Phaser.Scene, spec, lighting as never);
    const byTexture = (key: string) => scene.created.filter((object) => object.args.includes(key));
    return { view, byTexture };
  }

  it('Leviathan her yuvaya ayrı yan top ve ayrı ağız parlaması koyar; namlu ucu sim ile çakışır', () => {
    const { view, byTexture } = buildOf(LEVIATHAN);
    expect(byTexture(hoverFrame('leviathan', 'gun'))).toHaveLength(2);
    const flashes = byTexture(TEXTURE.flash);
    expect(flashes).toHaveLength(2);
    const pose = frame({ hull: 0.4, turret: -0.8, pitch: 1.5, roll: -2 });
    view.update(pose, 16);
    flashes.forEach((flash, index) => {
      const tip = muzzlePose(pose, LEVIATHAN.armament, index, { x: 0, y: 0, angle: 0 });
      expect(flash.x).toBeCloseTo(tip.x, 6);
      expect(flash.y).toBeCloseTo(tip.y, 6);
      expect(flash.rotation).toBeCloseTo(tip.angle, 9);
    });
  });

  it('atış yalnız ateşleyen yuvanın parlamasını yakar', () => {
    const { view, byTexture } = buildOf(LEVIATHAN);
    const [first, second] = byTexture(TEXTURE.flash);
    view.fire(1);
    expect(first.visible).toBe(false);
    expect(second.visible).toBe(true);
    view.update(frame(), HOVER_VIEW.flashMs + 1);
    expect(second.visible).toBe(false);
  });

  it('Barracuda üç yuvalı tek taretlidir: yan top yok, üç parlama', () => {
    const { byTexture } = buildOf(BARRACUDA);
    expect(byTexture(TEXTURE.flash)).toHaveLength(BARRACUDA.armament.mounts.length);
    expect(byTexture(hoverFrame('barracuda', 'turret'))).toHaveLength(1);
  });
});
