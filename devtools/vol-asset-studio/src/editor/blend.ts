import type { Rgba } from './RasterSurface';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add';

export const BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'add',
] as const;

/** Tek kanal için blend fonksiyonu; girdiler 0..255. */
type ChannelBlend = (base: number, source: number) => number;

const CHANNEL: Record<BlendMode, ChannelBlend> = {
  normal: (_base, source) => source,
  multiply: (base, source) => (base * source) / 255,
  screen: (base, source) => 255 - ((255 - base) * (255 - source)) / 255,
  // Overlay, tabanın açıklığına göre multiply ve screen arasında geçer.
  overlay: (base, source) =>
    base <= 127.5 ? (2 * base * source) / 255 : 255 - (2 * (255 - base) * (255 - source)) / 255,
  add: (base, source) => Math.min(255, base + source),
};

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

/**
 * Kaynak pikseli hedefin ÜSTÜNE karıştırır (source-over, unpremultiplied).
 *
 * Kanallar unpremultiplied tutulur: premultiply edip geri çevirmek düşük
 * alfada yuvarlama hatası biriktirir ve pixel-art'ta görünür kenar kirliliği
 * yaratır. Alfa birleşimi standart `a + b(1-a)`, renk ise sonuç alfasına göre
 * yeniden normalize edilir.
 */
export function blendPixel(base: Rgba, source: Rgba, mode: BlendMode, opacity: number): Rgba {
  const sourceAlpha = (source.a / 255) * Math.max(0, Math.min(1, opacity));
  if (sourceAlpha <= 0) return base;
  const baseAlpha = base.a / 255;
  const outAlpha = sourceAlpha + baseAlpha * (1 - sourceAlpha);
  if (outAlpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };

  const channel = CHANNEL[mode];
  const mix = (baseChannel: number, sourceChannel: number): number => {
    // Blend fonksiyonu yalnız tabanın GÖRÜNÜR olduğu yerde anlamlıdır; boş
    // zeminde `multiply` her şeyi siyaha çevirirdi.
    const blended = baseAlpha > 0 ? channel(baseChannel, sourceChannel) : sourceChannel;
    const value =
      (sourceAlpha * (1 - baseAlpha) * sourceChannel +
        sourceAlpha * baseAlpha * blended +
        (1 - sourceAlpha) * baseAlpha * baseChannel) /
      outAlpha;
    return clampByte(value);
  };

  return {
    r: mix(base.r, source.r),
    g: mix(base.g, source.g),
    b: mix(base.b, source.b),
    a: clampByte(outAlpha * 255),
  };
}

/**
 * Bütün bir RGBA tamponunu hedefin üstüne karıştırır.
 *
 * Tek pikselde `blendPixel` çağırmak yerine döngü burada kalır: her piksel
 * için nesne ayırmak 2048² belgede dört milyon geçici nesne demektir.
 */
export function blendBuffer(
  target: Uint8ClampedArray,
  source: Uint8ClampedArray,
  mode: BlendMode,
  opacity: number,
): void {
  if (target.length !== source.length) throw new RangeError('Tampon boyutları eşleşmiyor');
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  if (clampedOpacity === 0) return;
  const channel = CHANNEL[mode];

  for (let index = 0; index < target.length; index += 4) {
    const sourceAlpha = (source[index + 3] / 255) * clampedOpacity;
    if (sourceAlpha <= 0) continue;
    const baseAlpha = target[index + 3] / 255;
    const outAlpha = sourceAlpha + baseAlpha * (1 - sourceAlpha);
    if (outAlpha <= 0) {
      target[index + 3] = 0;
      continue;
    }
    for (let offset = 0; offset < 3; offset += 1) {
      const baseChannel = target[index + offset];
      const sourceChannel = source[index + offset];
      const blended = baseAlpha > 0 ? channel(baseChannel, sourceChannel) : sourceChannel;
      target[index + offset] = clampByte(
        (sourceAlpha * (1 - baseAlpha) * sourceChannel +
          sourceAlpha * baseAlpha * blended +
          (1 - sourceAlpha) * baseAlpha * baseChannel) /
          outAlpha,
      );
    }
    target[index + 3] = clampByte(outAlpha * 255);
  }
}
