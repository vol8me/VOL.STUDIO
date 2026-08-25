import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSprite } from '../../src/visualSynth/render';
import { measureSprite } from '../../src/visualSynth/qa';
import type { FieldNode, LayerSpec, SpriteDoc } from '../../src/visualSynth/types';

const loadFixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf-8'),
  ) as unknown;

/** Tur 3 kanıtının ORTAK gövdesi: aynı katmanlar, aynı palet. */
const SHAPE: FieldNode = {
  kind: 'min',
  a: { kind: 'sdf.roundBox', center: [0, 0.15], half: [0.45, 0.5], r: 0.18 },
  b: { kind: 'sdf.circle', center: [0, -0.4], r: 0.34 },
};

const LAYERS: LayerSpec[] = [
  {
    id: 'govde',
    source: SHAPE,
    height: { kind: 'smoothstep', e0: 0.02, e1: -0.5, input: SHAPE },
    material: 0,
  },
];

const PALETTE = {
  generate: [{ base: '#6b5570', steps: 6, hueShift: -20, satCurve: 'arch' as const }],
};

const SHADE = {
  light: [-0.55, -0.7, 0.45] as const,
  strength: 0.6,
  ambient: 0.35,
  rim: 0.15,
  relief: 0.4,
};

function styled(size: [number, number], post: SpriteDoc['post']): SpriteDoc {
  return {
    schemaVersion: 1,
    size,
    seed: 99,
    palette: PALETTE,
    layers: LAYERS,
    shade: SHADE,
    post,
  } as SpriteDoc;
}

describe('Tur 3 kanıtı — stil ÇIKTININ özelliğidir (D2)', () => {
  const pixelArt = renderSprite(
    styled([64, 64], { dither: { kind: 'bayer4', amount: 0.15 }, quantize: { mode: 'ramp' } }),
  );
  const texture = renderSprite(styled([512, 512], { quantize: { mode: 'nearest' } }));

  it('aynı belge gövdesi iki stilde de PALET UYUMLUdur', () => {
    expect(measureSprite(pixelArt).pass).toBe(true);
    expect(measureSprite(texture).pass).toBe(true);
  });

  it('64² + bayer piksel sanatı, 512² + nearest pürüzsüz doku verir', () => {
    // Aynı gövde: kaplanan alanın ORANI iki çözünürlükte de aynı.
    const ratio = (result: typeof pixelArt): number =>
      Array.from(result.channels.coverage).filter((value) => value > 0).length /
      (result.width * result.height);
    expect(ratio(texture)).toBeCloseTo(ratio(pixelArt), 2);

    // Ayrışan tek şey stil: pürüzsüz doku belirgin biçimde daha çok ara ton
    // taşır, çünkü `nearest` rampa adımları ARASINI da paletten doldurur.
    const colorCount = (result: typeof pixelArt): number =>
      measureSprite(result).metrics.find((metric) => metric.id === 'colorCount')!.value;
    expect(colorCount(texture)).toBeGreaterThan(colorCount(pixelArt) / 2);
  });

  it('nearest kipi rampa DIŞINDAKİ paletten de renk ödünç alabilir', () => {
    const twoRamps: SpriteDoc = {
      ...styled([96, 96], { quantize: { mode: 'nearest' } }),
      palette: {
        generate: [
          { base: '#6b5570', steps: 3 },
          { base: '#6b5570', steps: 7, lightRange: [0.2, 0.86] },
        ],
      },
    } as SpriteDoc;

    const nearest = renderSprite(twoRamps);
    const ramp = renderSprite({ ...twoRamps, post: { quantize: { mode: 'ramp' } } } as SpriteDoc);

    const used = (result: typeof nearest): number =>
      measureSprite(result).metrics.find((metric) => metric.id === 'colorCount')!.value;
    // `ramp` yalnızca rampa 0'ın üç rengini kullanır; `nearest` ara tonlar
    // için ikinci rampanın renklerine de uzanır.
    expect(used(nearest)).toBeGreaterThan(used(ramp));
  });

  it('dither varken ve yokken çıktı GERÇEKTEN farklıdır', () => {
    const plain = renderSprite(styled([64, 64], { quantize: { mode: 'ramp' } }));
    expect(Array.from(pixelArt.rgba)).not.toEqual(Array.from(plain.rgba));
  });
});

