/**
 * OKLab renk uzayı — §5.6.
 *
 * Depoda renk uzayı matematiği hiç yoktu; palet sentezi (Tur 3) ve
 * en-yakın-renk nicemlemesi (Tur 3) bunun üstüne kurulur, kontrast ölçümü
 * (§9) de buradan okur.
 *
 * **Sık yapılan hata: gamma 2.2 üssü kullanmak.** sRGB'nin gerçek transfer
 * fonksiyonu PARÇALIdır ve koyu tonlarda doğrusal bir bölüm içerir. Üs
 * yaklaşımı koyu uçta gözle görülür sapma verir; palet rampalarının en koyu
 * iki adımı birbirine yapışır ve "algısal eşit adım" iddiası boşa düşer.
 */

export interface Oklab {
  /** Algısal parlaklık, 0..1. */
  readonly L: number;
  /** Yeşil–kırmızı ekseni. */
  readonly a: number;
  /** Mavi–sarı ekseni. */
  readonly b: number;
}

/** sRGB bileşenini (0..1) doğrusal ışığa çevirir — parçalı transfer. */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Doğrusal ışığı sRGB bileşenine (0..1) çevirir. */
export function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/** 0..255 sRGB üçlüsünü OKLab'a çevirir. */
export function rgbToOklab(r: number, g: number, b: number): Oklab {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab'ı DOĞRUSAL sRGB'ye çevirir; kelepçelenmemiş, gamut dışı olabilir. */
export function oklabToLinearRgb(color: Oklab): [number, number, number] {
  const l = (color.L + 0.3963377774 * color.a + 0.2158037573 * color.b) ** 3;
  const m = (color.L - 0.1055613458 * color.a - 0.0638541728 * color.b) ** 3;
  const s = (color.L - 0.0894841775 * color.a - 1.291485548 * color.b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/**
 * Renk sRGB gamutunun içinde mi?
 *
 * Palet sentezi buna bakarak doygunluğu kısar (§7.1). Kelepçelemek yerine
 * kısmak şart: kelepçelenen iki farklı adım aynı renge düşer ve rampada
 * görünmez bir tekrar oluşur.
 */
export function isOklabInGamut(color: Oklab): boolean {
  const epsilon = 1e-6;
  return oklabToLinearRgb(color).every((value) => value >= -epsilon && value <= 1 + epsilon);
}

/** OKLab'ı 0..255 sRGB üçlüsüne çevirir; gamut dışı sonuçlar kelepçelenir. */
export function oklabToRgb(color: Oklab): [number, number, number] {
  const encode = (value: number): number =>
    Math.max(0, Math.min(255, Math.round(linearToSrgb(value) * 255)));
  const [lr, lg, lb] = oklabToLinearRgb(color);
  return [encode(lr), encode(lg), encode(lb)];
}

/**
 * İki rengin OKLab uzayındaki Öklid uzaklığı.
 *
 * RGB uzaklığı algısal değildir: koyu mavilerde ve doygun kırmızılarda
 * gözle alakasız eşleşmeler üretir. En-yakın-renk nicemlemesi (Tur 3) ve
 * kontrast ölçümü (§9) bu fonksiyonu kullanır.
 */
export function oklabDistance(first: Oklab, second: Oklab): number {
  const dL = first.L - second.L;
  const da = first.a - second.a;
  const db = first.b - second.b;
  return Math.hypot(dL, da, db);
}
