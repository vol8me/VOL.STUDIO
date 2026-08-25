/**
 * Palet sentezi — §7.1.
 *
 * Naif yol HSL'de parlaklığı adımlamaktır ve sonuç CANSIZ olur. Gerçek
 * piksel sanatçılarının yaptığı üç şey burada kodlanmıştır:
 *
 * 1. **Ton kayması.** Gölgeler bir yöne, aydınlıklar diğerine kayar. Tek
 *    renk rampası asla tek tonda kalmaz; elle yapılmış görünmenin TEK EN
 *    BÜYÜK etkeni budur.
 * 2. **Doygunluk kemeri.** Uçlarda doygunluk düşer, ortada zirve yapar. Düz
 *    doygunluk plastik görünür.
 * 3. **Algısal uzay.** OKLab'da eşit adım göze eşit görünür; HSL'de görünmez.
 */

import { lerp } from '../../math/interpolation';
import { isOklabInGamut, oklabToRgb, rgbToOklab, type Oklab } from './oklab';
import { parseHexColor } from './palette';

export type SatCurve = 'flat' | 'arch' | 'rise';

export interface RampRequest {
  /** `#rrggbb` — rampanın ton ve doygunluk kaynağı. */
  base: string;
  steps: number;
  /** DERECE. Negatif = gölgeler soğur, aydınlıklar ısınır. */
  hueShift?: number;
  satCurve?: SatCurve;
  /** OKLab L aralığı; varsayılan tam siyah/beyaza dayanmaz. */
  lightRange?: readonly [number, number];
  name?: string;
}

const DEFAULT_LIGHT_RANGE: readonly [number, number] = [0.18, 0.88];
const DEG_TO_RAD = Math.PI / 180;

/**
 * Doygunluk çarpanı.
 *
 * `arch` uçlarda 0.45'e iner, ortada 1'e çıkar. Sıfıra indirmek uçları griye
 * çevirir ve rampanın rengi kaybolur; 0.45 hem kemeri hissettirir hem tonu
 * korur.
 */
function saturationFactor(curve: SatCurve, t: number): number {
  if (curve === 'flat') return 1;
  if (curve === 'rise') return 0.35 + 0.65 * t;
  return 0.45 + 0.55 * Math.sin(Math.PI * t);
}

/**
 * Doygunluğu gamuta sığdırır.
 *
 * Kelepçelemek yerine KISMAK gerekir: gamut dışı iki farklı adım kelepçe
 * sonrası aynı renge düşer ve rampada görünmez bir tekrar oluşur — beş
 * adımlık bir rampa dört renk gibi davranır. İkili arama on adımda 8-bit
 * çözünürlüğün altına iner.
 */
function fitChroma(lightness: number, hue: number, chroma: number): Oklab {
  const at = (c: number): Oklab => ({
    L: lightness,
    a: c * Math.cos(hue),
    b: c * Math.sin(hue),
  });

  if (isOklabInGamut(at(chroma))) return at(chroma);

  let low = 0;
  let high = chroma;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (isOklabInGamut(at(mid))) low = mid;
    else high = mid;
  }
  return at(low);
}

/** Tek bir rampayı `#rrggbb` dizisi olarak üretir; sırası KOYUDAN AÇIĞA. */
export function generateRamp(request: RampRequest): string[] {
  const [r, g, b] = parseHexColor(request.base);
  const baseLab = rgbToOklab(r, g, b);
  const baseChroma = Math.hypot(baseLab.a, baseLab.b);
  const baseHue = Math.atan2(baseLab.b, baseLab.a);

  const shift = (request.hueShift ?? 0) * DEG_TO_RAD;
  const curve = request.satCurve ?? 'arch';
  const [lightLow, lightHigh] = request.lightRange ?? DEFAULT_LIGHT_RANGE;
  const steps = Math.max(1, Math.floor(request.steps));

  const colors: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = steps > 1 ? i / (steps - 1) : 0.5;
    const lightness = lerp(lightLow, lightHigh, t);
    // `1 − 2t`: en koyu adım +shift, en açık adım −shift alır. Negatif shift
    // gölgeleri soğutur, aydınlıkları ısıtır (§7.1 kural 1).
    const hue = baseHue + shift * (1 - 2 * t);
    const chroma = baseChroma * saturationFactor(curve, t);
    const [cr, cg, cb] = oklabToRgb(fitChroma(lightness, hue, chroma));
    colors.push(
      `#${cr.toString(16).padStart(2, '0')}${cg.toString(16).padStart(2, '0')}${cb
        .toString(16)
        .padStart(2, '0')}`,
    );
  }
  return colors;
}

export interface GeneratedPalette {
  colors: string[];
  ramps: Array<{ id: number; name?: string; indices: number[] }>;
}

/**
 * Birden çok rampayı tek palete birleştirir.
 *
 * Rampalar renk dizisine SIRAYLA eklenir ve kimlikleri 0'dan başlar; belgede
 * `material: 0` varsayılanı böylece her zaman geçerli olur.
 */
export function generatePalette(requests: readonly RampRequest[]): GeneratedPalette {
  const colors: string[] = [];
  const ramps: GeneratedPalette['ramps'] = [];

  requests.forEach((request, id) => {
    const generated = generateRamp(request);
    const indices = generated.map((color) => {
      colors.push(color);
      return colors.length - 1;
    });
    ramps.push(request.name === undefined ? { id, indices } : { id, name: request.name, indices });
  });

  return { colors, ramps };
}
