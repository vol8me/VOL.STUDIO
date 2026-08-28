import { describe, it, expect } from 'vitest';
import {
  BLUE_NOISE_SIZE,
  applyDither,
  bayerMatrix,
  blueNoiseTile,
  resolveDitherMatrix,
} from '../src/color/dither';
import { createRandom } from '@volstudio/core/random';

describe('Bayer matrisi (§5.5)', () => {
  it('2×2 özyinelemeden doğru çıkar', () => {
    // M2 = [[0, 2], [3, 1]] / 4
    expect(Array.from(bayerMatrix(2))).toEqual([0, 0.5, 0.75, 0.25]);
  });

  it('her boy 0..1 aralığında TAM bir permütasyondur', () => {
    for (const size of [2, 4, 8]) {
      const matrix = bayerMatrix(size);
      const total = size * size;
      expect(matrix.length).toBe(total);

      const seen = new Set(Array.from(matrix, (value) => Math.round(value * total)));
      expect(seen.size, `${size}×${size}`).toBe(total);
      expect(Math.min(...matrix)).toBe(0);
      expect(Math.max(...matrix)).toBeCloseTo((total - 1) / total, 10);
    }
  });

  it('4×4 matrisi 2×2 matrisinden TÜRETİLİR', () => {
    const small = bayerMatrix(2);
    const large = bayerMatrix(4);
    // Sol üst çeyreğin köşesi: 4·M2[0,0] + 0 = 0.
    expect(large[0]).toBe(0);
    // Sağ üst köşe: 4·M2[0,0] + 2 → 2/16.
    expect(large[2]).toBeCloseTo(2 / 16, 10);
    // Alt sol: 4·M2[0,0] + 3 → 3/16.
    expect(large[8]).toBeCloseTo(3 / 16, 10);
    expect(small.length).toBe(4);
  });
});

describe('mavi gürültü — void-and-cluster (§5.5)', () => {
  const tile = blueNoiseTile();

  it('karo tam bir permütasyondur ve saklanır', () => {
    expect(tile.length).toBe(BLUE_NOISE_SIZE * BLUE_NOISE_SIZE);
    const seen = new Set(tile);
    expect(seen.size).toBe(tile.length);
    // İkinci çağrı yeniden üretmez.
    expect(blueNoiseTile()).toBe(tile);
  });

  it('ortalaması 0.5 civarındadır', () => {
    let total = 0;
    for (const value of tile) total += value;
    expect(total / tile.length).toBeCloseTo(0.5, 2);
  });

  it('DÜŞÜK FREKANS enerjisi beyaz gürültüden belirgin şekilde AZDIR', () => {
    // Mavi gürültünün tanımı budur: yerel ortalamalar 0.5 etrafında sıkı
    // durur, yani desen kümelenmez. Hash tabanlı bir dizi bu testi geçemez —
    // §5.5'in "bu mavi gürültü DEĞİLDİR" uyarısı tam olarak bunu söyler.
    const size = BLUE_NOISE_SIZE;
    const random = createRandom(1234);
    const white = Float32Array.from({ length: size * size }, () => random.next());

    const localVariance = (values: Float32Array, window: number): number => {
      let sum = 0;
      let count = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let local = 0;
          for (let dy = 0; dy < window; dy++) {
            for (let dx = 0; dx < window; dx++) {
              local += values[((y + dy) % size) * size + ((x + dx) % size)];
            }
          }
          const mean = local / (window * window);
          sum += (mean - 0.5) * (mean - 0.5);
          count++;
        }
      }
      return sum / count;
    };

    const blue = localVariance(tile, 6);
    const noise = localVariance(white, 6);
    expect(blue).toBeLessThan(noise / 3);
  });

  it('deterministiktir — sabit tohumla üretilir (D5)', () => {
    const first = Array.from(blueNoiseTile().slice(0, 32));
    const second = Array.from(blueNoiseTile().slice(0, 32));
    expect(second).toEqual(first);
  });
});

describe('dither uygulaması', () => {
  it('none matris döndürmez, diğerleri doğru boyu verir', () => {
    expect(resolveDitherMatrix('none')).toBeNull();
    expect(resolveDitherMatrix('bayer2')?.size).toBe(2);
    expect(resolveDitherMatrix('bayer4')?.size).toBe(4);
    expect(resolveDitherMatrix('bayer8')?.size).toBe(8);
    expect(resolveDitherMatrix('blueNoise')?.size).toBe(BLUE_NOISE_SIZE);
  });

  it('düz bir gölgeyi matris deseniyle KIRAR', () => {
    const shade = new Float32Array(4 * 4).fill(0.5);
    applyDither(shade, 4, 4, resolveDitherMatrix('bayer2')!, 0.4);

    const seen = new Set(Array.from(shade, (value) => Number(value.toFixed(4))));
    expect(seen.size).toBe(4);
    // Sapma ±amount/2 ile sınırlı.
    for (const value of shade) {
      expect(value).toBeGreaterThanOrEqual(0.5 - 0.2 - 1e-6);
      expect(value).toBeLessThanOrEqual(0.5 + 0.2 + 1e-6);
    }
  });

  it('matris PİKSEL konumuna göre okunur — ölçeklenmez', () => {
    const wide = new Float32Array(8 * 2).fill(0.5);
    applyDither(wide, 8, 2, resolveDitherMatrix('bayer2')!, 0.4);
    // Desen iki pikselde bir tekrarlar.
    for (let x = 0; x < 8; x += 2) expect(wide[x]).toBeCloseTo(wide[0], 10);
  });

  it('sonuç 0..1 dışına taşmaz', () => {
    const shade = new Float32Array(16).fill(0.02);
    applyDither(shade, 4, 4, resolveDitherMatrix('bayer4')!, 1);
    for (const value of shade) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
