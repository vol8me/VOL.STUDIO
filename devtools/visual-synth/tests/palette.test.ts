import { describe, it, expect } from 'vitest';
import { generatePalette, generateRamp } from '../src/color/generate';
import { isOklabInGamut, rgbToOklab } from '../src/color/oklab';
import { parseHexColor } from '../src/color/palette';

const lab = (hex: string) => {
  const [r, g, b] = parseHexColor(hex);
  return rgbToOklab(r, g, b);
};
const chroma = (hex: string): number => {
  const color = lab(hex);
  return Math.hypot(color.a, color.b);
};
const hue = (hex: string): number => {
  const color = lab(hex);
  return Math.atan2(color.b, color.a);
};

describe('rampa sentezi (§7.1)', () => {
  const BASE = '#6b5570';

  it('istenen adım sayısını üretir ve biçimi doğrudur', () => {
    const ramp = generateRamp({ base: BASE, steps: 5 });
    expect(ramp).toHaveLength(5);
    for (const color of ramp) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('parlaklık KOYUDAN AÇIĞA tekdüze artar', () => {
    const ramp = generateRamp({ base: BASE, steps: 6 });
    for (let i = 1; i < ramp.length; i++) {
      expect(lab(ramp[i]).L).toBeGreaterThan(lab(ramp[i - 1]).L);
    }
  });

  it('ton kayması gölge ile aydınlığı AYRIŞTIRIR — elle yapılmış görünmenin kaynağı', () => {
    const shifted = generateRamp({ base: BASE, steps: 5, hueShift: -25 });
    const flat = generateRamp({ base: BASE, steps: 5, hueShift: 0 });

    // Kaymasız rampada uçlar aynı tonda…
    expect(Math.abs(hue(flat[0]) - hue(flat[4]))).toBeLessThan(0.05);
    // …kaymalı rampada belirgin biçimde ayrışır.
    expect(Math.abs(hue(shifted[0]) - hue(shifted[4]))).toBeGreaterThan(0.5);
  });

  it('negatif kayma gölgeleri SOĞUTUR, aydınlıkları ısıtır', () => {
    const ramp = generateRamp({ base: BASE, steps: 5, hueShift: -25 });
    const middle = hue(ramp[2]);
    // Soğuk yön OKLab ton açısında AZALAN yöndür (kırmızıdan maviye).
    expect(hue(ramp[0])).toBeLessThan(middle);
    expect(hue(ramp[4])).toBeGreaterThan(middle);
  });

  it('doygunluk kemeri ortada zirve yapar, uçlarda düşer', () => {
    const arch = generateRamp({ base: BASE, steps: 5, satCurve: 'arch' });
    expect(chroma(arch[2])).toBeGreaterThan(chroma(arch[0]));
    expect(chroma(arch[2])).toBeGreaterThan(chroma(arch[4]));
  });

  it('flat kemer uygulamaz, rise açığa doğru artırır', () => {
    const flat = generateRamp({ base: BASE, steps: 5, satCurve: 'flat', hueShift: 0 });
    const rise = generateRamp({ base: BASE, steps: 5, satCurve: 'rise', hueShift: 0 });

    // `flat` uçlar arasında kemer yapmaz.
    expect(chroma(flat[2])).toBeCloseTo(chroma(flat[0]), 1);
    expect(chroma(rise[4])).toBeGreaterThan(chroma(rise[0]));
  });

  it('lightRange aralığı belirler', () => {
    const narrow = generateRamp({ base: BASE, steps: 4, lightRange: [0.4, 0.6] });
    expect(lab(narrow[0]).L).toBeCloseTo(0.4, 1);
    expect(lab(narrow[3]).L).toBeCloseTo(0.6, 1);
  });

  it('üretilen her renk GAMUT içindedir — kelepçelenmiş tekrar oluşmaz', () => {
    // Doygun bir tabanla uçlar gamut dışına taşar; doygunluk kısılmasaydı
    // kelepçe iki adımı aynı renge düşürürdü.
    const ramp = generateRamp({ base: '#ff0044', steps: 7, lightRange: [0.08, 0.97] });
    expect(new Set(ramp).size).toBe(ramp.length);
    for (const color of ramp) {
      const [r, g, b] = parseHexColor(color);
      expect(isOklabInGamut(rgbToOklab(r, g, b))).toBe(true);
    }
  });

  it('tek adım istenirse orta tonu verir', () => {
    const ramp = generateRamp({ base: BASE, steps: 1 });
    expect(ramp).toHaveLength(1);
    expect(lab(ramp[0]).L).toBeGreaterThan(0.4);
    expect(lab(ramp[0]).L).toBeLessThan(0.7);
  });

  it('deterministiktir', () => {
    const request = { base: BASE, steps: 5, hueShift: -18, satCurve: 'arch' } as const;
    expect(generateRamp(request)).toEqual(generateRamp(request));
  });
});

describe('palet birleştirme', () => {
  it('rampalar SIRAYLA kimlik alır ve 0 her zaman vardır', () => {
    const palette = generatePalette([
      { base: '#6b5570', steps: 3, name: 'govde' },
      { base: '#7d8f4a', steps: 4 },
    ]);

    expect(palette.colors).toHaveLength(7);
    expect(palette.ramps.map((ramp) => ramp.id)).toEqual([0, 1]);
    expect(palette.ramps[0].name).toBe('govde');
    expect(palette.ramps[1].name).toBeUndefined();
  });

  it('indeksler kendi rampalarına doğru işaret eder', () => {
    const palette = generatePalette([
      { base: '#6b5570', steps: 3 },
      { base: '#7d8f4a', steps: 2 },
    ]);

    expect(palette.ramps[0].indices).toEqual([0, 1, 2]);
    expect(palette.ramps[1].indices).toEqual([3, 4]);
    for (const ramp of palette.ramps) {
      for (const index of ramp.indices) {
        expect(palette.colors[index]).toBeDefined();
      }
    }
  });
});
