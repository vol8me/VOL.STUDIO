import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { LAKE_SPECS } from '@/config/lakes';
import { WATER_VIEW } from '@/config/waterView';
import { WORLD } from '@/config/world';
import type { WeatherFrame } from '@/sim/weather/WeatherSystem';
import { LakeField } from '@/sim/world/LakeField';
import { iceFront, iceThickness, LakeView, waterColors } from '@/view/water/LakeView';
import { fakeScene, lastCall, type FakeObject } from '../../support/fakeScene';

const field = new LakeField(WORLD.width, WORLD.height, LAKE_SPECS);

function frame(patch: Partial<WeatherFrame> = {}): WeatherFrame {
  return {
    kind: 'clear',
    season: 'summer',
    seasonProgress: 0.3,
    daylight: 0.9,
    elapsedMs: 1000,
    dust: 0,
    rain: 0,
    snow: 0,
    windX: 0,
    windY: 0,
    temperature: 20,
    airDrag: 1,
    windTravelX: 0,
    windTravelY: 0,
    ...patch,
  };
}

function build() {
  const scene = fakeScene();
  const view = new LakeView(scene as unknown as Phaser.Scene, field);
  const graphics = scene.created.find((object) => object.kind === 'graphics') as FakeObject;
  const images = scene.created.filter((object) => object.kind === 'image');
  return { scene, view, graphics, images };
}

/** Birinci gölün çevresinde, onu ekrana alan görünür dikdörtgen. */
function around(index: number) {
  const lake = field.lakes[index];
  return { x: lake.x - 400, y: lake.y - 400, width: 800, height: 800 };
}

describe('iceThickness / iceFront', () => {
  it('donma noktasının üstünde sıfırdır, soğudukça tek yönde artar ve 1 ile sınırlanır', () => {
    expect(iceThickness({ temperature: 12, snow: 0 })).toBe(0);
    expect(iceThickness({ temperature: WATER_VIEW.ice.freezeAt, snow: 0 })).toBe(0);
    let previous = 0;
    for (let temperature = -1; temperature >= -9; temperature -= 1) {
      const value = iceThickness({ temperature, snow: 0 });
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(iceThickness({ temperature: -30, snow: 1 })).toBe(1);
  });

  it('kar yağarken donma biraz öne geçer; sıcakken kar buz yapmaz', () => {
    const dry = iceThickness({ temperature: -3, snow: 0 });
    expect(iceThickness({ temperature: -3, snow: 1 })).toBeGreaterThan(dry);
    expect(iceThickness({ temperature: 5, snow: 1 })).toBe(0);
  });

  it('buz cephesi kıyıdan merkeze iner ve hiçbir zaman merkezi tam kapatmaz', () => {
    expect(iceFront(0)).toBe(1);
    expect(iceFront(0.5)).toBeLessThan(iceFront(0.25));
    expect(iceFront(1)).toBeGreaterThan(0);
    expect(iceFront(3)).toBe(iceFront(1));
  });
});

describe('waterColors', () => {
  it('mevsim sonunda bir sonraki mevsimin paletine karışır; gün ışığı koyulaştırır', () => {
    const early = waterColors({ season: 'summer', seasonProgress: 0, daylight: 1 });
    const late = waterColors({ season: 'summer', seasonProgress: 1, daylight: 1 });
    expect(early.deep).not.toBe(late.deep);
    const dark = waterColors({ season: 'summer', seasonProgress: 0, daylight: 0 });
    expect(dark.shallow).not.toBe(early.shallow);
  });
});

describe('LakeView', () => {
  it('her göl için bir doku ve görüntü kurar; çizgi katmanı bantların hemen üstündedir', () => {
    const { scene, graphics, images } = build();
    expect(scene.textures.addCanvas).toHaveBeenCalledTimes(LAKE_SPECS.length);
    expect(images).toHaveLength(LAKE_SPECS.length);
    expect(graphics.depth).toBeCloseTo(WATER_VIEW.depth + 0.1, 6);
    expect(images[0].depth).toBe(WATER_VIEW.depth);
  });

  it('yalnız ekrana değen gölü gösterir ve basar; öteki görüntüler gizlidir', () => {
    const { view, images } = build();
    view.update(around(0), frame());
    expect(view.visibleLakes).toBe(1);
    expect(images[0].visible).toBe(true);
    expect(images.slice(1).every((image) => image.visible === false)).toBe(true);
    view.update({ x: 6000, y: 6000, width: 10, height: 10 }, frame());
    expect(view.visibleLakes).toBe(0);
  });

  it('renkler değişmedikçe dokuyu yeniden basmaz; mevsim değişince en sık aralıkta basar', () => {
    const { scene, view } = build();
    const texture = scene.textures.addCanvas.mock.results[0].value as {
      refresh: { mock: { calls: unknown[] } };
    };
    view.update(around(0), frame({ elapsedMs: 1000 }));
    expect(texture.refresh.mock.calls).toHaveLength(1);
    view.update(around(0), frame({ elapsedMs: 1100 }));
    expect(texture.refresh.mock.calls).toHaveLength(1);
    // Renk değişti ama aralık dolmadı: bekler.
    view.update(around(0), frame({ elapsedMs: 1200, season: 'winter', daylight: 0.3 }));
    expect(texture.refresh.mock.calls).toHaveLength(1);
    view.update(
      around(0),
      frame({
        elapsedMs: 1000 + WATER_VIEW.bake.minIntervalMs + 10,
        season: 'winter',
        daylight: 0.3,
      }),
    );
    expect(texture.refresh.mock.calls).toHaveLength(2);
  });

  it('donma ilerledikçe doku yeniden basılır ve cephe çizgisi çizilir; sıcakta buz yoktur', () => {
    const { scene, view, graphics } = build();
    const texture = scene.textures.addCanvas.mock.results[0].value as {
      refresh: { mock: { calls: unknown[] } };
    };
    view.update(around(0), frame({ elapsedMs: 1000, temperature: 20 }));
    const warm = graphics.calls.filter(([name]) => name === 'strokePoints').length;
    view.update(
      around(0),
      frame({ elapsedMs: 5000, temperature: -4, season: 'summer', daylight: 0.9 }),
    );
    expect(texture.refresh.mock.calls).toHaveLength(2);
    const cold = graphics.calls.filter(([name]) => name === 'strokePoints').length;
    expect(cold).toBeGreaterThan(warm);
  });

  it('yağmurda su yüzünde halka çizer; tam donmuş gölde yağmur halkası yoktur', () => {
    const { view, graphics } = build();
    view.update(around(0), frame({ rain: 1, temperature: 12 }));
    expect(graphics.calls.some(([name]) => name === 'strokeEllipse')).toBe(true);
    graphics.calls.length = 0;
    view.update(around(0), frame({ rain: 1, temperature: -30, elapsedMs: 9000 }));
    expect(graphics.calls.filter(([name]) => name === 'strokeEllipse')).toHaveLength(0);
  });

  it('boş ya da sıfır ölçülü görünür alanı çizmez ve kapanışta nesneleri yok eder', () => {
    const { view, graphics, images } = build();
    view.update({ x: 0, y: 0, width: 0, height: 100 }, frame());
    expect(view.visibleLakes).toBe(0);
    expect(lastCall(graphics, 'clear')).toBeDefined();
    view.destroy();
    expect(lastCall(graphics, 'destroy')).toBeDefined();
    expect(lastCall(images[0], 'destroy')).toBeDefined();
  });
});
