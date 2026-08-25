import { describe, it, expect } from 'vitest';
import {
  boxBlur,
  dilate,
  edgeMagnitude,
  erode,
  gaussBlur,
  sharpen,
} from '../../src/visualSynth/field/filter';
import { distanceTransform1d, signedDistanceField } from '../../src/visualSynth/field/distance';
import { compileTest } from './support';
import type { EdgeMode } from '../../src/visualSynth/field/sample';
import type { FieldNode } from '../../src/visualSynth/types';

const W = 9;
const H = 9;

function impulse(width = W, height = H): Float32Array {
  const data = new Float32Array(width * height);
  data[Math.floor(height / 2) * width + Math.floor(width / 2)] = 1;
  return data;
}

/** Referans uygulama: naif O(r²) kutu bulanıklığı. Koşan toplam buna uymalı. */
function naiveBoxBlur(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  edge: EdgeMode,
): Float32Array {
  const out = new Float32Array(source.length);
  const clampOrWrap = (value: number, size: number): number =>
    edge === 'wrap' ? ((value % size) + size) % size : Math.max(0, Math.min(size - 1, value));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          sum += source[clampOrWrap(y + dy, height) * width + clampOrWrap(x + dx, width)];
        }
      }
      out[y * width + x] = sum / ((2 * radius + 1) * (2 * radius + 1));
    }
  }
  return out;
}

describe('bulanıklık — koşan toplam (§5.3)', () => {
  it.each(['clamp', 'wrap'] as EdgeMode[])(
    '%s kenarında naif uygulamayla AYNI sonucu verir',
    (edge) => {
      // Koşan toplam bir optimizasyondur; doğruluğu referansla kanıtlanır.
      const source = new Float32Array(W * H);
      for (let i = 0; i < source.length; i++) source[i] = ((i * 37) % 11) / 10;

      const fast = Float32Array.from(source);
      boxBlur(fast, W, H, 2, edge);
      const reference = naiveBoxBlur(source, W, H, 2, edge);

      for (let i = 0; i < source.length; i++) expect(fast[i]).toBeCloseTo(reference[i], 5);
    },
  );

  it('toplam ağırlığı korur — dürtü kutuya yayılır', () => {
    const data = impulse();
    boxBlur(data, W, H, 1, 'clamp');
    let total = 0;
    for (const value of data) total += value;
    expect(total).toBeCloseTo(1, 5);
    expect(data[4 * W + 4]).toBeCloseTo(1 / 9, 5);
  });

  it('yarıçap bir pikselin altındaysa hiçbir şey yapmaz', () => {
    const data = impulse();
    boxBlur(data, W, H, 0, 'clamp');
    expect(data[4 * W + 4]).toBe(1);
  });

  it('gauss üç kutu geçişidir — kutudan daha geniş yayılır', () => {
    const box = impulse();
    const gauss = impulse();
    boxBlur(box, W, H, 1, 'clamp');
    gaussBlur(gauss, W, H, 1, 'clamp');

    // Merkez daha çok düşer, uzak komşu daha çok yükselir.
    expect(gauss[4 * W + 4]).toBeLessThan(box[4 * W + 4]);
    expect(gauss[4 * W + 1]).toBeGreaterThan(box[4 * W + 1]);
  });

  it('wrap kipi dürtüyü KARŞI kenardan çıkarır', () => {
    const data = new Float32Array(W * H);
    data[4 * W] = 1;
    boxBlur(data, W, H, 1, 'wrap');
    expect(data[4 * W + (W - 1)]).toBeGreaterThan(0);

    const clamped = new Float32Array(W * H);
    clamped[4 * W] = 1;
    boxBlur(clamped, W, H, 1, 'clamp');
    expect(clamped[4 * W + (W - 1)]).toBe(0);
  });
});

