import { describe, expect, it, vi } from 'vitest';
import { lifeGraphicsConfig } from '@/config/graphics';
import {
  alphaAt,
  rasterizeHabitatGlow,
  rasterizeHabitatGlowRows,
  type HabitatGlowStyle,
} from '@/runtime/render/HabitatGlowRasterizer';
import { HabitatRenderer } from '@/runtime/render/HabitatRenderer';
import type { DomainSample, WorldDomain } from '@/runtime/sim/WorldDomain';

const STYLE: HabitatGlowStyle = {
  decayUnits: lifeGraphicsConfig.habitatGlowDecayUnits,
  shoreWidthUnits: lifeGraphicsConfig.habitatGlowShoreWidthUnits,
  interiorFadeUnits: lifeGraphicsConfig.habitatGlowInteriorFadeUnits,
  voidAlpha: lifeGraphicsConfig.habitatGlowVoidAlpha,
  shoreAlpha: lifeGraphicsConfig.habitatGlowShoreAlpha,
  color: lifeGraphicsConfig.voidColor,
};

const RECT = { x: 0, y: 0, width: 1024, height: 1024 };
const CENTER = { x: 512, y: 512 };

/**
 * KESKİN İÇ BÜKEY test domaini: yıldız benzeri kontur, eski kontur-öteleme
 * yolunun kiriş ürettiği en kötü durum. Mesafe, yoğun poligon üzerinde
 * nokta-segment minimumuyla hesaplanır — sınanan rasterleştiriciden bağımsızdır.
 */
class StarDomain implements WorldDomain {
  readonly storage = RECT;
  readonly bbox = { x: 112, y: 112, width: 800, height: 800 };
  readonly digest = 'star000000000000';
  private readonly points: Float64Array;

  constructor(
    private readonly segments = 4096,
    private readonly baseRadius = 320,
    private readonly amplitude = 0.35,
    private readonly lobes = 5,
  ) {
    this.points = new Float64Array(segments * 2);
    for (let index = 0; index < segments; index++) {
      const theta = (index / segments) * Math.PI * 2;
      const radius = this.radiusAt(theta);
      this.points[index * 2] = CENTER.x + Math.cos(theta) * radius;
      this.points[index * 2 + 1] = CENTER.y + Math.sin(theta) * radius;
    }
  }

  radiusAt(theta: number): number {
    return this.baseRadius * (1 + this.amplitude * Math.sin(this.lobes * theta));
  }

  sampleDistanceAndNormal(
    x: number,
    y: number,
    out: DomainSample = { distance: 0, normalX: 1, normalY: 0 },
  ): DomainSample {
    let bestSquared = Number.POSITIVE_INFINITY;
    let bestX = 0;
    let bestY = 0;
    for (let index = 0; index < this.segments; index++) {
      const next = index + 1 === this.segments ? 0 : index + 1;
      const ax = this.points[index * 2];
      const ay = this.points[index * 2 + 1];
      const dx = this.points[next * 2] - ax;
      const dy = this.points[next * 2 + 1] - ay;
      const lengthSquared = dx * dx + dy * dy;
      let t = lengthSquared > 0 ? ((x - ax) * dx + (y - ay) * dy) / lengthSquared : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const footX = ax + dx * t;
      const footY = ay + dy * t;
      const squared = (x - footX) ** 2 + (y - footY) ** 2;
      if (squared < bestSquared) {
        bestSquared = squared;
        bestX = footX;
        bestY = footY;
      }
    }
    const distance = Math.sqrt(bestSquared);
    const inside = this.contains(x, y);
    const dirX = inside ? bestX - x : x - bestX;
    const dirY = inside ? bestY - y : y - bestY;
    const length = Math.hypot(dirX, dirY) || 1;
    out.distance = inside ? distance : -distance;
    out.normalX = dirX / length;
    out.normalY = dirY / length;
    return out;
  }

  contains(x: number, y: number): boolean {
    const theta = Math.atan2(y - CENTER.y, x - CENTER.x);
    return Math.hypot(x - CENTER.x, y - CENTER.y) <= this.radiusAt(theta);
  }

  contour(segments: number): Float32Array {
    const points = new Float32Array(segments * 2);
    for (let index = 0; index < segments; index++) {
      const theta = (index / segments) * Math.PI * 2;
      const radius = this.radiusAt(theta);
      points[index * 2] = CENTER.x + Math.cos(theta) * radius;
      points[index * 2 + 1] = CENTER.y + Math.sin(theta) * radius;
    }
    return points;
  }
}

