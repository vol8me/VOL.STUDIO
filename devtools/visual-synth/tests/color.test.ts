import { describe, it, expect } from 'vitest';
import {
  linearToSrgb,
  oklabDistance,
  oklabToRgb,
  rgbToOklab,
  srgbToLinear,
} from '../src/color/oklab';
import { isPaletteColor, packRgb, parseHexColor, resolvePalette } from '../src/color/palette';
import { buildShadeTables, quantizeToRgba } from '../src/color/quantize';

describe('OKLab (§5.6)', () => {
  it('sRGB transfer fonksiyonu PARÇALIdır — gamma 2.2 üssü değil', () => {
    // Koyu uçtaki doğrusal bölüm: 0.04 için doğru değer 0.04/12.92'dir.
    // Gamma 2.2 yaklaşımı 0.00107 verirdi; fark üç katın üstünde ve palet
    // rampalarının en koyu iki adımını birbirine yapıştırırdı.
    expect(srgbToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 12);
    expect(Math.pow(0.04, 2.2)).toBeLessThan(srgbToLinear(0.04) / 2);

    // Üst bölüm üsseldir.
    expect(srgbToLinear(0.5)).toBeCloseTo(Math.pow((0.5 + 0.055) / 1.055, 2.4), 12);
  });

  it('transfer fonksiyonu tersiyle birlikte kimliktir', () => {
    // Standardın (IEC 61966-2-1) eşik sabitleri YUVARLANMIŞTIR: ileri yönde
    // 0.04045, ters yönde 0.0031308. Tam değerler birbirinin karşılığı
    // olmadığı için kırılma noktasında ~3e-8'lik bir süreksizlik vardır.
    // Sabitleri "düzeltmek" başka uygulamalarla ayrışmak demek olurdu;
    // hata 8-bit bir adımın (1/255) beş kat büyüklük altındadır.
    const eightBitStep = 1 / 255;
    for (const value of [0, 0.002, 0.04045, 0.2, 0.5, 1]) {
      const error = Math.abs(linearToSrgb(srgbToLinear(value)) - value);
      expect(error).toBeLessThan(eightBitStep / 1000);
    }
  });

  it('siyah ve beyaz beklenen L değerlerini verir', () => {
    expect(rgbToOklab(0, 0, 0).L).toBeCloseTo(0, 6);
    const white = rgbToOklab(255, 255, 255);
    expect(white.L).toBeCloseTo(1, 3);
    expect(white.a).toBeCloseTo(0, 3);
    expect(white.b).toBeCloseTo(0, 3);
  });

  it('RGB → OKLab → RGB gidiş-dönüşü rengi korur', () => {
    const samples: Array<[number, number, number]> = [
      [26, 20, 32],
      [107, 85, 112],
      [143, 174, 109],
      [255, 0, 0],
      [0, 128, 255],
    ];
    for (const [r, g, b] of samples) {
      expect(oklabToRgb(rgbToOklab(r, g, b))).toEqual([r, g, b]);
    }
  });

  it('gamut dışı sonuç kelepçelenir', () => {
    const [r, g, b] = oklabToRgb({ L: 1.4, a: 0.3, b: -0.3 });
    for (const channel of [r, g, b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });

  it('uzaklık simetriktir ve aynı renkte sıfırdır', () => {
    const a = rgbToOklab(30, 40, 50);
    const b = rgbToOklab(200, 40, 50);
    expect(oklabDistance(a, a)).toBe(0);
    expect(oklabDistance(a, b)).toBeCloseTo(oklabDistance(b, a), 12);
    expect(oklabDistance(a, b)).toBeGreaterThan(0);
  });

  it('algısal uzaklık koyu tonlarda RGB uzaklığından AYRIŞIR', () => {
    // İki çift RGB'de eşit uzaklıkta ama göze eşit görünmez; nicemlemenin
    // (Tur 3) OKLab'da yapılmasının gerekçesi budur.
    const darkGap = oklabDistance(rgbToOklab(0, 0, 0), rgbToOklab(40, 40, 40));
    const brightGap = oklabDistance(rgbToOklab(215, 215, 215), rgbToOklab(255, 255, 255));
    expect(darkGap).toBeGreaterThan(brightGap * 1.5);
  });
});

describe('palet (D6)', () => {
  it('hex ayrıştırma ve paketleme tutarlıdır', () => {
    expect(parseHexColor('#1a2b3c')).toEqual([0x1a, 0x2b, 0x3c]);
    expect(packRgb(0x1a, 0x2b, 0x3c)).toBe(0x1a2b3c);
    expect(packRgb(255, 255, 255)).toBe(0xffffff);
  });

  it('çözümlenmiş palet renkleri, rampaları ve kilit kümesini taşır', () => {
    const palette = resolvePalette({
      colors: ['#000000', '#808080', '#ffffff'],
      ramps: [{ id: 0, name: 'gri', indices: [0, 1, 2] }],
    });

    expect(palette.colorCount).toBe(3);
    expect(Array.from(palette.rgb)).toEqual([0, 0, 0, 128, 128, 128, 255, 255, 255]);
    expect(palette.ramps.get(0)).toEqual([0, 1, 2]);
    expect(isPaletteColor(palette, 128, 128, 128)).toBe(true);
    expect(isPaletteColor(palette, 129, 128, 128)).toBe(false);
  });
});

describe('nicemleme — boru hattının SON renk işlemi', () => {
  const palette = resolvePalette({
    colors: ['#000000', '#555555', '#aaaaaa', '#ffffff'],
    ramps: [{ id: 0, indices: [0, 1, 2, 3] }],
  });

  const tables = buildShadeTables(palette, 'ramp');

  function quantize(coverage: number[], shade: number[], material: number[]): Uint8ClampedArray {
    const out = new Uint8ClampedArray(coverage.length * 4);
    quantizeToRgba(
      Float32Array.from(coverage),
      Float32Array.from(shade),
      Uint8Array.from(material),
      palette,
      out,
      { tables },
    );
    return out;
  }

  it('gölge rampa adımına eşlenir ve uçlar kelepçelenir', () => {
    const out = quantize([1, 1, 1, 1, 1], [0, 0.3, 0.6, 1, 5], [0, 0, 0, 0, 0]);
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(out[4]).toBe(0x55);
    expect(out[8]).toBe(0xaa);
    // shade = 1 ve üstü son adımda kalır; taşarsa dizi dışına okurdu.
    expect(out[12]).toBe(0xff);
    expect(out[16]).toBe(0xff);
  });

  it('alfa 0 piksel RENK TAŞIMAZ', () => {
    // Görünmeyen bir renk bırakmak, kullanılan renk sayısını (§9) şişirir
    // ve indeksli PNG'ye gereksiz palet girdisi ekler.
    const out = quantize([0], [0.9], [0]);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });

  it('kısmi kapsama ALFAYA gider, renge değil', () => {
    const out = quantize([0.5], [1], [0]);
    expect(out[3]).toBe(128);
    expect(Array.from(out.slice(0, 3))).toEqual([255, 255, 255]);
  });

  it('tanımsız rampa sessizce geçmez', () => {
    expect(() => quantize([1], [0.5], [9])).toThrow(/rampa/);
  });
});
