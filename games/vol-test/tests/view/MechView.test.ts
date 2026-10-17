import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { MECH_ART } from '@/config/mechView';
import { JUGGERNAUT, MECH_IDS, VEHICLES } from '@/config/vehicles';
import { TRACK_LEFT } from '@/sim/chassis/parts';
import { gaitOf, MechView } from '@/view/MechView';
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

describe('gaitOf', () => {
  it('yerdeki ayak geriye sürülür, havadaki ayak ileri savrulur ve süreklidir', () => {
    const out = { x: 0, lift: 0 };
    gaitOf(0, 10, out);
    expect(out).toEqual({ x: 10, lift: 0 });
    gaitOf(0.25, 10, out);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.lift).toBe(0);
    gaitOf(0.5, 10, out);
    expect(out.x).toBeCloseTo(-10, 6);
    gaitOf(0.75, 10, out);
    expect(out.lift).toBeCloseTo(1, 6);
    expect(out.x).toBeCloseTo(0, 6);
    gaitOf(0.999999, 10, out);
    expect(out.x).toBeCloseTo(10, 3);
  });

  it('negatif faz da döngüye sarılır', () => {
    const a = { x: 0, lift: 0 };
    const b = { x: 0, lift: 0 };
    gaitOf(-0.3, 8, a);
    gaitOf(0.7, 8, b);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.lift).toBeCloseTo(b.lift, 9);
  });
});

describe('MechView', () => {
  it('her mech için kaynak parçalar atlas karesi olarak vardır', () => {
    for (const id of MECH_IDS) {
      expect(MECH_ART[id].foot.width, id).toBeGreaterThan(0);
      expect(mechFrame(id, 'arm')).toBe(`${id}/arm`);
      expect(VEHICLES[id].kind).toBe('mech');
    }
  });

  it('çizilir, ateşler, bacak kaybını ve enkazı işler, kapanışta nesneleri bırakır', () => {
    const scene = fakeScene();
    const lighting = scene.add.container(0, 0);
    const prints: number[] = [];
    const view = new MechView(
      scene as unknown as Phaser.Scene,
      JUGGERNAUT,
      lighting as never,
      (_x, _y, _angle, _length, width) => prints.push(width ?? 0),
    );
    for (let step = 0; step < 240; step++) {
      view.update(
        frame({ treadLeft: step * 2, treadRight: step * 2, speed: 90, vx: 90, boosting: false }),
        16.7,
      );
    }
    view.fire(0);
    view.fire(1);
    view.setParts(TRACK_LEFT);
    view.update(frame({ treadLeft: 500, treadRight: 500, speed: 40 }), 16.7);
    view.setWrecked(true);
    view.update(frame(), 16.7);
    view.setPresent(false);
    view.destroy();
    expect(prints.length).toBeGreaterThan(0);
    expect(prints.every((width) => width > 0)).toBe(true);
  });
});