function alphaOf(
  pixels: Uint8ClampedArray,
  resolution: number,
  column: number,
  row: number,
): number {
  return pixels[(row * resolution + column) * 4 + 3];
}

describe('habitat ışıma rasteri', () => {
  const resolution = 128;
  const domain = new StarDomain();
  const raster = rasterizeHabitatGlow(domain, RECT, resolution, STYLE);
  const cell = RECT.width / resolution;
  const sample: DomainSample = { distance: 0, normalX: 1, normalY: 0 };

  /*
   * Eski kusur: kontur noktalarını normal yönünde öteleyip çizgiyle bağlamak,
   * keskin iç bükeyde çaprazlanan noktalar üretiyor ve düz kiriş habitatın
   * İÇİNDEN geçiyordu. Bu test tam olarak onu arar.
   */
  it('habitat içinde geçiş bandından uzakta hiçbir piksel ışımaz (kiriş yok)', () => {
    const offenders: string[] = [];
    for (let row = 0; row < resolution; row++) {
      for (let column = 0; column < resolution; column++) {
        const distance = domain.sampleDistanceAndNormal(
          RECT.x + (column + 0.5) * cell,
          RECT.y + (row + 0.5) * cell,
          sample,
        ).distance;
        if (distance <= STYLE.interiorFadeUnits) continue;
        const alpha = alphaOf(raster.pixels, resolution, column, row);
        if (alpha !== 0) offenders.push(`(${column},${row}) d=${distance.toFixed(1)} α=${alpha}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('kıyı boyunca yoğun örneklemede vurgu kesintisizdir', () => {
    const contour = domain.contour(720);
    let minimumAlpha = 255;
    for (let index = 0; index < contour.length; index += 2) {
      const column = Math.floor((contour[index] - RECT.x) / cell);
      const row = Math.floor((contour[index + 1] - RECT.y) / cell);
      minimumAlpha = Math.min(minimumAlpha, alphaOf(raster.pixels, resolution, column, row));
    }
    expect(minimumAlpha).toBeGreaterThan(0);
  });

  it('Void tarafında alfa |d| arttıkça monoton azalır', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let distance = 0; distance >= -160; distance -= 2) {
      const alpha = alphaAt(distance, STYLE);
      expect(alpha).toBeLessThanOrEqual(previous + 1e-12);
      previous = alpha;
    }
    expect(alphaAt(-160, STYLE)).toBeLessThan(alphaAt(-8, STYLE));
  });

  it('aynı girdi aynı baytı üretir', () => {
    const again = rasterizeHabitatGlow(domain, RECT, resolution, STYLE);
    expect(again.pixels).toEqual(raster.pixels);
  });

  /* Bölme yalnız işi yayar: birleşen bantlar tek seferlik rasterin AYNI baytı olmalı. */
  it('satır bantlarıyla parçalı rasterleme tek seferlikle bayt bayt aynıdır', () => {
    const chunked = new Uint8ClampedArray(resolution * resolution * 4);
    for (let row = 0; row < resolution; row += 7) {
      rasterizeHabitatGlowRows(
        domain,
        RECT,
        resolution,
        STYLE,
        chunked,
        row,
        Math.min(7, resolution - row),
      );
    }

    expect(chunked).toEqual(raster.pixels);
  });

  it('bandı taşıran satır aralığı reddedilir', () => {
    const target = new Uint8ClampedArray(8 * 8 * 4);
    expect(() => rasterizeHabitatGlowRows(domain, RECT, 8, STYLE, target, -1, 1)).toThrow(
      RangeError,
    );
    expect(() => rasterizeHabitatGlowRows(domain, RECT, 8, STYLE, target, 8, 1)).toThrow(
      RangeError,
    );
    expect(() => rasterizeHabitatGlowRows(domain, RECT, 8, STYLE, target, 0, 9)).toThrow(
      RangeError,
    );
    expect(() => rasterizeHabitatGlowRows(domain, RECT, 8, STYLE, target, 0, 0)).toThrow(
      RangeError,
    );
  });

  it('geçersiz çözünürlük, tampon ve stil reddedilir', () => {
    expect(() => rasterizeHabitatGlow(domain, RECT, 1, STYLE)).toThrow(RangeError);
    expect(() => rasterizeHabitatGlow(domain, RECT, 8, STYLE, new Uint8ClampedArray(4))).toThrow(
      RangeError,
    );
    expect(() => rasterizeHabitatGlow(domain, RECT, 8, { ...STYLE, decayUnits: 0 })).toThrow(
      RangeError,
    );
    expect(() => rasterizeHabitatGlow(domain, RECT, 8, { ...STYLE, shoreAlpha: 2 })).toThrow(
      RangeError,
    );
  });
});

const RENDERER_RESOLUTION = 64;

describe('HabitatRenderer', () => {
  function harness() {
    const graphics = {
      lineStyle: vi.fn(),
      strokePoints: vi.fn(),
      setDepth: vi.fn(),
      destroy: vi.fn(),
    };
    graphics.setDepth.mockReturnValue(graphics);
    const image = {
      setOrigin: vi.fn(() => image),
      setDisplaySize: vi.fn(() => image),
      setDepth: vi.fn(() => image),
      setAlpha: vi.fn((_alpha: number) => image),
      destroy: vi.fn(),
    };
    let created: ImageData | null = null;
    const texture = {
      context: {
        createImageData: (width: number, height: number) => {
          created = {
            data: new Uint8ClampedArray(width * height * 4),
            width,
            height,
          } as ImageData;
          return created;
        },
      },
      setFilter: vi.fn(),
      putData: vi.fn(),
      refresh: vi.fn(),
    };
    const textures = { createCanvas: vi.fn(() => texture), remove: vi.fn() };
    const scene = { add: { image: vi.fn(() => image), graphics: vi.fn(() => graphics) }, textures };
    const starDomain = new StarDomain(512);
    const renderer = new HabitatRenderer(scene as never, starDomain, RECT, {
      ...STYLE,
      resolution: RENDERER_RESOLUTION,
      // Sıfır bütçe: do-while bir satır işleyip çıkar, yani kare başına TAM bir satır.
      rasterBudgetMs: 0,
      pulsePeriodMs: 9000,
      pulseAlphaMin: 0.05,
      pulseAlphaMax: 0.16,
    });
    return {
      renderer,
      scene,
      image,
      texture,
      textures,
      graphics,
      starDomain,
      imageData: created as unknown as ImageData,
    };
  }

  it('dokuyu bir kez kurar ve destroy’da siler', () => {
    const { renderer, textures, image } = harness();

    expect(textures.createCanvas).toHaveBeenCalledOnce();
    renderer.destroy();
    renderer.destroy();

    expect(image.destroy).toHaveBeenCalledOnce();
    expect(textures.remove).toHaveBeenCalledOnce();
  });

  /* DESIGN §18: yükleme ana iş parçacığını kilitlemez — raster kurulumda KOŞMAZ. */
  it('kurulumda rasterlemez, dokuyu kare kare doldurur', () => {
    const { renderer, texture } = harness();

    expect(texture.putData).not.toHaveBeenCalled();
    expect(renderer.rasterComplete).toBe(false);
    for (let frame = 1; frame < RENDERER_RESOLUTION; frame++) renderer.update(frame * 16);
    expect(renderer.rasterComplete).toBe(false);
    renderer.update(RENDERER_RESOLUTION * 16);

    expect(renderer.rasterComplete).toBe(true);
    expect(texture.putData).toHaveBeenCalledTimes(RENDERER_RESOLUTION);
  });

  it('kareye yayılmış doku tek seferlik rasterle bayt bayt aynıdır', () => {
    const { renderer, starDomain, imageData } = harness();

    while (!renderer.rasterComplete) renderer.update(16);

    expect(imageData.data).toEqual(
      rasterizeHabitatGlow(starDomain, RECT, RENDERER_RESOLUTION, STYLE).pixels,
    );
  });

  /* Kontur-öteleme yolunun GERİ GELMEDİĞİNİ kanıtlar. */
  it('hiçbir zaman strokePoints ya da lineStyle çağırmaz', () => {
    const { renderer, scene, graphics } = harness();
    renderer.update(1234);

    expect(scene.add.graphics).not.toHaveBeenCalled();
    expect(graphics.strokePoints).not.toHaveBeenCalled();
    expect(graphics.lineStyle).not.toHaveBeenCalled();
  });

  it('nabız yalnız alfayı oynatır ve sonlu olmayan zamanı yok sayar', () => {
    const { renderer, image } = harness();
    const before = image.setAlpha.mock.calls.length;

    renderer.update(4500);
    renderer.update(Number.NaN);

    expect(image.setAlpha.mock.calls.length).toBe(before + 1);
    const alpha = image.setAlpha.mock.calls.at(-1)?.[0] as number;
    expect(alpha).toBeGreaterThanOrEqual(0.05);
    expect(alpha).toBeLessThanOrEqual(0.16);
  });
});
