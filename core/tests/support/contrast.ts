/**
 * WCAG 2.x göreli parlaklık ve kontrast oranı. Saydam (8 haneli) renkler bir
 * zemin üstünde `composite` ile birleştirilir: kontrast SON renk üzerinden
 * ölçülür, yalnız hex çiftinden değil.
 */
type Rgb = readonly [number, number, number];

export function parseHex(value: string): { rgb: Rgb; alpha: number } {
  const hex = value.replace('#', '');
  if (!/^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) throw new Error(`renk değil: ${value}`);
  const channel = (index: number): number => Number.parseInt(hex.slice(index, index + 2), 16);
  return {
    rgb: [channel(0), channel(2), channel(4)],
    alpha: hex.length === 8 ? channel(6) / 255 : 1,
  };
}

/** `foreground` (alfa dahil) rengini opak `background` üstüne bindirir. */
export function composite(foreground: string, background: string): Rgb {
  const top = parseHex(foreground);
  const bottom = parseHex(background);
  if (bottom.alpha !== 1) throw new Error('zemin opak olmalı');
  return [0, 1, 2].map((index) =>
    Math.round(top.rgb[index] * top.alpha + bottom.rgb[index] * (1 - top.alpha)),
  ) as unknown as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const linear = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Ön renk (alfalı olabilir) ile opak zemin arasındaki WCAG kontrast oranı. */
export function contrastRatio(foreground: string, background: string): number {
  const back = parseHex(background).rgb;
  const front = composite(foreground, background);
  const [light, dark] = [luminance(front), luminance(back)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