describe('morfoloji — monoton kuyruk', () => {
  it('dilate dürtüyü KAREye büyütür', () => {
    const data = impulse();
    dilate(data, W, H, 2, 'clamp');
    for (let y = 2; y <= 6; y++) {
      for (let x = 2; x <= 6; x++) expect(data[y * W + x]).toBe(1);
    }
    expect(data[4 * W + 1]).toBe(0);
    expect(data[1 * W + 4]).toBe(0);
  });

  it('erode tek boşluğu YUTAR', () => {
    const data = new Float32Array(W * H).fill(1);
    data[4 * W + 4] = 0;
    erode(data, W, H, 1, 'clamp');
    for (let y = 3; y <= 5; y++) {
      for (let x = 3; x <= 5; x++) expect(data[y * W + x]).toBe(0);
    }
    expect(data[4 * W + 2]).toBe(1);
  });

  it('dilate + erode kapama yapar: küçük boşluk dolar, dış sınır korunur', () => {
    const data = new Float32Array(W * H);
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) data[y * W + x] = 1;
    data[4 * W + 4] = 0;

    dilate(data, W, H, 1, 'clamp');
    erode(data, W, H, 1, 'clamp');

    expect(data[4 * W + 4]).toBe(1);
    expect(data[2 * W + 2]).toBe(1);
    expect(data[1 * W + 1]).toBe(0);
  });

  it('yarıçap bir pikselin altındaysa hiçbir şey yapmaz', () => {
    const data = impulse();
    dilate(data, W, H, 0, 'clamp');
    erode(data, W, H, 0, 'clamp');
    expect(data[4 * W + 4]).toBe(1);
  });
});

describe('kenar ve keskinleştirme', () => {
  it('edge yalnızca SINIRDA yanıt verir', () => {
    const data = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x >= 4) data[y * W + x] = 1;
    edgeMagnitude(data, W, H, 'clamp');

    expect(data[4 * W + 3]).toBeGreaterThan(0);
    expect(data[4 * W + 4]).toBeGreaterThan(0);
    expect(data[4 * W + 0]).toBe(0);
    expect(data[4 * W + 8]).toBe(0);
  });

  it('sharpen geçişi DİKLEŞTİRİR — klasik aşım deseni', () => {
    // Dürtü üzerinde sınamak yanıltıcıdır: bulanık bir dürtü düzgün bir
    // 3×3 blok olur ve o bloğun merkezi tekrar bulanıklaştırılınca DEĞİŞMEZ,
    // yani `orijinal − bulanık` sıfır çıkar. Anlamlı sınama bir KENAR üzerinde
    // yapılır.
    const data = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 4; x < W; x++) data[y * W + x] = 1;
    boxBlur(data, W, H, 1, 'clamp');

    const before = Float32Array.from(data);
    sharpen(data, W, H, 1, 1, 'clamp');

    // Karanlık taraf daha karanlık, aydınlık taraf daha aydınlık olur.
    expect(data[4 * W + 2]).toBeLessThan(before[4 * W + 2]);
    expect(data[4 * W + 5]).toBeGreaterThan(before[4 * W + 5]);
  });

  it('sharpen sıfır miktarda ya da sıfır yarıçapta değiştirmez', () => {
    const zeroAmount = impulse();
    sharpen(zeroAmount, W, H, 1, 0, 'clamp');
    expect(zeroAmount[4 * W + 4]).toBe(1);

    const zeroRadius = impulse();
    sharpen(zeroRadius, W, H, 0, 2, 'clamp');
    expect(zeroRadius[4 * W + 4]).toBe(1);
  });
});

