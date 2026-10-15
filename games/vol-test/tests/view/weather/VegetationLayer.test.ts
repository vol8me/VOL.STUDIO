import { describe, expect, it } from 'vitest';
import { WEATHER_VIEW } from '@/config/weatherView';
import { TerrainField } from '@/view/weather/TerrainField';
import type { WeatherSource } from '@/view/weather/SurfaceLayer';
import {
  VegetationLayer,
  vegetationPalette,
  type VegetationHost,
  type VegetationLayerKind,
} from '@/view/weather/VegetationLayer';
import { fakeObject, type FakeObject } from '../../support/fakeScene';
import { frame, sample, weather } from '../../support/weatherFixtures';

const rect = { x: 0, y: 0, width: 256, height: 256 };
const VEGETATION = WEATHER_VIEW.vegetation;
const TILE = VEGETATION.tile;

interface FakeImage {
  readonly kind: VegetationLayerKind;
  bakes: number;
  tint: number;
  visible: boolean;
  destroyed: boolean;
  texel: number;
  origin: { x: number; y: number };
}

/** Döşeme dokularının sahtesi: kalemler çizim komutlarını, görüntüler pişirme ve boya çağrılarını tutar. */
function fakeHost() {
  const pens: Record<VegetationLayerKind, FakeObject> = {
    region: fakeObject('graphics'),
    core: fakeObject('graphics'),
    clumps: fakeObject('graphics'),
    tips: fakeObject('graphics'),
  };
  const images: FakeImage[] = [];
  const host: VegetationHost = {
    pen: (kind) => pens[kind] as never,
    create: (kind) => {
      const image: FakeImage = {
        kind,
        bakes: 0,
        tint: 0xffffff,
        visible: true,
        destroyed: false,
        texel: 0,
        origin: { x: 0, y: 0 },
      };
      images.push(image);
      return {
        bake: (_pens, x, y, _size, texel) => {
          image.bakes++;
          image.texel = texel;
          image.origin = { x, y };
        },
        tone: (tint) => {
          image.tint = tint;
        },
        show: (visible) => {
          image.visible = visible;
        },
        destroy: () => {
          image.destroyed = true;
        },
      };
    },
  };
  return { host, pens, images };
}

const count = (object: FakeObject, name: string): number =>
  object.calls.filter(([call]) => call === name).length;

function layer(growth: number, snowDepth = 0) {
  const fake = fakeHost();
  const view = new VegetationLayer(fake.host);
  const source = weather(sample({ growth, snowDepth }));
  const field = new TerrainField(7);
  field.prepare(source, rect);
  return { ...fake, view, source, field };
}

/** Çok döşemeli dünya: 24×24 hücre, hücre 64 birim (1536×1536, 4×4 döşeme). */
function bigWorld(growth = 1, overrides: Partial<ReturnType<typeof frame>> = {}, cells = 24) {
  const size = 64;
  const surface = sample({ growth });
  const source: WeatherSource = {
    ...weather(surface),
    frame: frame(overrides),
    columns: cells,
    rows: cells,
    cellSize: size,
    cell: (col, row) =>
      col < 0 || row < 0 || col >= cells || row >= cells
        ? undefined
        : { ...surface, x: col * size, y: row * size, width: size, height: size },
  };
  const field = new TerrainField(7);
  return { source, field, world: cells * size };
}

/** Bütçeye takılmadan tüm eksik döşemeler pişsin diye birkaç kare çizer. */
function settle(
  view: VegetationLayer,
  field: TerrainField,
  source: WeatherSource,
  area: typeof rect,
  quality = 1,
  detail = 1,
): void {
  for (let pass = 0; pass < 64; pass++) {
    view.draw(field, source, area, quality, detail);
    if (view.baked === 0) return;
  }
}

