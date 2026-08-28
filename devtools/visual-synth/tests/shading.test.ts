import { describe, it, expect } from 'vitest';
import { computeNormals } from '../src/shade/normal';
import { computeShade } from '../src/shade/lighting';
import { computeAo } from '../src/shade/ao';
import { computeOutline } from '../src/shade/outline';
import { createUnitSpace } from '../src/field/space';

const W = 17;
const H = 17;
const CENTER = 8 * W + 8;

function flat(value: number): Float32Array {
  return new Float32Array(W * H).fill(value);
}

/** Soldan sağa yükselen bir rampa — eğimi bilinen tek eksenli yüzey. */
function slope(width = W, rows = H): Float32Array {
  const data = new Float32Array(width * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = x / (width - 1);
  }
  return data;
}

describe('normal (§4.5)', () => {
  const space = createUnitSpace(W, H);

  it('düz yüzeyin normali doğrudan izleyiciye bakar', () => {
    const normals = computeNormals(flat(0.5), W, H, 1, space.pixelUnit, 'clamp');
    expect(normals.x[CENTER]).toBeCloseTo(0, 10);
    expect(normals.y[CENTER]).toBeCloseTo(0, 10);
    expect(normals.z[CENTER]).toBeCloseTo(1, 10);
  });

  it('normal her zaman BİRİM uzunluktadır', () => {
    const normals = computeNormals(slope(), W, H, 2, space.pixelUnit, 'clamp');
    for (let i = 0; i < W * H; i++) {
      expect(Math.hypot(normals.x[i], normals.y[i], normals.z[i])).toBeCloseTo(1, 6);
    }
  });

  it('yükselen yüzeyin normali eğimin TERSİNE yatar', () => {
    const normals = computeNormals(slope(), W, H, 1, space.pixelUnit, 'clamp');
    // Yükseklik +x yönünde artıyor → normal −x'e yatar.
    expect(normals.x[CENTER]).toBeLessThan(0);
    expect(normals.y[CENTER]).toBeCloseTo(0, 6);
  });

  it('relief arttıkça normal daha çok yatar', () => {
    const gentle = computeNormals(slope(), W, H, 0.5, space.pixelUnit, 'clamp');
    const steep = computeNormals(slope(), W, H, 4, space.pixelUnit, 'clamp');
    expect(Math.abs(steep.x[CENTER])).toBeGreaterThan(Math.abs(gentle.x[CENTER]));
  });

  it('eğim ÇÖZÜNÜRLÜKTEN bağımsızdır', () => {
    const small = createUnitSpace(65, 65);
    const large = createUnitSpace(257, 257);
    const smallHeight = slope(65, 65);
    const largeHeight = slope(257, 257);

    // Ham PİKSEL farkı çözünürlükle küçülür: dört kat yoğun ızgarada dört kat
    // küçüktür. Türev bu farktan alınsaydı aynı belge 257²'de dört kat yassı
    // görünürdü.
    const smallStep = smallHeight[32 * 65 + 33] - smallHeight[32 * 65 + 32];
    const largeStep = largeHeight[128 * 257 + 129] - largeHeight[128 * 257 + 128];
    expect(smallStep / largeStep).toBeCloseTo(4, 1);

    // Birim uzayda alınan türev ise aynı kalır (D2).
    const smallNormals = computeNormals(smallHeight, 65, 65, 1, small.pixelUnit, 'clamp');
    const largeNormals = computeNormals(largeHeight, 257, 257, 1, large.pixelUnit, 'clamp');
    const ratio = smallNormals.x[32 * 65 + 32] / largeNormals.x[128 * 257 + 128];
    // Kalan %1'lik fark rampanın kendisinden gelir: piksel MERKEZLERİ
    // örneklendiği için 65 ve 257 ızgara aynı birim aralığı tam olarak
    // kaplamaz.
    expect(ratio).toBeGreaterThan(0.98);
    expect(ratio).toBeLessThan(1.02);
  });
});