describe('mesafe dönüşümü — Felzenszwalb (§5.4)', () => {
  it('tek boyutlu dönüşüm kare uzaklık verir', () => {
    const n = 7;
    const f = new Float64Array(n).fill(1e20);
    f[3] = 0;
    const out = new Float64Array(n);
    distanceTransform1d(f, out, n, new Int32Array(n + 1), new Float64Array(n + 2));
    expect(Array.from(out)).toEqual([9, 4, 1, 0, 1, 4, 9]);
  });

  it('İŞARETLİdir: içeride negatif, dışarıda pozitif', () => {
    const size = 33;
    const center = 16;
    const radius = 8;
    const source = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.hypot(x - center, y - center) <= radius) source[y * size + x] = 1;
      }
    }

    const signed = signedDistanceField(source, size, size, 0.5, false);

    // Merkezden en yakın DIŞ piksele uzaklık eksen üzerinde değil, hemen
    // yanındadır: hypot(8, 1) ≈ 8.06. Eksen boyunca 9 beklemek, mesafe
    // dönüşümünün gerçekten Öklid olduğunu gözden kaçırmak olurdu.
    expect(signed[center * size + center]).toBeCloseTo(-Math.hypot(radius, 1), 5);
    expect(signed[center * size + center + radius + 4]).toBeGreaterThan(0);
    expect(signed[center * size + center + radius]).toBeLessThanOrEqual(0);
  });

  it('İZOTROPİKtir — çapraz yönde Chamfer hatası birikmez', () => {
    // Chamfer yaklaşımının tipik hatası çapraz yönde ~%8'e çıkar; tam Öklid
    // dönüşümünde yatay ve çapraz mesafeler aynı yarıçapı verir.
    const size = 41;
    const center = 20;
    const source = new Float32Array(size * size);
    source[center * size + center] = 1;

    const signed = signedDistanceField(source, size, size, 0.5, false);
    const straight = signed[center * size + (center + 10)];
    const diagonal = signed[(center + 7) * size + (center + 7)];
    expect(straight).toBeCloseTo(10, 6);
    expect(diagonal).toBeCloseTo(Math.hypot(7, 7), 6);
  });

  it('wrap kipinde karşı kenar KOMŞU sayılır', () => {
    const size = 16;
    const source = new Float32Array(size * size);
    source[0] = 1;

    const wrapped = signedDistanceField(source, size, size, 0.5, true);
    const clamped = signedDistanceField(source, size, size, 0.5, false);

    // Sağ üst köşe sarmalı düzlemde bir piksel uzakta, düz düzlemde 15.
    expect(wrapped[size - 1]).toBeCloseTo(1, 6);
    expect(clamped[size - 1]).toBeCloseTo(15, 6);
  });
});

describe('filtreler ağacın düğümüdür', () => {
  it('blur yarıçapı BİRİM uzaydadır — çözünürlükle ölçeklenir', () => {
    const node: FieldNode = {
      kind: 'blur',
      radius: 0.1,
      input: {
        kind: 'step',
        edge: 0,
        input: { kind: 'gradient.linear', angle: 0, from: -0.001, to: 0.001 },
      },
    };
    // Aynı belge iki çözünürlükte aynı geçiş genişliğini vermeli.
    const small = compileTest(node, 'f', { width: 64, height: 64 });
    const large = compileTest(node, 'f', { width: 256, height: 256 });
    expect(small(0.05, 0)).toBeCloseTo(large(0.05, 0), 1);
    expect(small(-0.05, 0)).toBeCloseTo(large(-0.05, 0), 1);
  });

  it('distance bir rasterı SDF üreticisine çevirir', () => {
    const node: FieldNode = {
      kind: 'distance',
      input: { kind: 'sdf.circle', center: [0, 0], r: 0.5 },
    };
    const field = compileTest(node, 'd', { width: 128, height: 128 });
    // Kaynak dairenin merkezinde işaretli mesafe ≈ −yarıçap.
    expect(field(0, 0)).toBeCloseTo(-0.5, 1);
    expect(field(0.7, 0)).toBeGreaterThan(0);
  });

  it('erode + dilate maskeyi inceltip geri kalınlaştırır', () => {
    const source: FieldNode = { kind: 'sdf.circle', center: [0, 0], r: 0.5 };
    const eroded = compileTest({ kind: 'erode', radius: 0.1, input: source }, 'e', {
      width: 96,
      height: 96,
    });
    const dilated = compileTest({ kind: 'dilate', radius: 0.1, input: source }, 'd', {
      width: 96,
      height: 96,
    });

    // Kapsamaya çevrilmemiş ham SDF üzerinde: aşındırma değerleri düşürür
    // (daha çok negatif), genişletme yükseltir.
    expect(eroded(0, 0)).toBeLessThan(dilated(0, 0));
  });
});
