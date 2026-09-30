import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { Projectiles } from '@/sim/combat/Projectiles';
import { EffectsView } from '@/view/EffectsView';
import { TEXTURE } from '@/view/textures';
import { fakeScene, lastCall } from '../support/fakeScene';

function build() {
  const scene = fakeScene();
  const view = new EffectsView(scene as unknown as Phaser.Scene);
  const [sparks, smoke, exhaust, dust] = scene.created.filter((o) => o.kind === 'particles');
  const tracers = scene.created.find((object) => object.kind === 'graphics')!;
  const marks = () => scene.created.filter((object) => object.args[2] === TEXTURE.mark);
  return { view, sparks: sparks, smoke: smoke, exhaust: exhaust, dust: dust, tracers, marks };
}

describe('EffectsView', () => {
  it('her mermi için parıltı ve çekirdek çizgisi çizer', () => {
    const { view, tracers } = build();
    const projectiles = new Projectiles(8, 1000);
    projectiles.spawn(0, 0, 100, 0);
    projectiles.spawn(10, 10, 0, 100);
    projectiles.spawn(20, 20, 0, 0);
    view.update(projectiles, 0.5, 16);
    expect(tracers.calls.filter(([name]) => name === 'lineBetween')).toHaveLength(6);
  });

  it('isabet, namlu ve duvar çarpması parçacık patlatır; şiddet ölçeklenir', () => {
    const { view, sparks, smoke } = build();
    view.impact(5, 6, 0);
    expect(lastCall(sparks, 'explode')).toEqual([10, 5, 6]);
    view.muzzle(1, 2, 0);
    expect(lastCall(smoke, 'explode')).toEqual([7, 1, 2]);
    view.wallHit(0, 0, 1, 0, 0);
    const light = (lastCall(sparks, 'explode') as number[])[0];
    view.wallHit(0, 0, 1, 0, 1);
    const heavy = (lastCall(sparks, 'explode') as number[])[0];
    expect(heavy).toBeGreaterThan(light);
  });

  it('egzoz yalnız hızlanmada, toz hızda ya da patinajda akar', () => {
    const { view, exhaust, dust } = build();
    view.updateEmitters(0, 0, 0, 200, true, false);
    expect(exhaust.emitting).toBe(true);
    expect(dust.emitting).toBe(true);
    view.updateEmitters(0, 0, 0, 20, false, false);
    expect(exhaust.emitting).toBe(false);
    expect(dust.emitting).toBe(false);
    view.updateEmitters(0, 0, 0, 0, false, true);
    expect(dust.emitting).toBe(true);
  });

  it('iz yer yoluyla bırakılır, oyun paletiyle boyanır, havuz dolunca yeniden kullanılır', () => {
    const { view, marks } = build();
    view.updateTreadMarks(0, 0, 0, FX.marks.spacing / 2, FX.marks.spacing / 2, 15);
    expect(marks()).toHaveLength(0);
    for (let distance = 10; distance < 10 * 400; distance += 10) {
      view.updateTreadMarks(distance, 0, 0, distance, distance, 15);
    }
    expect(marks()).toHaveLength(FX.marks.capacity);
    expect(lastCall(marks()[0], 'setTint')).toEqual([PALETTE.treadMark]);
  });

  it('izler zamanla söner, yok edilince kaldırılır', () => {
    const { view, marks } = build();
    view.updateTreadMarks(0, 0, 0, 20, 20, 15);
    const mark = marks()[0];
    view.update(new Projectiles(1, 1), 0, FX.marks.lifeMs / 2);
    expect(mark.alpha).toBeGreaterThan(0);
    view.update(new Projectiles(1, 1), 0, FX.marks.lifeMs);
    expect(mark.alpha).toBe(0);
    view.destroy();
    expect(lastCall(mark, 'destroy')).toBeDefined();
  });
});