describe('ışıklandırma (§4.5)', () => {
  const space = createUnitSpace(W, H);
  const flatNormals = computeNormals(flat(0.5), W, H, 1, space.pixelUnit, 'clamp');

  it('doğrudan bakan ışık ambient + strength verir', () => {
    const shade = computeShade(flatNormals, W * H, {
      light: [0, 0, 1],
      strength: 0.6,
      ambient: 0.3,
      rim: 0,
    });
    expect(shade[CENTER]).toBeCloseTo(0.9, 6);
  });

  it('ışık yanlamasına gelince yayınık katkı düşer', () => {
    const shade = computeShade(flatNormals, W * H, {
      light: [1, 0, 0],
      strength: 0.6,
      ambient: 0.3,
      rim: 0,
    });
    // Düz yüzey ışığa dik → yayınık katkı sıfır, yalnızca ambient kalır.
    expect(shade[CENTER]).toBeCloseTo(0.3, 6);
  });

  it('ışık vektörü normalize edilir — uzunluğu sonucu değiştirmez', () => {
    const unit = computeShade(flatNormals, W * H, {
      light: [0, 0, 1],
      strength: 0.6,
      ambient: 0.2,
      rim: 0,
    });
    const long = computeShade(flatNormals, W * H, {
      light: [0, 0, 9],
      strength: 0.6,
      ambient: 0.2,
      rim: 0,
    });
    expect(long[CENTER]).toBeCloseTo(unit[CENTER], 10);
  });

  it('kenar ışığı YATIK yüzeyleri aydınlatır, düzleri değil', () => {
    const tilted = computeNormals(slope(), W, H, 6, space.pixelUnit, 'clamp');
    const options = { light: [0, 0, 1] as const, strength: 0, ambient: 0, rim: 1 };
    const flatShade = computeShade(flatNormals, W * H, options);
    const tiltedShade = computeShade(tilted, W * H, options);

    expect(flatShade[CENTER]).toBeCloseTo(0, 6);
    expect(tiltedShade[CENTER]).toBeGreaterThan(0.05);
  });

  it('gölge 0..1 dışına taşmaz', () => {
    const shade = computeShade(flatNormals, W * H, {
      light: [0, 0, 1],
      strength: 5,
      ambient: 3,
      rim: 2,
    });
    for (const value of shade) expect(value).toBeLessThanOrEqual(1);
  });

  it('emission palet öncesi aydınlığı artırır ve 1de doyar', () => {
    const base = computeShade(flatNormals, W * H, {
      light: [0, 0, 1],
      strength: 0,
      ambient: 0.2,
      rim: 0,
    });
    const lit = computeShade(flatNormals, W * H, {
      light: [0, 0, 1],
      strength: 0,
      ambient: 0.2,
      rim: 0,
      emission: 0.5,
    });
    expect(base[CENTER]).toBeCloseTo(0.2, 6);
    expect(lit[CENTER]).toBeCloseTo(0.7, 6);
  });
});

describe('örtüşme gölgesi (§4.5)', () => {
  it('düz yüzeyde örtüşme YOKTUR', () => {
    const occlusion = computeAo(flat(0.7), W, H, 3, 1, 'clamp');
    for (const value of occlusion) expect(value).toBeCloseTo(0, 6);
  });

  it('çukur örtülür, tümsek örtülmez', () => {
    const pit = flat(0.8);
    const bump = flat(0.2);
    for (let y = 6; y <= 10; y++) {
      for (let x = 6; x <= 10; x++) {
        pit[y * W + x] = 0.1;
        bump[y * W + x] = 0.9;
      }
    }

    expect(computeAo(pit, W, H, 4, 1, 'clamp')[CENTER]).toBeGreaterThan(0.2);
    expect(computeAo(bump, W, H, 4, 1, 'clamp')[CENTER]).toBeCloseTo(0, 6);
  });

  it('sıfır yarıçap ya da sıfır şiddet hiçbir şey yapmaz', () => {
    const pit = flat(0.8);
    pit[CENTER] = 0;
    expect(computeAo(pit, W, H, 0, 1, 'clamp')[CENTER]).toBe(0);
    expect(computeAo(pit, W, H, 4, 0, 'clamp')[CENTER]).toBe(0);
  });
});

describe('dış çizgi (§4.6)', () => {
  /** Ortada 5×5 dolu bir kare. */
  function square(): Float32Array {
    const data = new Float32Array(W * H);
    for (let y = 6; y <= 10; y++) for (let x = 6; x <= 10; x++) data[y * W + x] = 1;
    return data;
  }

  it('outside silüetin DIŞINDA halka çizer', () => {
    const mask = computeOutline(square(), W, H, 1, 'outside', 'clamp');
    expect(mask[5 * W + 8]).toBe(1);
    expect(mask[6 * W + 8]).toBe(0);
    expect(mask[CENTER]).toBe(0);
    // Köşeler de dolar: yapısal eleman KAREdir (8-komşuluk).
    expect(mask[5 * W + 5]).toBe(1);
  });

  it('inside silüetin İÇİNDE halka çizer', () => {
    const mask = computeOutline(square(), W, H, 1, 'inside', 'clamp');
    expect(mask[5 * W + 8]).toBe(0);
    expect(mask[6 * W + 8]).toBe(1);
    expect(mask[CENTER]).toBe(0);
  });

  it('centered her iki yana pay verir', () => {
    const mask = computeOutline(square(), W, H, 2, 'centered', 'clamp');
    expect(mask[5 * W + 8]).toBe(1);
    expect(mask[6 * W + 8]).toBe(1);
    expect(mask[CENTER]).toBe(0);
  });

  it('kalınlık arttıkça halka kalınlaşır', () => {
    const thin = computeOutline(square(), W, H, 1, 'outside', 'clamp');
    const thick = computeOutline(square(), W, H, 3, 'outside', 'clamp');
    const count = (mask: Uint8Array): number => mask.reduce((sum, value) => sum + value, 0);
    expect(count(thick)).toBeGreaterThan(count(thin) * 2);
  });

  it('sıfır kalınlık halka üretmez', () => {
    const mask = computeOutline(square(), W, H, 0, 'outside', 'clamp');
    expect(mask.every((value) => value === 0)).toBe(true);
  });

  it('halka KAPALIdır — silüetin her sınır pikselinin dışı işaretlenir', () => {
    const shape = square();
    const mask = computeOutline(shape, W, H, 1, 'outside', 'clamp');
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (shape[y * W + x] < 0.5) continue;
        const neighbours = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        for (const [nx, ny] of neighbours) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (shape[ny * W + nx] >= 0.5) continue;
          expect(mask[ny * W + nx], `boşluk: ${nx},${ny}`).toBe(1);
        }
      }
    }
  });
});
