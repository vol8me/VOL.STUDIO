import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { EFFECT_LEVELS } from '@/config/quality';
import { Projectiles } from '@/sim/combat/Projectiles';
import { EffectsView, type VehicleFxFrame } from '@/view/EffectsView';
import { TEXTURE } from '@/view/textures';
import { fakeScene, lastCall, type FakeObject } from '../support/fakeScene';

function build(profile = EFFECT_LEVELS.high) {
  const scene = fakeScene();
  const view = new EffectsView(scene as unknown as Phaser.Scene, profile);
  const byTexture = (key: string) => () => scene.created.filter((object) => object.args[2] === key);
  const particles = () => scene.created.filter((object) => object.kind === 'particles');
  const graphics = () => scene.created.filter((object) => object.kind === 'graphics');
  const [tracers] = graphics();
  return {
    view,
    scene,
    particles,
    graphics,
    tracers,
    prints: byTexture(TEXTURE.treadPrint),
    skids: byTexture(TEXTURE.skid),
    scorches: byTexture(TEXTURE.scorch),
    flashes: byTexture(TEXTURE.blast),
    rings: byTexture(TEXTURE.ring),
  };
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

/** Bir parçacık yayıcısının `explode` çağrılarındaki toplam parçacık. */
function burst(emitter: FakeObject): number {
  return emitter.calls
    .filter(([name]) => name === 'explode')
    .reduce((sum, [, args]) => sum + (args[0] as number), 0);
}

function lines(graphics: FakeObject): number {
  return graphics.calls.filter(([name]) => name === 'lineBetween').length;
}

describe('EffectsView', () => {
  it('mermi: parlak gövde ve incelen iz; iz namlu ağzında tankın içine uzanmaz', () => {
    const { view, graphics } = build();
    const projectiles = new Projectiles(8, 1000);
    const fresh = projectiles.spawn(1, 0, 0, 900, 0);
    view.update(projectiles, 1, 16);
    const layer = graphics().find((object) => lines(object) > 0)!;
    // 3 incelen parça × (hale + çekirdek) + gövde.
    expect(lines(layer)).toBe(7);
    const reach = Math.min(
      ...layer.calls
        .filter(([name]) => name === 'lineBetween')
        .map(([, args]) => Math.min(args[0] as number, args[2] as number)),
    );
    expect(reach).toBeGreaterThanOrEqual(-FX.shell.headLength - 1e-9);
    fresh.ageMs = 500;
    fresh.travelled = 450;
    view.update(projectiles, 1, 16);
    const long = Math.min(
      ...layer.calls
        .filter(([name]) => name === 'lineBetween')
        .map(([, args]) => Math.min(args[0] as number, args[2] as number)),
    );
    expect(long).toBeCloseTo(-FX.shell.tracerLength);
  });

  it('uçan mermi yoluna aralıklı duman izi bırakır; duraklatmada bırakmaz', () => {
    const { view, particles } = build();
    const trail = particles()[1];
    const projectiles = new Projectiles(8, 1000);
    const shell = projectiles.spawn(1, 0, 0, 900, 0);
    shell.ageMs = 100;
    shell.travelled = 90;
    // 100 ms'de 90 birim; son 16 ms'de 14.4 birim → 1 aralık sınırı geçilir ya da geçilmez.
    view.update(projectiles, 1, 100);
    const puffs = burst(trail);
    expect(puffs).toBe(Math.floor(90 / FX.shell.trailSpacing));
    view.update(projectiles, 1, 0);
    expect(burst(trail)).toBe(puffs);
  });

  it('atış: ileri ateş topu, iki yana namlu freni jeti, yerde toz halkası ve basınç halkası', () => {
    const { view, particles, rings } = build();
    const [dust, , smoke, jets, , fire] = particles();
    view.muzzle(10, 20, 0);
    expect(burst(fire)).toBe(FX.muzzle.forwardSparks);
    expect(burst(jets)).toBe(FX.muzzle.sideJets * 2);
    expect(burst(dust)).toBe(FX.muzzle.groundDust);
    expect(burst(smoke)).toBeGreaterThan(0);
    const jetAngles = jets.calls
      .filter(([name]) => name === 'setEmitterAngle')
      .map(([, args]) => args[0] as { min: number; max: number });
    expect(jetAngles).toEqual([
      { min: 70, max: 110 },
      { min: -110, max: -70 },
    ]);
    const [ring] = rings();
    expect(ring.visible).toBe(true);
    expect(ring.scale).toBeCloseTo(0.1);
    view.update(new Projectiles(1, 1), 0, FX.muzzle.ring.durationMs / 2);
    // Halka hızlı açılır: yarı sürede hedef ölçeğin çoğuna ulaşır.
    expect(ring.scale as number).toBeGreaterThan(FX.muzzle.ring.scale * 0.8);
    view.update(new Projectiles(1, 1), 0, FX.muzzle.ring.durationMs);
    expect(ring.visible).toBe(false);
  });

  it('patlama: parlama, şok halkası, parçalar, toz, duman ve yerde kalan yanık', () => {
    const { view, particles, scorches, flashes } = build();
    const [dust, , smoke, , debris, , sparks] = particles();
    view.explode(100, 200, 0, 'ground');
    expect(burst(debris)).toBe(FX.blast.debris);
    expect(burst(dust)).toBe(FX.blast.dust);
    expect(burst(smoke)).toBe(FX.blast.smoke);
    expect(burst(sparks)).toBe(FX.blast.sparks);
    expect(scorches()).toHaveLength(1);
    expect(lastCall(scorches()[0], 'setTint')).toEqual([PALETTE.scorch]);
    const [flash] = flashes();
    expect(flash.visible).toBe(true);
    view.update(new Projectiles(1, 1), 0, FX.blast.flash.durationMs / 2);
    expect(flash.alpha as number).toBeCloseTo(0.5);
    view.update(new Projectiles(1, 1), 0, FX.blast.flash.durationMs);
    expect(flash.visible).toBe(false);
    // Yanık yarı ömre dek tam, sonra söner.
    const scorch = scorches()[0];
    view.update(new Projectiles(1, 1), 0, FX.blast.scorch.lifeMs * 0.4);
    expect(scorch.alpha).toBeCloseTo(FX.blast.scorch.alpha);
    view.update(new Projectiles(1, 1), 0, FX.blast.scorch.lifeMs);
    expect(scorch.alpha).toBe(0);
  });

  it('duvar patlaması parçaları duvardan geri, geliş yönünün tersine açar', () => {
    const { view, particles } = build();
    const debris = particles()[4];
    view.explode(0, 0, 0, 'wall');
    expect(lastCall(debris, 'setEmitterAngle')).toEqual([{ min: 180 - 75, max: 180 + 75 }]);
  });

  it('araca isabet yanık bırakmaz, küçük parlama ve kıvılcım verir', () => {
    const { view, particles, scorches, flashes } = build();
    view.hit(0, 0, 0);
    expect(scorches()).toHaveLength(0);
    expect(flashes()).toHaveLength(1);
    expect(burst(particles()[6])).toBe(FX.hit.sparks);
  });

  it('kalite: düşük kademe parçacığı yarıya indirir ve haleyi kapatır; canlı değişir', () => {
    const { view, particles, tracers } = build();
    const debris = particles()[4];
    const projectiles = new Projectiles(2, 1000);
    projectiles.spawn(1, 0, 0, 900, 0);
    const halos = (): number => {
      tracers.calls.length = 0;
      view.update(projectiles, 1, 0);
      return tracers.calls.filter(([name]) => name === 'fillCircle').length;
    };
    expect(halos()).toBe(3);
    view.applyProfile(EFFECT_LEVELS.low);
    expect(halos()).toBe(1);
    view.explode(0, 0, 0, 'ground');
    expect(burst(debris)).toBe(Math.round(FX.blast.debris * EFFECT_LEVELS.low.particles));
    view.applyProfile(EFFECT_LEVELS.high);
    expect(halos()).toBe(3);
  });

  it('düşük kademede zemin izi havuzları küçük kurulur', () => {
    const { view, prints } = build(EFFECT_LEVELS.low);
    for (let distance = 0; distance < 6 * 2000; distance += 6) {
      view.updateVehicle(1, frame({ x: distance, groundLeft: distance, groundRight: distance }));
    }
    expect(prints()).toHaveLength(Math.round(FX.marks.capacity * EFFECT_LEVELS.low.decals));
  });

  it('her araç kendi egzoz ve tozunu taşır; egzoz hızlanmada, toz hızda ya da patinajda', () => {
    const { view, particles } = build();
    const shared = particles().length;
    view.updateVehicle(1, frame({ speed: 200, boosting: true }));
    view.updateVehicle(2, frame());
    const [exhaustA, dustA, exhaustB, dustB] = particles().slice(shared);
    expect(exhaustA.emitting).toBe(true);
    expect(dustA.emitting).toBe(true);
    expect(exhaustB.emitting).toBe(false);
    expect(dustB.emitting).toBe(false);
    view.updateVehicle(2, frame({ slipping: true }));
    expect(dustB.emitting).toBe(true);
    view.removeVehicle(2);
    expect(lastCall(dustB, 'destroy')).toBeDefined();
    view.updateVehicle(1, frame());
    expect(particles()).toHaveLength(shared + 4);
  });

  it('palet izi: temas yolunu izleyen sürekli bant, pabuç adımında bir parça', () => {
    const { view, prints } = build();
    const step = FX.marks.spacing;
    view.updateVehicle(1, frame());
    view.updateVehicle(1, frame({ x: step / 2, groundLeft: step / 2, groundRight: step / 2 }));
    expect(prints()).toHaveLength(0);
    view.updateVehicle(1, frame({ x: step, groundLeft: step, groundRight: step }));
    expect(prints()).toHaveLength(2);
    const [left] = prints();
    expect(lastCall(left, 'setTint')).toEqual([PALETTE.treadMark]);
    expect(lastCall(left, 'setDisplaySize')).toEqual([step, FX.marks.width]);
    expect(left.x).toBeCloseTo(step / 2);
    expect(left.rotation).toBeCloseTo(0);
    // Yerinde dönüş: iki palet ters yöne gider, parçalar ters yöne bakar.
    const { view: pivot, prints: pivotPrints } = build();
    pivot.updateVehicle(1, frame());
    pivot.updateVehicle(
      1,
      frame({ hull: 0.8, groundLeft: FX.marks.spacing * 2, groundRight: FX.marks.spacing * 2 }),
    );
    const [a, b] = pivotPrints();
    expect(Math.abs(Math.cos((a.rotation as number) - (b.rotation as number)))).toBeCloseTo(1);
    expect(Math.cos((a.rotation as number) - (b.rotation as number))).toBeLessThan(0);
  });

  it('palet izi patinajla uzamaz, kayan palette desen basılmaz', () => {
    const { view, prints } = build();
    view.updateVehicle(1, frame());
    view.updateVehicle(1, frame({ slipping: true }));
    expect(prints()).toHaveLength(0);
    const slide = FX.skid.fullSlide;
    view.updateVehicle(
      1,
      frame({ x: 20, groundLeft: 20, groundRight: 20, slideLeft: slide, slideRight: 0 }),
    );
    expect(prints()).toHaveLength(1);
  });

  it('palet izi uzun yaşar: önce tam, sonra söner; havuz dolunca en eski yeniden kullanılır', () => {
    const { view, prints } = build();
    for (let distance = 0; distance < 6 * 800; distance += 6) {
      view.updateVehicle(1, frame({ x: distance, groundLeft: distance, groundRight: distance }));
    }
    expect(prints()).toHaveLength(FX.marks.capacity);
    const print = prints()[0];
    view.update(new Projectiles(1, 1), 0, FX.marks.lifeMs * FX.marks.holdShare * 0.9);
    expect(print.alpha).toBeCloseTo(FX.marks.alpha);
    view.update(new Projectiles(1, 1), 0, FX.marks.lifeMs);
    expect(print.alpha).toBe(0);
    view.destroy();
    expect(lastCall(print, 'destroy')).toBeDefined();
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

  it('kayma izi uzun yaşar ve söner; söküm her şeyi bırakır', () => {
    const { view, skids } = build();
    const slide = FX.skid.fullSlide;
    view.updateVehicle(1, frame({ slideLeft: slide, slideRight: slide }));
    view.updateVehicle(1, frame({ x: 30, slideLeft: slide, slideRight: slide }));
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
});