describe('gölgeleme boru hattı', () => {
  const base = styled([48, 48], {});

  it('shade verilmezse gölge YÜKSEKLİĞİN kendisidir', () => {
    const unlit = renderSprite({ ...base, shade: undefined } as SpriteDoc);
    expect(unlit.normal).toBeNull();
    expect(unlit.shade).toBe(unlit.channels.height);
  });

  it('shade verilince normal hesaplanır ve gölge yükseklikten AYRILIR', () => {
    const lit = renderSprite(base);
    expect(lit.normal).not.toBeNull();
    expect(Array.from(lit.shade)).not.toEqual(Array.from(lit.channels.height));
  });

  it('ışık yönü gölgenin AĞIRLIK MERKEZİNİ taşır', () => {
    const brightestColumn = (light: readonly [number, number, number]): number => {
      const result = renderSprite({ ...base, shade: { ...SHADE, light, rim: 0 } } as SpriteDoc);
      let bestValue = -Infinity;
      let bestColumn = 0;
      for (let y = 0; y < result.height; y++) {
        for (let x = 0; x < result.width; x++) {
          const index = y * result.width + x;
          if (result.channels.coverage[index] === 0) continue;
          if (result.shade[index] > bestValue) {
            bestValue = result.shade[index];
            bestColumn = x;
          }
        }
      }
      return bestColumn;
    };

    expect(brightestColumn([-1, 0, 0.3])).toBeLessThan(brightestColumn([1, 0, 0.3]));
  });

  it('ao gölgeyi yalnızca AZALTIR', () => {
    const withoutAo = renderSprite(base);
    const withAo = renderSprite({
      ...base,
      shade: { ...SHADE, ao: { radius: 0.08, strength: 0.8 } },
    } as SpriteDoc);

    let lowered = 0;
    for (let i = 0; i < withAo.shade.length; i++) {
      expect(withAo.shade[i]).toBeLessThanOrEqual(withoutAo.shade[i] + 1e-6);
      if (withAo.shade[i] < withoutAo.shade[i] - 1e-6) lowered++;
    }
    expect(lowered).toBeGreaterThan(0);
  });
});

describe('dış çizgi silüeti değiştirir', () => {
  it('outside kipi kapsamayı BÜYÜTÜR, inside büyütmez', () => {
    const covered = (post: SpriteDoc['post']): number =>
      Array.from(renderSprite(styled([64, 64], post)).channels.coverage).filter((v) => v > 0)
        .length;

    const plain = covered({});
    expect(covered({ outline: { px: 2, mode: 'outside' } })).toBeGreaterThan(plain);
    expect(covered({ outline: { px: 2, mode: 'inside' } })).toBe(plain);
  });

  it('çizgi pikselleri rampayı ATLAR, kendi renk indeksini alır', () => {
    const result = renderSprite(
      styled([64, 64], { outline: { px: 1, mode: 'outside', colorIndex: 0 } }),
    );
    const [r, g, b] = [result.palette.rgb[0], result.palette.rgb[1], result.palette.rgb[2]];

    let checked = 0;
    for (let i = 0; i < result.outline!.length; i++) {
      if (result.outline![i] !== 1) continue;
      checked++;
      expect(result.rgba[i * 4]).toBe(r);
      expect(result.rgba[i * 4 + 1]).toBe(g);
      expect(result.rgba[i * 4 + 2]).toBe(b);
      expect(result.rgba[i * 4 + 3]).toBe(255);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('outline yoksa maske null kalır', () => {
    expect(renderSprite(styled([32, 32], {})).outline).toBeNull();
  });
});

describe('alt-yığın maske ve ikinci malzeme', () => {
  const PLAIN_PALETTE = {
    colors: ['#101010', '#404040', '#a0a0a0', '#204020', '#60a060'],
    ramps: [
      { id: 0, indices: [0, 1, 2] },
      { id: 1, indices: [3, 4] },
    ],
  };

  function doc(layer: LayerSpec): SpriteDoc {
    return {
      schemaVersion: 1,
      size: [48, 48],
      seed: 5,
      palette: PLAIN_PALETTE,
      layers: [layer],
    } as SpriteDoc;
  }

  it('alt-yığın maskesi katmanın tam cebrini kullanır', () => {
    // Maske: büyük daire EKSİ küçük daire → halka.
    const result = renderSprite(
      doc({
        id: 'govde',
        source: { kind: 'const', value: 1 },
        mask: {
          layers: [
            { id: 'dis', source: { kind: 'sdf.circle', r: 0.7 }, material: 0 },
            { id: 'ic', source: { kind: 'sdf.circle', r: 0.3 }, blend: 'sub', material: 0 },
          ],
        },
        material: 0,
      }),
    );

    const at = (x: number, y: number): number => result.channels.coverage[y * 48 + x];
    expect(at(24, 24)).toBe(0); // iç daire kesildi
    expect(at(24, 8)).toBe(1); // halka
    expect(at(1, 1)).toBe(0); // dış daire dışı
  });

  it('materialMask ikinci rampayı seçer', () => {
    const result = renderSprite(
      doc({
        id: 'govde',
        source: { kind: 'const', value: 1 },
        material: 0,
        materialAlt: 1,
        // Sağ yarı ikinci malzemeye düşer.
        materialMask: { kind: 'gradient.linear', angle: 0, from: -0.001, to: 0.001 },
        materialThreshold: 0.5,
      }),
    );

    expect(result.channels.material[24 * 48 + 8]).toBe(0);
    expect(result.channels.material[24 * 48 + 40]).toBe(1);
  });

  it('materialMask yoksa katman tek rampa yazar', () => {
    const result = renderSprite(
      doc({ id: 'govde', source: { kind: 'const', value: 1 }, material: 1 }),
    );
    expect(Array.from(result.channels.material).every((value) => value === 1)).toBe(true);
  });
});

describe('shaded fixture ölçülebilir kalır', () => {
  it('tam Tur 3 yığını palet uyumlu ve dış çizgisi kapalıdır', () => {
    const report = measureSprite(renderSprite(loadFixture('shaded')));
    expect(report.pass).toBe(true);
    expect(report.metrics.map((metric) => metric.id)).toContain('outlineContinuity');
    expect(report.metrics.map((metric) => metric.id)).toContain('contrast');
    expect(report.metrics.map((metric) => metric.id)).toContain('banding');
  });
});
