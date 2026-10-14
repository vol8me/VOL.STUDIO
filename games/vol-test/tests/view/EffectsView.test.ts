import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { DEBRIS } from '@/config/debris';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { EFFECT_LEVELS } from '@/config/quality';
import { Projectiles } from '@/sim/combat/Projectiles';
import { ARACHNID, STRIKER } from '@/config/vehicles';
import { EffectsView, hash01, type VehicleFxFrame } from '@/view/EffectsView';
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
  tracked: true,
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
  it('dondurulmuş karede (duraklatma) bütün parçacık yayıcıları durur, akış sürünce açılır', () => {
    const { view, particles } = build();
    const projectiles = new Projectiles(8, 1000);
    view.updateVehicle(1, frame({ speed: 200 }));
    const scales = (): unknown[] => particles().map((emitter) => emitter.timeScale);
    view.update(projectiles, 1, 0);
    expect(scales().length).toBeGreaterThan(7);
    expect(new Set(scales())).toEqual(new Set([0]));
    // Dondurulmuşken kurulan yeni araç yayıcıları da durur.
    view.updateVehicle(2, frame());
    expect(new Set(scales())).toEqual(new Set([0]));
    view.update(projectiles, 1, 16);
    expect(new Set(scales())).toEqual(new Set([1]));
  });

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

  it('bacaklı araç palet ve kayma izi bırakmaz ama egzoz ve tozunu taşır', () => {
    const { view, prints, skids, particles } = build();
    const shared = particles().length;
    for (let distance = 0; distance < 600; distance += 6) {
      view.updateVehicle(
        1,
        frame({
          x: distance,
          groundLeft: distance,
          groundRight: distance,
          slideLeft: 400,
          slideRight: 400,
          speed: 200,
          tracked: false,
        }),
      );
    }
    expect(prints()).toHaveLength(0);
    expect(skids()).toHaveLength(0);
    expect(particles()).toHaveLength(shared + 2);
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
    const step = FX.marks.spacing;
    for (let distance = 0; distance < step * FX.marks.capacity; distance += step) {
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

/** Enkaz havuzundaki görüntüler (parça + gölge çifti) ve parça doku adları. */
function debrisOf(scene: ReturnType<typeof fakeScene>) {
  const images = scene.created.filter(
    (object) => object.kind === 'image' && object.args[2] === '__DEFAULT',
  );
  const chunks = images.filter((_, index) => index % 2 === 0);
  const textures = chunks.map((chunk) => lastCall(chunk, 'setTexture')?.[0]);
  return { chunks, textures };
}

/** Karmanın verilen eşiğin altında/üstünde kaldığı bir isabet noktası (x, y). */
function spot(target: number, below: boolean): { x: number; y: number } {
  for (let x = 1; x < 2000; x++) {
    const roll = hash01(target, x, 7);
    if (below ? roll < DEBRIS.hit.chance : roll >= DEBRIS.hit.chance) return { x, y: 7 };
  }
  throw new Error('uygun nokta yok');
}

describe('EffectsView enkaz', () => {
  it('ölüm patlaması bir kez, kalabalıksız: hızlı patlama + sınırlı sayıda parça + yanık', () => {
    const { view, scene, scorches, flashes, rings } = build();
    view.wreck(STRIKER, 300, 400, 0, 0);
    const { chunks } = debrisOf(scene);
    expect(chunks.length).toBeGreaterThanOrEqual(DEBRIS.wreck.count[0]);
    expect(chunks.length).toBeLessThanOrEqual(DEBRIS.wreck.count[1]);
    expect(scorches()).toHaveLength(1);
    expect(flashes().length).toBeGreaterThan(0);
    expect(rings().length).toBeGreaterThan(0);
  });

  it('ilk parçalar aracın gerçek parçasıdır, kalanı levha kıymığıdır', () => {
    const { view, scene } = build();
    view.wreck(STRIKER, 300, 400, 0, 0);
    const { textures } = debrisOf(scene);
    expect(
      textures.slice(0, DEBRIS.wreck.big).every((key) => String(key).includes('striker')),
    ).toBe(true);
    expect(textures.slice(DEBRIS.wreck.big).every((key) => String(key).includes('shard'))).toBe(
      true,
    );
  });

  it('örümcek enkazı örümcek atlasından parça verir', () => {
    const { view, scene } = build();
    view.wreck(ARACHNID, 300, 400, 0, 0);
    const { chunks } = debrisOf(scene);
    const frames = chunks
      .slice(0, DEBRIS.wreck.big)
      .map((chunk) => lastCall(chunk, 'setTexture')?.[1]);
    expect(frames.every((frame) => String(frame).includes('arachnid'))).toBe(true);
  });

  it('aynı tohum aynı enkaz düzenini verir (belirlenimli)', () => {
    const run = () => {
      const { view, scene } = build();
      view.wreck(STRIKER, 300, 400, 20, -10);
      view.update(new Projectiles(1, 1), 0, 600);
      return debrisOf(scene).chunks.map((chunk) => [chunk.x, chunk.y, chunk.rotation]);
    };
    expect(run()).toEqual(run());
  });

  it('dondurulmuş karede enkaz kıpırdamaz', () => {
    const { view, scene } = build();
    view.wreck(STRIKER, 300, 400, 0, 0);
    view.update(new Projectiles(1, 1), 0, 100);
    const pose = () => debrisOf(scene).chunks.map((chunk) => [chunk.x, chunk.y]);
    const before = pose();
    view.update(new Projectiles(1, 1), 0, 0);
    expect(pose()).toEqual(before);
  });

  it('isabet kıymığı ara sıra kopar: eşik altında 1–2 parça, üstünde hiç', () => {
    const lucky = spot(5, true);
    const unlucky = spot(5, false);
    const a = build();
    a.view.chip(STRIKER, 5, lucky.x, lucky.y, 0);
    const kept = debrisOf(a.scene).chunks.length;
    expect(kept).toBeGreaterThanOrEqual(DEBRIS.hit.count[0]);
    expect(kept).toBeLessThanOrEqual(DEBRIS.hit.count[1]);
    const b = build();
    b.view.chip(STRIKER, 5, unlucky.x, unlucky.y, 0);
    expect(debrisOf(b.scene).chunks).toHaveLength(0);
  });

  it('hash01 [0,1) aralığında, belirlenimli ve eşiğe yakın oranda isabet verir', () => {
    expect(hash01(3, 4, 5)).toBe(hash01(3, 4, 5));
    expect(hash01(3, 4, 5)).not.toBe(hash01(3, 5, 4));
    let under = 0;
    const total = 4000;
    for (let index = 0; index < total; index++) {
      const roll = hash01(index % 7, index, index * 3);
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThan(1);
      if (roll < DEBRIS.hit.chance) under++;
    }
    expect(under / total).toBeGreaterThan(DEBRIS.hit.chance * 0.7);
    expect(under / total).toBeLessThan(DEBRIS.hit.chance * 1.3);
  });
});

describe('EffectsView kopan parça', () => {
  it('tankın palet parçaları ve örümceğin bacak parçası kopma noktasından dışarı savrulur', () => {
    for (const [spec, count] of [
      [STRIKER, 3],
      [ARACHNID, 2],
    ] as const) {
      const { view, scene } = build();
      view.shed(spec, 300, 400, Math.PI / 2);
      const { chunks } = debrisOf(scene);
      expect(chunks, spec.id).toHaveLength(count);
      for (let frame = 0; frame < 30; frame++) view.update(new Projectiles(1, 1), 0, 16);
      // Dışarı yönü +y: parçalar kopma noktasının altına (daha büyük y) düşmüş olmalı.
      const moved = chunks.map((chunk) => (chunk.y as number) - 400);
      expect(Math.max(...moved), spec.id).toBeGreaterThan(20);
    }
  });

  it('kopma kıvılcım, kısa parlama ve toz üretir; yanık bırakmaz (araç patlaması değildir)', () => {
    const { view, scorches, flashes, particles } = build();
    const before = particles().reduce((sum, emitter) => sum + burst(emitter), 0);
    view.shed(STRIKER, 300, 400, 0);
    expect(particles().reduce((sum, emitter) => sum + burst(emitter), 0)).toBeGreaterThan(before);
    expect(flashes().length).toBeGreaterThan(0);
    expect(scorches()).toHaveLength(0);
  });

  it('tankın kopan parçası aracın palet çarkıdır, örümceğinki bacağın tibia ve pençesidir', () => {
    const tank = build();
    tank.view.shed(STRIKER, 0, 0, 0);
    expect(debrisOf(tank.scene).textures[0]).toBe(TEXTURE.treadEnd);
    const spider = build();
    spider.view.shed(ARACHNID, 0, 0, 0);
    const frames = debrisOf(spider.scene).chunks.map((chunk) => lastCall(chunk, 'setTexture')?.[1]);
    expect(frames).toEqual(['arachnid/tibia', 'arachnid/tarsus']);
  });

  it('aynı tohum aynı savrulma düzenini verir', () => {
    const run = () => {
      const { view, scene } = build();
      view.shed(ARACHNID, 100, 100, 1);
      for (let frame = 0; frame < 25; frame++) view.update(new Projectiles(1, 1), 0, 16);
      return debrisOf(scene).chunks.map((chunk) => [chunk.x, chunk.y, chunk.rotation]);
    };
    expect(run()).toEqual(run());
  });
});

describe('EffectsView: iz disiplini', () => {
  const far = FX.marks.maxJump * 3;

  it('ışınlanan araç eski noktadan yeniye köprü çizmez; iz yeni noktadan sürer', () => {
    const { view, prints } = build();
    view.updateVehicle(1, frame());
    view.updateVehicle(1, frame({ x: FX.marks.spacing, groundLeft: 12, groundRight: 12 }));
    const before = prints().length;
    expect(before).toBeGreaterThan(0);
    // Yeniden doğuş: yer yolu sıfırlanır, konum çok uzağa atlar.
    view.updateVehicle(1, frame({ x: far, y: far }));
    view.updateVehicle(1, frame({ x: far, y: far, groundLeft: 40, groundRight: 40 }));
    expect(prints()).toHaveLength(before);
    view.updateVehicle(
      1,
      frame({ x: far + FX.marks.spacing, y: far, groundLeft: 52, groundRight: 52 }),
    );
    expect(prints().length).toBeGreaterThan(before);
    for (const print of prints().slice(before)) expect(print.x).toBeGreaterThan(far - 1);
  });

  it('geri giden araç da iz bırakır', () => {
    const { view, prints } = build();
    view.updateVehicle(1, frame({ groundLeft: 100, groundRight: 100 }));
    view.updateVehicle(
      1,
      frame({ x: -FX.marks.spacing, groundLeft: 100 - FX.marks.spacing, groundRight: 88 }),
    );
    expect(prints().length).toBeGreaterThan(0);
  });

  it('kayma çizgisi ışınlanmada kesilir', () => {
    const { view, skids } = build();
    const slide = FX.skid.fullSlide;
    view.updateVehicle(1, frame({ slideLeft: slide }));
    view.updateVehicle(1, frame({ x: far, y: far, slideLeft: slide }));
    expect(skids()).toHaveLength(0);
  });

  it('ekran dışındaki araç iz bırakmaz ve izi unutulur; görüş alanına dönünce köprü çizilmez', () => {
    const { view, prints } = build();
    view.setViewport(0, 0, 800, 600);
    const gone = FX.cullMargin + 5000;
    view.updateVehicle(1, frame({ x: gone, y: 100 }));
    view.updateVehicle(1, frame({ x: gone + 24, y: 100, groundLeft: 24, groundRight: 24 }));
    expect(prints()).toHaveLength(0);
    // Görüş alanına yaklaşınca yeni izle başlar: ilk görülen kare yalnız noktayı kaydeder.
    view.updateVehicle(1, frame({ x: 100, y: 100, groundLeft: 60, groundRight: 60 }));
    expect(prints()).toHaveLength(0);
    view.updateVehicle(1, frame({ x: 124, y: 100, groundLeft: 84, groundRight: 84 }));
    expect(prints().length).toBeGreaterThan(0);
  });

  it('görüş alanı verilmemişse (vitrin) her araç iz bırakır', () => {
    const { view, prints } = build();
    view.updateVehicle(1, frame({ x: 90000 }));
    view.updateVehicle(1, frame({ x: 90000 + 24, groundLeft: 24, groundRight: 24 }));
    expect(prints().length).toBeGreaterThan(0);
  });
});

describe('EffectsView: ayak izi', () => {
  const feet = (scene: ReturnType<typeof fakeScene>) =>
    scene.created.filter((object) => object.args[2] === TEXTURE.footPrint);

  it('basan pençe boyuna ölçekli küçük bir delik basar', () => {
    const { view, scene } = build();
    view.footprint(40, 50, 0.7, 2);
    const [print] = feet(scene);
    expect(print.x).toBe(40);
    expect(print.y).toBe(50);
    expect(print.rotation).toBeCloseTo(0.7);
    const size = lastCall(print, 'setDisplaySize') as number[];
    expect(size[0]).toBeGreaterThan(10);
    // Delik pençe ucu kadar küçüktür: referans yürüyücüde bir ayak izi kenarı 8 birimi geçmez.
    const reference = lastCall(feet(scene)[0], 'setDisplaySize') as number[];
    expect(reference[0] / 2).toBeLessThan(8);
    expect(size[0]).toBe(size[1]);
    expect(print.alpha).toBeCloseTo(FX.feet.alpha);
  });

  it('ekran dışında basılmaz; söner ve havuz kapasiteyle sınırlıdır', () => {
    const { view, scene } = build();
    view.setViewport(0, 0, 800, 600);
    view.footprint(FX.cullMargin + 5000, 0, 0, 1);
    expect(feet(scene)).toHaveLength(0);
    for (let i = 0; i < FX.feet.capacity + 50; i++) view.footprint(10 + i, 10, 0, 1);
    expect(feet(scene)).toHaveLength(FX.feet.capacity);
    const print = feet(scene)[0];
    view.update(new Projectiles(1, 1), 0, FX.feet.lifeMs);
    expect(print.alpha).toBe(0);
  });
});
