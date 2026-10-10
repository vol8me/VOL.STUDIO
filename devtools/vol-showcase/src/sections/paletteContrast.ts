/**
 * Palet sekmesinin karşıtlık çiftleri. Oranlar etkin kaplamanın ÇÖZÜMLENMİŞ token değerlerinden canlı hesaplanır;
 * saydam (alfalı) renkler önce zemine, zemin de sayfa zeminine bileşilir (`scripts/quality/uiTheme.mjs` ile aynı
 * yöntem: WCAG 2.x göreli parlaklık). Eşikler: normal metin 4.5, ikon/odak halkası/bileşen kenarlığı 3.
 */
export interface ContrastPair {
  /** Ön renk token'ı (`--vol-ui-*`). */
  readonly foreground: string;
  /** Zemin token'ı. */
  readonly background: string;
  /** En düşük oran: metin 4.5, metin dışı 3. */
  readonly min: 3 | 4.5;
}

const token = (name: string): string => `--vol-ui-${name}`;

const TEXT_TOKENS = ['text', 'text-secondary', 'text-muted'] as const;
const TEXT_SURFACES = ['bg', 'surface-1', 'surface-2', 'surface-3'] as const;
const SOLID_FAMILIES = [
  'brand',
  'support',
  'accent',
  'success',
  'warning',
  'danger',
  'info',
] as const;

/** Sayfa zemini; saydam renklerin son bileşim tabanı. */
export const BASE_BACKGROUND = token('bg');

function buildPairs(): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (const surface of TEXT_SURFACES) {
    for (const text of TEXT_TOKENS) {
      pairs.push({ foreground: token(text), background: token(surface), min: 4.5 });
    }
  }
  for (const family of SOLID_FAMILIES) {
    pairs.push({
      foreground: token(`on-${family}`),
      background: token(`${family}-solid`),
      min: 4.5,
    });
  }
  for (const surface of ['bg', 'surface-1'] as const) {
    pairs.push({ foreground: token('icon'), background: token(surface), min: 3 });
    pairs.push({ foreground: token('focus-ring'), background: token(surface), min: 3 });
  }
  pairs.push({ foreground: token('border-strong'), background: token('bg'), min: 3 });
  return pairs;
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = buildPairs();

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0–1. */
  readonly a: number;
}

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`; başka biçim (ör. `rgb()`, `var()`) çözülemez. */
export function parseHexColor(value: string): Rgba | null {
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (!match) return null;
  let hex = match[1];
  if (hex.length <= 4) hex = [...hex].map((digit) => digit + digit).join('');
  const channel = (index: number): number => Number.parseInt(hex.slice(index, index + 2), 16);
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: hex.length === 8 ? channel(6) / 255 : 1,
  };
}

/** `front`u opak `base` üstüne bindirir; kanallar kapıyla aynı biçimde yuvarlanır. */
function over(front: Rgba, base: Rgba): Rgba {
  const mix = (channel: number, under: number): number =>
    Math.round(channel * front.a + under * (1 - front.a));
  return { r: mix(front.r, base.r), g: mix(front.g, base.g), b: mix(front.b, base.b), a: 1 };
}

function luminance({ r, g, b }: Rgba): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * WCAG karşıtlık oranı. `base` saydam zeminin altındaki opak renktir; çözülemeyen bir değer `null` döndürür
 * (sahte bir oran yazılmaz).
 */
export function contrastRatio(foreground: string, background: string, base: string): number | null {
  const front = parseHexColor(foreground);
  const back = parseHexColor(background);
  const floor = parseHexColor(base);
  if (!front || !back || !floor) return null;
  const solidBack = over(back, floor);
  const solidFront = over(front, solidBack);
  const [light, dark] = [luminance(solidFront), luminance(solidBack)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export interface PairResult {
  /** Çözülemeyen token varsa `null`. */
  readonly ratio: number | null;
  readonly passes: boolean;
}

/** `read` bir token'ın çözümlenmiş değerini verir (ör. `getComputedStyle(root).getPropertyValue`). */
export function evaluatePair(pair: ContrastPair, read: (token: string) => string): PairResult {
  const ratio = contrastRatio(read(pair.foreground), read(pair.background), read(BASE_BACKGROUND));
  return { ratio, passes: ratio !== null && ratio >= pair.min };
}
