import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { LEAPER_ART } from '@/config/leaperView';
import { JACKAL, LEAPER_IDS, PANTHER, RHINO, VEHICLES } from '@/config/vehicles';
import { legBit } from '@/sim/chassis/parts';
import { LeaperView } from '@/view/LeaperView';
import { mechFrame } from '@/view/textures';
import type { TankFrame } from '@/view/VehicleView';
import { fakeScene } from '../support/fakeScene';

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

describe('LeaperView', () => {
  it('her sıçrayıcı için parçalar atlas karesi olarak ve sanat ölçüleri tutarlı vardır', () => {
    for (const id of LEAPER_IDS) {
      const art = LEAPER_ART[id];
      expect(mechFrame(id, 'hull')).toBe(`${id}/hull`);
      expect(VEHICLES[id].kind).toBe('leaper');
      // Kalçalar gövdenin içindedir ve ön çift arka çiftin önündedir.
      expect(art.hips.front, id).toBeGreaterThan(art.hips.rear);
      expect(Math.abs(art.hips.front), id).toBeLessThan(art.hull.width / 2);
      // Namlu ucu (mil + uzanım) silah resminin boyuna eşittir: çizilen namlu atışın çıktığı yerdir.
      const mounts = VEHICLES[id].armament.mounts;
      for (const mount of mounts)
        expect(art.arm.pivotX + mount.reach, id).toBeCloseTo(art.arm.width, 0);
    }
  });

  it('çizilir, sıçrar, iner, ateşler, bacak kaybını ve enkazı işler; kapanışta nesneleri bırakır', () => {
    const scene = fakeScene();
    const lighting = scene.add.container(0, 0);
    const prints: number[] = [];
    const view = new LeaperView(
      scene as unknown as Phaser.Scene,
      RHINO,
      lighting as never,
      (_x, _y, _angle, scale) => prints.push(scale),
    );
    for (let step = 0; step < 120; step++) {
      view.update(frame({ treadLeft: step * 2, treadRight: step * 2, speed: 90, vx: 90 }), 16.7);
    }
    // Sıçrama: kalkış, havada, iniş.
    for (let step = 0; step < 30; step++) {
      view.update(
        frame({
          treadLeft: 300 + step * 9,
          treadRight: 300 + step * 9,
          speed: 260,
          boosting: true,
        }),
        16.7,
      );
    }
    const printsBeforeLanding = prints.length;
    view.update(frame({ treadLeft: 600, treadRight: 600, speed: 120 }), 16.7);
    // İniş dört pençe izi bırakır.
    expect(prints.length - printsBeforeLanding).toBeGreaterThanOrEqual(4);
    view.fire(0);
    view.fire(1);
    view.impact(0.6);
    view.setParts(legBit(0, 0) | legBit(1, 1));
    view.update(frame({ treadLeft: 700, treadRight: 700, speed: 40 }), 16.7);
    view.setWrecked(true);
    view.update(frame(), 16.7);
    view.setPresent(false);
    view.destroy();
    expect(prints.length).toBeGreaterThan(0);
    expect(prints.every((scale) => scale > 0)).toBe(true);
  });

  it('dönüşte gövde dönüşün dışına kayar ve geriden gelir; dönüş bitince yay sallanıp yatışır', () => {
    const scene = fakeScene();
    const view = new LeaperView(
      scene as unknown as Phaser.Scene,
      RHINO,
      scene.add.container(0, 0) as never,
    );
    const list = view.root.list as unknown as Array<{ x: number; y: number; rotation: number }>;
    const body = list[list.length - 1];
    const max = RHINO.leaper.maxTurnRate;
    const run = { speed: RHINO.leaper.maxSpeed, vx: RHINO.leaper.maxSpeed };
    // Adım fazı sabit tutulur: yalnız dönüş yükü gövdeyi oynatır (sekme salınımı karışmaz).
    const tread = 30;
    const tick = (omega: number): void => {
      view.update(
        frame({ treadLeft: tread, treadRight: tread, angularVelocity: omega, ...run }),
        16.7,
      );
    };
    for (let step = 0; step < 90; step++) tick(0);
    const straight = body.y;
    // Sağa (artı açısal hız) tam dönüş: gövde sola (eksi y) kayar, yönü hizadan geri kalır (eksi).
    for (let step = 0; step < 60; step++) tick(max);
    expect(body.y).toBeLessThan(straight - 1);
    expect(body.rotation).toBeLessThan(-0.05);
    // Sola dönüş aynadır.
    for (let step = 0; step < 60; step++) tick(-max);
    expect(body.y).toBeGreaterThan(straight + 1);
    expect(body.rotation).toBeGreaterThan(0.05);
    // Dönüş bitince yay aşıp yatışır: yeniden düzleşir.
    for (let step = 0; step < 240; step++) tick(0);
    expect(Math.abs(body.y - straight)).toBeLessThan(0.8);
    expect(Math.abs(body.rotation)).toBeLessThan(0.03);
  });

  it('kafa nişana bakar ve sınırı aşmaz; kuyruk dönüşün dışına savrulur, sıçramada düz uzanır', () => {
    const scene = fakeScene();
    const view = new LeaperView(
      scene as unknown as Phaser.Scene,
      JACKAL,
      scene.add.container(0, 0) as never,
    );
    const list = view.root.list as unknown as Array<{ list?: Array<Record<string, unknown>> }>;
    const body = list[list.length - 1];
    const part = (name: string) =>
      body.list!.find(
        (object) => object.args && (object.args as unknown[])[3] === `jackal/${name}`,
      )!;
    const head = part('head') as unknown as { rotation: number };
    const tail = part('tail') as unknown as { rotation: number };
    const art = LEAPER_ART.jackal;
    const run = { speed: JACKAL.leaper.maxSpeed, vx: JACKAL.leaper.maxSpeed };
    // Hafif nişan sapması: kafa `follow` oranında bakar.
    for (let step = 0; step < 90; step++)
      view.update(frame({ hull: 0, turret: 0.4, treadLeft: 30, treadRight: 30 }), 16.7);
    expect(head.rotation).toBeCloseTo(0.4 * art.head.follow, 1);
    // Ters yöne tam sapma: kafa `yaw` sınırında kalır.
    for (let step = 0; step < 90; step++)
      view.update(frame({ hull: 0, turret: -2.4, treadLeft: 30, treadRight: 30 }), 16.7);
    expect(head.rotation).toBeCloseTo(-art.head.yaw, 1);
    // Sağa dönüş: kuyruk arkaya doğru (π) ve dönüşün dışına, yani artı yana savrulur.
    for (let step = 0; step < 90; step++)
      view.update(
        frame({
          angularVelocity: JACKAL.leaper.maxTurnRate,
          treadLeft: 30,
          treadRight: 30,
          ...run,
        }),
        16.7,
      );
    expect(tail.rotation).toBeGreaterThan(Math.PI + 0.05);
    expect(tail.rotation).toBeLessThanOrEqual(Math.PI + art.tail.swing + 1e-6);
    // Sıçrama: kuyruk dümdüz geriye uzanır.
    for (let step = 0; step < 40; step++)
      view.update(frame({ boosting: true, treadLeft: 30, treadRight: 30, ...run }), 16.7);
    expect(Math.abs(tail.rotation - Math.PI)).toBeLessThan(0.08);
  });

  it('omuz silahlı sıçrayıcıda kafa silahların üstünde, sırt raylıda altındadır', () => {
    const order = (spec: typeof JACKAL) => {
      const scene = fakeScene();
      const view = new LeaperView(
        scene as unknown as Phaser.Scene,
        spec,
        scene.add.container(0, 0) as never,
      );
      const list = view.root.list as unknown as Array<{ list?: Array<{ args?: unknown[] }> }>;
      const names = list[list.length - 1].list!.map((object) => String(object.args?.[3]));
      return {
        head: names.indexOf(`${spec.id}/head`),
        arm: names.indexOf(`${spec.id}/arm`),
      };
    };
    const jackal = order(JACKAL);
    expect(jackal.head).toBeGreaterThan(jackal.arm);
    const panther = order(PANTHER);
    expect(panther.head).toBeLessThan(panther.arm);
    expect(LEAPER_ART.jackal.head.over).toBe(true);
    expect(LEAPER_ART.panther.head.over).toBe(false);
  });
});