describe('VegetationLayer', () => {
  it('çıplak toprağa çizim yapmaz ve doku üretmez; örtü büyüdükçe küme sayısı artar', () => {
    const bare = layer(0);
    bare.view.draw(bare.field, bare.source, rect);
    expect(bare.view.drawn).toBe(0);
    expect(count(bare.pens.clumps, 'lineTo')).toBe(0);
    expect(bare.images).toHaveLength(0);

    const young = layer(0.2);
    young.view.draw(young.field, young.source, rect);
    const lush = layer(1);
    lush.view.draw(lush.field, lush.source, rect);
    expect(young.view.drawn).toBeGreaterThan(0);
    expect(lush.view.drawn).toBeGreaterThan(young.view.drawn);
    expect(count(lush.pens.clumps, 'fillEllipse')).toBeGreaterThan(0);
    // Taban, çekirdek ve kümeler ayrı dokudur; kar yokken uç dokusu yoktur.
    expect(new Set(lush.images.map((image) => image.kind))).toEqual(
      new Set(['region', 'core', 'clumps']),
    );
  });

  it('döşeme başına küme tavanını aşmaz ve kalite düşünce seyrelir', () => {
    const run = (quality: number) => {
      const { source, field, world } = bigWorld(1);
      const { host } = fakeHost();
      const view = new VegetationLayer(host);
      settle(view, field, source, { x: 0, y: 0, width: world, height: world }, quality);
      return { drawn: view.drawn, tiles: view.tileCount };
    };
    const full = run(1);
    expect(full.tiles).toBeGreaterThan(8);
    expect(full.drawn).toBeGreaterThan(TILE.capacity);
    expect(full.drawn).toBeLessThanOrEqual(TILE.capacity * full.tiles);
    expect(run(0.25).drawn).toBeLessThan(full.drawn);
  });

  it('eşiği yeni geçen küme bir anda tam boyda belirmez: filizlenir (en küçük küme tam boyun yarısından küçük)', () => {
    const young = layer(0.22);
    young.view.draw(young.field, young.source, rect);
    const widths = young.pens.clumps.calls
      .filter(([name]) => name === 'fillEllipse')
      .map(([, args]) => Number(args[2]));
    expect(widths.length).toBeGreaterThan(0);
    const minimum = VEGETATION.length[0] * 1.25;
    expect(Math.min(...widths)).toBeLessThan(minimum * 0.5);
  });

  it('çizim seedlidir: aynı alan iki katmanda aynı çizgileri verir', () => {
    const a = layer(0.6);
    const b = layer(0.6);
    a.view.draw(a.field, a.source, rect);
    b.view.draw(b.field, b.source, rect);
    expect(a.pens.clumps.calls).toEqual(b.pens.clumps.calls);
    expect(a.pens.region.calls).toEqual(b.pens.region.calls);
  });

  it('döşeme dokusu pişince kamera kayması yeniden çizim istemez; yeni döşeme gelince yalnız o pişer', () => {
    const { source, field } = bigWorld(1);
    const { host, images } = fakeHost();
    const view = new VegetationLayer(host);
    const left = { x: 0, y: 0, width: 400, height: 400 };
    settle(view, field, source, left);
    const baked = images.map((image) => image.bakes);
    expect(baked.every((n) => n === 1)).toBe(true);
    // Aynı döşemeler içinde kayma: hiçbir doku yeniden pişmez, çizim komutu üretilmez.
    view.draw(field, source, { x: 30, y: 20, width: 330, height: 360 });
    view.draw(field, source, { x: 50, y: 40, width: 330, height: 330 });
    expect(view.baked).toBe(0);
    expect(images.map((image) => image.bakes)).toEqual(baked);
    // Yeni döşemelere geçince yalnız yeniler pişer; eskilerin dokusu aynen kalır.
    settle(view, field, source, { x: 800, y: 800, width: 400, height: 400 });
    expect(images.length).toBeGreaterThan(baked.length);
    expect(images.slice(0, baked.length).every((image) => image.bakes === 1)).toBe(true);
  });

  it('örtü değişince döşeme yeniden pişer: denetim aralığından önce değil, sonra', () => {
    const grown = bigWorld(0.3);
    const { host, images } = fakeHost();
    const view = new VegetationLayer(host);
    const area = { x: 0, y: 0, width: 400, height: 400 };
    settle(view, grown.field, grown.source, area);
    const first = images.reduce((sum, image) => sum + image.bakes, 0);
    // Kaynak örtü büyür ama saat denetim aralığına varmadı: dokular dokunulmaz.
    const lusher = bigWorld(0.9, { elapsedMs: grown.source.frame.elapsedMs + TILE.checkMs / 4 });
    view.draw(grown.field, lusher.source, area);
    expect(images.reduce((sum, image) => sum + image.bakes, 0)).toBe(first);
    // Aralık dolunca imza farkı görülür ve döşemeler yeniden pişer.
    const later = bigWorld(0.9, { elapsedMs: grown.source.frame.elapsedMs + TILE.checkMs + 1 });
    settle(view, grown.field, later.source, area);
    expect(images.reduce((sum, image) => sum + image.bakes, 0)).toBeGreaterThan(first);
  });

  it('gün ışığı doku boyasıdır: gece dokular yeniden pişmeden kararır', () => {
    const day = bigWorld(1, { daylight: 1 });
    const { host, images } = fakeHost();
    const view = new VegetationLayer(host);
    const area = { x: 0, y: 0, width: 400, height: 400 };
    settle(view, day.field, day.source, area);
    const bakes = images.map((image) => image.bakes);
    expect(images.every((image) => image.tint === 0xffffff)).toBe(true);
    const night = bigWorld(1, { daylight: 0, elapsedMs: day.source.frame.elapsedMs + 5 });
    view.draw(day.field, night.source, area);
    expect(images.map((image) => image.bakes)).toEqual(bakes);
    expect(images.every((image) => image.tint < 0xffffff && image.tint > 0)).toBe(true);
  });

  it('kar üstünde yalnız karlı hücrelerde uç çizer; derin karda seyrekleşir, karsızda çizmez', () => {
    const draw = (snowDepth: number) => {
      const run = layer(0.8, snowDepth);
      run.view.draw(run.field, run.source, rect);
      return {
        tips: count(run.pens.tips, 'lineTo'),
        tipImage: run.images.some((image) => image.kind === 'tips'),
      };
    };
    const full = WEATHER_VIEW.surface.snowFullDepth;
    expect(draw(0)).toEqual({ tips: 0, tipImage: false });
    const light = draw(full * 0.3);
    expect(light.tips).toBeGreaterThan(0);
    expect(light.tipImage).toBe(true);
    expect(draw(full * 1.2).tips).toBeLessThan(light.tips);
    // Derin karda uçlar seyrek ama tümden yok olmaz: kar altı yeşillik sezilir.
    const deep = draw(full * VEGETATION.tip.fadeDepth * 1.1).tips;
    expect(deep).toBeGreaterThan(0);
    expect(deep).toBeLessThan(light.tips);
  });

  it('kar erıyince uç dokusu boşaltılır; eski uçlar ekranda kalmaz', () => {
    const snowy = bigWorld(0.8);
    const surface = sample({ growth: 0.8, snowDepth: WEATHER_VIEW.surface.snowFullDepth * 0.4 });
    const withSnow: WeatherSource = {
      ...snowy.source,
      cell: (col, row) =>
        col < 0 || row < 0 || col >= 24 || row >= 24
          ? undefined
          : { ...surface, x: col * 64, y: row * 64, width: 64, height: 64 },
    };
    const { host, images, pens } = fakeHost();
    const view = new VegetationLayer(host);
    const area = { x: 0, y: 0, width: 400, height: 400 };
    settle(view, snowy.field, withSnow, area);
    const tips = images.filter((image) => image.kind === 'tips');
    expect(tips.length).toBeGreaterThan(0);
    const before = count(pens.tips, 'lineTo');
    const melted = bigWorld(0.8, { elapsedMs: snowy.source.frame.elapsedMs + TILE.checkMs + 1 });
    settle(view, snowy.field, melted.source, area);
    // Boş kalemle yeniden pişirildi: komut yok, doku boşaltıldı (silinmedi).
    expect(count(pens.tips, 'lineTo')).toBe(before);
    expect(tips.every((image) => image.bakes >= 2 && !image.destroyed)).toBe(true);
  });

  it('boş görünür alan çizimi gizler ve hata vermez', () => {
    const run = layer(0.8);
    run.view.draw(run.field, run.source, rect);
    expect(run.images.some((image) => image.visible)).toBe(true);
    run.view.draw(run.field, run.source, { ...rect, width: 0 });
    expect(run.view.drawn).toBe(0);
    expect(run.images.every((image) => !image.visible)).toBe(true);
  });

  it('ekran yoğunluğuna göre doku kademesi seçer ve küçük oynamada kademe değiştirmez', () => {
    const { source, field } = bigWorld(1);
    const { host, images } = fakeHost();
    const view = new VegetationLayer(host);
    const area = { x: 0, y: 0, width: 400, height: 400 };
    settle(view, field, source, area, 1, 0.5);
    expect(new Set(images.map((image) => image.texel))).toEqual(new Set([0.5]));
    // Yoğunluk %10 oynar: aynı kademe sürer, yeniden pişme yok.
    const bakes = images.map((image) => image.bakes);
    view.draw(field, source, area, 1, 0.55);
    expect(images.map((image) => image.bakes)).toEqual(bakes);
    // Belirgin yakınlaşma yeni kademeye geçirir; görünür döşemeler yeniden pişer.
    settle(view, field, source, area, 1, 2);
    expect(images.every((image) => image.texel === 2)).toBe(true);
  });

  it('görünürden uzak döşemeleri `retain` payıyla sınırlar ve eskileri bırakır', () => {
    // 64×64 hücre: 4096 birim, 11×11 döşeme.
    const { source, field } = bigWorld(1, {}, 64);
    const { host, images } = fakeHost();
    const view = new VegetationLayer(host);
    // Çapraz gezinti: her durakta yeni döşemeler pişer, eskiler birikmez.
    for (let at = 0; at <= 3600; at += 400) {
      settle(view, field, source, { x: at, y: at, width: 300, height: 300 });
    }
    const visible = 4;
    expect(view.tileCount).toBeLessThanOrEqual(visible + TILE.retain);
    expect(images.some((image) => image.destroyed)).toBe(true);
    view.destroy();
    expect(images.every((image) => image.destroyed)).toBe(true);
    expect(view.tileCount).toBe(0);
  });

  it('palet mevsimi izler, geçişte sonrakine karışır ve gün ışığıyla koyulaşır', () => {
    const spring = vegetationPalette(frame({ season: 'spring', seasonProgress: 0, daylight: 1 }));
    const autumn = vegetationPalette(frame({ season: 'autumn', seasonProgress: 0, daylight: 1 }));
    expect(spring.leaf).not.toBe(autumn.leaf);
    const late = vegetationPalette(frame({ season: 'spring', seasonProgress: 0.99, daylight: 1 }));
    const summer = vegetationPalette(frame({ season: 'summer', seasonProgress: 0, daylight: 1 }));
    expect(late.leaf).not.toBe(spring.leaf);
    expect(Math.abs(late.leaf - summer.leaf)).toBeLessThan(Math.abs(spring.leaf - summer.leaf));
    const night = vegetationPalette(frame({ season: 'spring', seasonProgress: 0, daylight: 0 }));
    expect(night.leaf).toBeLessThan(spring.leaf);
  });
});
