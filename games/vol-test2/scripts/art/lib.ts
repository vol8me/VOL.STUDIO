/**
 * Sanat seti çizim kitaplığı: dolgun, gradyanlı, kalın dış çizgili biçimler (vol-test tank dili).
 * Birim tasarım birimidir, 1 karo = 64; ışık sol üsttendir. Çıktı yalnız SVG metnidir ve deterministiktir:
 * `src/art/kit/*.svg` dosyaları bu kodun çıktısıdır, `tests/art/kit.test.ts` ikisinin eşitliğini sınar.
 */

export type Point = readonly [number, number];
export type GradientStop = readonly [offset: number, color: string, opacity?: number];

export const OL = '#0d1217';
export const f = (n: number): number => Math.round(n * 100) / 100;
export const pt = (cx: number, cy: number, r: number, a: number): [number, number] => [
  f(cx + r * Math.cos(a)),
  f(cy + r * Math.sin(a)),
];
export const poly = (points: readonly Point[]): string =>
  'M' + points.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L') + ' Z';

const stopTag = ([offset, color, opacity]: GradientStop): string =>
  `      <stop offset="${offset}" stop-color="${color}"${opacity === undefined ? '' : ` stop-opacity="${opacity}"`}/>`;

/** Gradyan tanımlarını toplar; her SVG kendi kimliklerini taşır (kimlikler dosya içinde tektir). */
export class Defs {
  private readonly items: string[] = [];

  constructor(private readonly prefix: string) {}

  id(name: string): string {
    return `${this.prefix}-${name}`;
  }

  linear(
    name: string,
    stops: readonly GradientStop[],
    [x1, y1, x2, y2]: readonly [number, number, number, number] = [0, 0, 0, 1],
  ): string {
    this.items.push(
      `    <linearGradient id="${this.id(name)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">\n${stops.map(stopTag).join('\n')}\n    </linearGradient>`,
    );
    return `url(#${this.id(name)})`;
  }

  radial(
    name: string,
    stops: readonly GradientStop[],
    [cx, cy, r]: readonly [number, number, number] = [0.4, 0.3, 0.8],
  ): string {
    this.items.push(
      `    <radialGradient id="${this.id(name)}" cx="${cx}" cy="${cy}" r="${r}">\n${stops.map(stopTag).join('\n')}\n    </radialGradient>`,
    );
    return `url(#${this.id(name)})`;
  }

  toString(): string {
    return this.items.length > 0 ? `  <defs>\n${this.items.join('\n')}\n  </defs>\n` : '';
  }
}

export const svg = (title: string, w: number, h: number, defs: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n  <title>${title}</title>\n${defs}${body}</svg>\n`;

export interface Palette {
  readonly steel: string;
  readonly steelDark: string;
  readonly plum: string;
  readonly plumFlat: string;
  readonly amber: string;
  readonly teal: string;
  readonly ember: string;
}

/** Ortak boya paleti (vol-test tank dilinden: çelik plaka, erik kabuk, turkuaz ve kehribar vurgu). */
export function palette(d: Defs): Palette {
  return {
    steel: d.linear('steel', [
      [0, '#6f8499'],
      [0.45, '#3a4958'],
      [1, '#202a33'],
    ]),
    steelDark: d.linear('steeld', [
      [0, '#3b4854'],
      [1, '#161d24'],
    ]),
    plum: d.radial(
      'plum',
      [
        [0, '#c0728a'],
        [0.55, '#6b3547'],
        [1, '#361823'],
      ],
      [0.4, 0.3, 0.85],
    ),
    plumFlat: d.linear('plumf', [
      [0, '#a85b73'],
      [1, '#4a2230'],
    ]),
    amber: d.linear('amber', [
      [0, '#ffd884'],
      [0.5, '#e0a132'],
      [1, '#8a5a14'],
    ]),
    teal: d.radial(
      'teal',
      [
        [0, '#effffb'],
        [0.4, '#52f5cf'],
        [1, '#0c5c4b'],
      ],
      [0.4, 0.4, 0.6],
    ),
    ember: d.radial(
      'ember',
      [
        [0, '#fff2d0'],
        [0.35, '#ff9a4a'],
        [1, '#8a1d10'],
      ],
      [0.4, 0.4, 0.6],
    ),
  };
}

/** Kalın dış çizgili dolgu: tek yol. */
export function shape(d: string, fill: string, strokeWidth = 3.4): string {
  return `    <path d="${d}" fill="${fill}" stroke="${OL}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>\n`;
}

/** Sol-üst parlak kenar çizgisi: hacim ipucu, ince ayrıntı değil. */
export function rim(d: string, opacity = 0.4, strokeWidth = 2.4, color = '#ffffff'): string {
  return `    <path d="${d}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
}

export const circle = (
  cx: number,
  cy: number,
  r: number,
  fill: string,
  strokeWidth = 3,
  stroke = OL,
): string =>
  `    <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>\n`;

/** Kesik köşeli dikdörtgen. */
export const chamfer = (x: number, y: number, w: number, h: number, c: number): string =>
  poly([
    [x + c, y],
    [x + w - c, y],
    [x + w, y + c],
    [x + w, y + h - c],
    [x + w - c, y + h],
    [x + c, y + h],
    [x, y + h - c],
    [x, y + c],
  ]);

/** Yuvarlatılmış dikdörtgen yolu. */
export const rounded = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${f(x + r)} ${f(y)} H${f(x + w - r)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} V${f(y + h - r)} Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} H${f(x + r)} Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} V${f(y + r)} Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`;

/** İki daire arasında konik kapsül (x0→x1 yatay, y sabit): uzuv gövdesi için. */
export function limb(x0: number, x1: number, y: number, r0: number, r1: number): string {
  const length = x1 - x0;
  const theta = Math.asin((r0 - r1) / length);
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const at = [x0 + r0 * s, y - r0 * c];
  const bt = [x1 + r1 * s, y - r1 * c];
  const bb = [x1 + r1 * s, y + r1 * c];
  const ab = [x0 + r0 * s, y + r0 * c];
  return `M${f(at[0])} ${f(at[1])} L${f(bt[0])} ${f(bt[1])} A${f(r1)} ${f(r1)} 0 0 1 ${f(bb[0])} ${f(bb[1])} L${f(ab[0])} ${f(ab[1])} A${f(r0)} ${f(r0)} 0 0 1 ${f(at[0])} ${f(at[1])} Z`;
}
