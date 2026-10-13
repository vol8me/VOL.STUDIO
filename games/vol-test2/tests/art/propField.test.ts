import { describe, expect, it } from 'vitest';
import { DEG } from '../../src/art/anim';
import { ASSETS, TILE_UNITS } from '../../src/art/manifest';
import { textureKey } from '../../src/art/textures';
import { BLEND } from '../../src/art/parts';
import { PROPS, type PropKind } from '../../src/art/props';
import { PropField, type PropFieldOptions } from '../../src/art/propField';
import { FakeFactory } from '../helpers/fakeParts';

const OPTIONS: PropFieldOptions = { zoom: 0.5, pxPerUnit: 2 };

function field(options: PropFieldOptions = OPTIONS): { factory: FakeFactory; field: PropField } {
  const factory = new FakeFactory();
  return { factory, field: new PropField(factory, options) };
}

describe('PropField: yerleştirme', () => {
  it('her katman bir sahne nesnesi olur; bant TileSprite, diğerleri Image', () => {
    const { factory, field: props } = field();
    props.add('conveyor', 0, 0);
    expect(factory.parts.map((part) => [part.key, part.kind])).toEqual([
      [textureKey('conveyor-base', 2), 'image'],
      [textureKey('conveyor-belt', 2), 'tile'],
      [textureKey('conveyor-rails', 2), 'image'],
    ]);
    expect(props.counts()).toMatchObject({ props: 1, parts: 3, dynamicLayers: 1, tileSprites: 1 });
  });

  it('ölçek zoom/pxPerUnit, derinlik katman sırası, bağlantı noktası origin olur', () => {
    const { factory, field: props } = field();
    props.add('drill', 0, 0);
    const [base, rotor] = factory.parts;
    expect(base.scaleX).toBeCloseTo(OPTIONS.zoom / OPTIONS.pxPerUnit);
    expect([base.depth, rotor.depth]).toEqual([0, 1]);
    const asset = ASSETS['drill-rotor'];
    expect(rotor.originX).toBeCloseTo(24 / asset.width);
    expect(rotor.originY).toBeCloseTo(24 / asset.height);
  });

  it('bant dokusu karo boyutundadır ve doku ölçeği ekran ölçeğiyle eşleşir', () => {
    const { factory, field: props } = field();
    props.add('conveyor', 0, 0);
    const belt = factory.byKey(textureKey('conveyor-belt', 2))[0];
    expect(belt.width).toBeCloseTo(ASSETS['conveyor-belt'].width * OPTIONS.zoom);
    expect(belt.height).toBeCloseTo(ASSETS['conveyor-belt'].height * OPTIONS.zoom);
    expect(belt.tileScaleX).toBeCloseTo(OPTIONS.zoom / OPTIONS.pxPerUnit);
    expect(belt.tileScaleY).toBeCloseTo(OPTIONS.zoom / OPTIONS.pxPerUnit);
  });

  it('konum karo ızgarasından ve köşeden gelir; parça ekran pikseline zoom ile çevrilir', () => {
    const { factory, field: props } = field({ ...OPTIONS, originX: 100, originY: 50 });
    props.add('wall', 3, 2);
    expect(factory.parts[0].x).toBeCloseTo((100 + 3 * TILE_UNITS) * OPTIONS.zoom);
    expect(factory.parts[0].y).toBeCloseTo((50 + 2 * TILE_UNITS) * OPTIONS.zoom);
  });

  it('çeyrek tur prop merkezi çevresinde döndürür: sol-üst köşe yer değiştirir', () => {
    const { factory, field: props } = field();
    props.add('wall', 2, 3, 1);
    const centerX = 2 * TILE_UNITS + TILE_UNITS / 2;
    const centerY = 3 * TILE_UNITS + TILE_UNITS / 2;
    const base = factory.parts[0];
    expect(base.rotation).toBeCloseTo(Math.PI / 2);
    // Sol-üst (-32,-32) merkez çevresinde 90° dönünce (+32,-32) olur.
    expect(base.x).toBeCloseTo((centerX + 32) * OPTIONS.zoom);
    expect(base.y).toBeCloseTo((centerY - 32) * OPTIONS.zoom);
  });

  it('çok karolu yapı kendi merkezi çevresinde döner', () => {
    const { factory, field: props } = field();
    props.add('core', 1, 1, 2);
    const base = factory.parts[0];
    expect(base.rotation).toBeCloseTo(Math.PI);
    // 3x3 merkez (1+1.5, 1+1.5) karo; 180°'de sol-üst köşe sağ-alta gider.
    expect(base.x).toBeCloseTo((TILE_UNITS * 2.5 + 96) * OPTIONS.zoom);
    expect(base.y).toBeCloseTo((TILE_UNITS * 2.5 + 96) * OPTIONS.zoom);
  });

  it('toplamalı karışım yalnız parlama katmanlarına verilir', () => {
    const { factory, field: props } = field();
    props.add('smelter', 0, 0);
    const blends = factory.parts.map((part) => part.blend);
    expect(blends).toEqual([BLEND.normal, BLEND.add, BLEND.normal]);
  });

  it('sayımlar türe göre toplanır ve destroy her şeyi kaldırır', () => {
    const { factory, field: props } = field();
    for (const kind of ['wall', 'wall', 'turret', 'ore-a'] as PropKind[]) props.add(kind, 0, 0);
    expect(props.counts().byKind).toEqual({ wall: 2, turret: 1, 'ore-a': 1 });
    expect(props.counts().parts).toBe(
      2 * PROPS.wall.layers.length + PROPS.turret.layers.length + PROPS['ore-a'].layers.length,
    );
    props.destroy();
    expect(factory.parts.every((part) => part.destroyed)).toBe(true);
    expect(props.counts()).toMatchObject({ props: 0, parts: 0, dynamicLayers: 0, tileSprites: 0 });
  });
});

