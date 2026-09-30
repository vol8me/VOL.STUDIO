import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { Projectiles } from '@/sim/combat/Projectiles';
import { EffectsView, type VehicleFxFrame } from '@/view/EffectsView';
import { TEXTURE } from '@/view/textures';
import { fakeScene, lastCall } from '../support/fakeScene';

function build() {
  const scene = fakeScene();
  const view = new EffectsView(scene as unknown as Phaser.Scene);
  const particles = () => scene.created.filter((object) => object.kind === 'particles');
  const tracers = scene.created.find((object) => object.kind === 'graphics')!;
  const marks = () => scene.created.filter((object) => object.args[2] === TEXTURE.mark);
  const skids = () => scene.created.filter((object) => object.args[2] === TEXTURE.skid);
  return { view, scene, particles, tracers, marks, skids };
}

const frame = (overrides: Partial<VehicleFxFrame> = {}): VehicleFxFrame => ({
  x: 0,
  y: 0,
  hull: 0,
  speed: 0,
  boosting: false,
  slipping: false,
  groundLeft: 0,
  groundRight: 0,
  slideLeft: 0,
  slideRight: 0,
  trackOffset: 15,
  ...overrides,
});

describe('EffectsView', () => {
  it('her mermi için parıltı ve çekirdek çizgisi çizer', () => {
    const { view, tracers } = build();
    const projectiles = new Projectiles(8, 1000);
    projectiles.spawn(1, 0, 0, 100, 0);
    projectiles.spawn(1, 10, 10, 0, 100);
    projectiles.spawn(2, 20, 20, 0, 0);
    view.update(projectiles, 0.5, 16);
    expect(tracers.calls.filter(([name]) => name === 'lineBetween')).toHaveLength(6);
  });

  it('isabet, namlu ve duvar çarpması paylaşılan parçacıkları patlatır; şiddet ölçeklenir', () => {
    const { view, particles } = build();
    const [sparks, smoke] = particles();
    view.impact(5, 6, 0);
    expect(lastCall(sparks, 'explode')).toEqual([10, 5, 6]);
    view.muzzle(1, 2, 0);
    expect(lastCall(smoke, 'explode')).toEqual([7, 1, 2]);
    view.wallHit(0, 0, 1, 0, 0);
    const light = (lastCall(sparks, 'explode') as number[])[0];
    view.wallHit(0, 0, 1, 0, 1);
    expect((lastCall(sparks, 'explode') as number[])[0]).toBeGreaterThan(light);
  });

  it('her araç kendi egzoz ve tozunu taşır; egzoz hızlanmada, toz hızda ya da patinajda', () => {
    const { view, particles } = build();
    view.updateVehicle(1, frame({ speed: 200, boosting: true }));
    view.updateVehicle(2, frame());
    const [, , exhaustA, dustA, exhaustB, dustB] = particles();
    expect(exhaustA.emitting).toBe(true);
    expect(dustA.emitting).toBe(true);
    expect(exhaustB.emitting).toBe(false);
    expect(dustB.emitting).toBe(false);
    view.updateVehicle(2, frame({ slipping: true }));
    expect(dustB.emitting).toBe(true);
    view.removeVehicle(2);
    expect(lastCall(dustB, 'destroy')).toBeDefined();
    view.updateVehicle(1, frame());
    expect(particles()).toHaveLength(6);
  });

  it('palet izi araç başına yer yoluyla bırakılır ve oyun paletiyle boyanır', () => {
    const { view, marks } = build();
    view.updateVehicle(1, frame({ groundLeft: FX.marks.spacing / 2, groundRight: 0 }));
    expect(marks()).toHaveLength(0);
    view.updateVehicle(
      1,
      frame({ groundLeft: FX.marks.spacing * 2, groundRight: FX.marks.spacing * 2 }),
    );
    view.updateVehicle(2, frame({ groundLeft: 0, groundRight: 0 }));
    expect(marks()).toHaveLength(2);
    expect(lastCall(marks()[0], 'setTint')).toEqual([PALETTE.treadMark]);
  });

  it('kayan palet sürekli kayma çizgisi bırakır; tutunan palet çizgiyi keser', () => {
    const { view, skids } = build();
    const slide = FX.skid.fullSlide;
    view.updateVehicle(1, frame({ x: 0, slideLeft: slide }));
    expect(skids()).toHaveLength(0);
    view.updateVehicle(1, frame({ x: FX.skid.segment * 2, slideLeft: slide }));
    expect(skids()).toHaveLength(1);
    const [segment] = skids();
    expect(lastCall(segment, 'setTint')).toEqual([PALETTE.skidMark]);
    expect(lastCall(segment, 'setDisplaySize')).toEqual([
      FX.skid.segment * 2 + FX.skid.overlap,
      FX.skid.width,
    ]);
    expect(segment.rotation).toBeCloseTo(0);
    expect(segment.alpha).toBeCloseTo(FX.skid.alpha);
    // Tutunan palet çizgiyi keser; yeniden kayınca yeni çizgi o noktadan başlar.
    view.updateVehicle(1, frame({ x: 100 }));
    view.updateVehicle(1, frame({ x: 100 + FX.skid.segment / 2, slideLeft: slide }));
    view.updateVehicle(1, frame({ x: 100 + FX.skid.segment * 2, slideLeft: slide }));
    expect(skids()).toHaveLength(2);
    expect(skids()[1].x).toBeCloseTo(100 + FX.skid.segment * 1.25);
  });

  it('yanal kaymada çizgi temas noktasının yolunu izler; şiddet koyuluğu ölçekler', () => {
    const { view, skids } = build();
    const light = FX.skid.minSlide + 1;
    view.updateVehicle(1, frame({ y: 0, slideRight: light }));
    view.updateVehicle(1, frame({ y: 20, slideRight: light }));
    const [segment] = skids();
    expect(segment.rotation).toBeCloseTo(Math.PI / 2);
    expect(segment.alpha).toBeCloseTo(FX.skid.alpha * FX.skid.minStrength);
  });

  it('kayan palet desenli iz basmaz; kayma izleri uzun yaşar ve söner', () => {
    const { view, marks, skids } = build();
    const slide = FX.skid.fullSlide;
    view.updateVehicle(1, frame({ slideLeft: slide, slideRight: slide }));
    view.updateVehicle(
      1,
      frame({
        x: 30,
        groundLeft: FX.marks.spacing * 2,
        groundRight: FX.marks.spacing * 2,
        slideLeft: slide,
        slideRight: slide,
      }),
    );
    expect(marks()).toHaveLength(0);
    expect(skids()).toHaveLength(2);
    const segment = skids()[0];
    view.update(new Projectiles(1, 1), 0, FX.skid.lifeMs * FX.skid.holdShare * 0.9);
    expect(segment.alpha).toBeCloseTo(FX.skid.alpha);
    view.update(new Projectiles(1, 1), 0, FX.skid.lifeMs);
    expect(segment.alpha).toBe(0);
    view.removeVehicle(1);
    view.destroy();
    expect(lastCall(segment, 'destroy')).toBeDefined();
  });

  it('iz havuzu dolunca en eski iz yeniden kullanılır; izler zamanla söner', () => {
    const { view, marks } = build();
    for (let distance = 10; distance < 10 * 400; distance += 10) {
      view.updateVehicle(1, frame({ x: distance, groundLeft: distance, groundRight: distance }));
    }
    expect(marks()).toHaveLength(FX.marks.capacity);
    const mark = marks()[0];
    view.update(new Projectiles(1, 1), 0, FX.marks.lifeMs * 2);
    expect(mark.alpha).toBe(0);
    view.destroy();
    expect(lastCall(mark, 'destroy')).toBeDefined();
  });
});