describe('PropField: animasyon', () => {
  it('durağan katmanlar update ile oynamaz; yalnız hareketliler güncellenir', () => {
    const { factory, field: props } = field();
    props.add('drill', 4, 4);
    const [base, rotor] = factory.parts;
    const before = { x: base.x, y: base.y, rotation: base.rotation, rotorX: rotor.x };
    props.update(1.3);
    expect(base).toMatchObject({ x: before.x, y: before.y, rotation: before.rotation });
    expect(rotor.x).toBeCloseTo(before.rotorX);
    expect(rotor.rotation).toBeCloseTo((((45 * 360 * 1.3) / 60) % 360) * DEG);
  });

  it('doğuya bakan bant doku konumunu eksiye kaydırır (içerik +x yönünde akar)', () => {
    const { factory, field: props } = field();
    props.add('conveyor', 0, 0, 0);
    const belt = factory.byKey(textureKey('conveyor-belt', 2))[0];
    props.update(0);
    expect(belt.tilePositionX).toBeCloseTo(0);
    props.update(0.25);
    // 48 birim/sn * 0,25 sn = 12 birim; doku pikseli = 12 * pxPerUnit.
    expect(belt.tilePositionX).toBeCloseTo(-12 * OPTIONS.pxPerUnit);
    props.update(ASSETS['conveyor-belt'].width / 48);
    expect(belt.tilePositionX).toBeCloseTo(0, 6); // bir dönem sonra sarar
  });

  it('batıya bakan bant yarım turla döndürülür: kendi +x yönü dünyada -x olur', () => {
    const { factory, field: props } = field();
    props.add('conveyor', 0, 0, 2);
    const belt = factory.byKey(textureKey('conveyor-belt', 2))[0];
    props.update(0.1);
    expect(belt.rotation).toBeCloseTo(Math.PI);
    expect(Math.cos(belt.rotation)).toBeLessThan(0);
  });

  it('faz kayması iki özdeş yapıyı birbirinden ayırır', () => {
    const { factory, field: props } = field();
    props.add('drill', 0, 0, 0, 0);
    props.add('drill', 1, 0, 0, 0.5);
    props.update(1);
    const rotors = factory.byKey(textureKey('drill-rotor', 2));
    expect(rotors[0].rotation).not.toBeCloseTo(rotors[1].rotation);
  });

  it('parlama alfası tarif aralığında kalır', () => {
    const { factory, field: props } = field();
    props.add('smelter', 0, 0);
    const glow = factory.byKey(textureKey('smelter-glow', 2))[0];
    for (let t = 0; t < 4; t += 0.07) {
      props.update(t);
      expect(glow.alpha).toBeGreaterThanOrEqual(0.45 - 1e-9);
      expect(glow.alpha).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('namlu parlaması ebeveynini izler: uzaklık sabit, yön namlu dönüşüyle birlikte', () => {
    const { factory, field: props } = field();
    props.add('turret', 0, 0);
    const head = factory.byKey(textureKey('turret-head', 2))[0];
    const flash = factory.byKey(textureKey('turret-flash', 2))[0];
    const distances: number[] = [];
    for (const t of [0.4, 1.1, 1.9, 3.3]) {
      props.update(t);
      distances.push(Math.hypot(flash.x - head.x, flash.y - head.y));
      expect(flash.rotation).toBeCloseTo(head.rotation);
      const angle = Math.atan2(flash.y - head.y, flash.x - head.x);
      expect(Math.cos(angle - head.rotation)).toBeCloseTo(1, 6);
    }
    const muzzle = PROPS.turret.layers.find((layer) => layer.id === 'flash')?.at[0] ?? NaN;
    for (const distance of distances) expect(distance).toBeCloseTo(muzzle * OPTIONS.zoom, 6);
  });

  it('geri tepme namluyu kendi ekseni boyunca geri çeker ve söner', () => {
    const { factory, field: props } = field();
    props.add('turret', 0, 0);
    const head = factory.byKey(textureKey('turret-head', 2))[0];
    const pivotX = 32 * OPTIONS.zoom;
    const pivotY = 32 * OPTIONS.zoom;
    props.update(0);
    // Ateş anında namlu 3,5 birim geridedir; ilk karede dönüş sıfırdır, yani -x yönünde.
    expect(head.x).toBeCloseTo(pivotX - 3.5 * OPTIONS.zoom, 6);
    expect(head.y).toBeCloseTo(pivotY, 6);
    props.update(0.9);
    expect(Math.hypot(head.x - pivotX, head.y - pivotY)).toBeLessThan(0.01);
  });
});
