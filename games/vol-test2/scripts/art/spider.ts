import { Defs, circle, limb, palette, rim, shape, svg, type Point } from './lib';

const K = 1.15;
const scaled = (value: number): number => Math.round(value * K * 10) / 10;
/** Tuval boyutu tam birimdir: kesirli viewBox rasterlemede bulanıklık ve yuvarlama kayması yaratır. */
const canvas = (value: number): number => Math.ceil(value * K);

/**
 * Bağlantı noktaları (tasarım birimi). `src/actors/spiderRig.ts` aynı sayıları taşır ve
 * `tests/actors/spiderRig.test.ts` ikisinin eşitliğini sınar: bir parçanın yeniden çizilmesi rig'i
 * sessizce bozmaz.
 */
export const SPIDER_ART = {
  femur: { w: 72, h: 32, a: [15, 16] as Point, b: [59, 16] as Point },
  tibia: { w: 84, h: 30, a: [13, 15] as Point, tip: [77, 15] as Point },
  carapace: {
    w: canvas(116),
    h: canvas(108),
    center: [scaled(58), scaled(54)] as Point,
    hipsX: [80, 62, 42, 22].map(scaled),
    hipsY: [20, 14, 14, 22].map(scaled),
  },
  abdomen: {
    w: canvas(124),
    h: canvas(108),
    pivot: [scaled(112), scaled(54)] as Point,
    vent: [scaled(64), scaled(54)] as Point,
  },
  reactor: { w: 64, h: 64, center: [32, 32] as Point },
  shadow: { w: 192, h: 192, center: [96, 96] as Point },
} as const;

const EMBER = '#ff8a55';
const vein = (path: string): string =>
  `    <path d="${path}" fill="none" stroke="${EMBER}" stroke-width="2.4" stroke-linecap="round" stroke-opacity=".85"/>\n`;
const scaledGroup = (body: string): string => `  <g transform="scale(${K})">\n${body}  </g>\n`;

export function spiderParts(): Record<string, string> {
  const out: Record<string, string> = {};

  {
    const d = new Defs('fe');
    const p = palette(d);
    let s = '';
    s += shape(limb(15, 59, 16, 13.4, 10.6), p.steel);
    s += shape(limb(25, 50, 16, 7.4, 6.4), p.plum, 2.2);
    s += rim('M27 11.4L48 11.2', 0.45, 1.8);
    s += vein('M29 16H46');
    s += circle(15, 16, 10, p.amber, 3);
    s += circle(15, 16, 3.8, '#1a1410', 2);
    s += circle(59, 16, 8.2, p.steel, 3);
    s += circle(59, 16, 3.4, p.amber, 1.8);
    out['arachnid-femur'] = svg(
      'Örümcek uyluk',
      SPIDER_ART.femur.w,
      SPIDER_ART.femur.h,
      d.toString(),
      s,
    );
  }

  {
    const d = new Defs('ti');
    const p = palette(d);
    const bone = d.linear('bone', [
      [0, '#8a4458'],
      [1, '#2b121c'],
    ]);
    let s = '';
    s += shape(limb(13, 70, 15, 11.4, 5.6), p.steel);
    s += shape('M58 11.4C66 11 74 12.4 77 15C74 17.6 66 19 58 18.6Z', bone, 2.2);
    s += shape(limb(22, 50, 15, 7, 5.4), p.plum, 2.2);
    s += rim('M24 10.6L48 10.8', 0.45, 1.8);
    s += vein('M26 15H44');
    s += circle(13, 15, 10, p.amber, 3);
    s += circle(13, 15, 3.8, '#1a1410', 2);
    out['arachnid-tibia'] = svg(
      'Örümcek kaval',
      SPIDER_ART.tibia.w,
      SPIDER_ART.tibia.h,
      d.toString(),
      s,
    );
  }

  {
    const d = new Defs('ca');
    const p = palette(d);
    const bone = d.linear('bone', [
      [0, '#8a4458'],
      [1, '#2b121c'],
    ]);
    let s = '';
    for (const m of [-1, 1]) {
      const y = 54 + m * 17;
      s += shape(
        `M92 ${y}C102 ${y - m * 2} 111 ${y + m * 6} 112 ${y + m * 14}C106 ${y + m * 10} 98 ${y + m * 8} 90 ${y + m * 8}Z`,
        bone,
        2.8,
      );
    }
    s += shape('M106 54L98 34L76 18L46 14L24 21L12 40L12 68L24 87L46 94L76 90L98 74Z', p.plum, 3.8);
    s += rim('M20 38C24 30 32 24 44 20C56 17 64 17 74 21', 0.42, 2.6);
    s += shape('M36 54L48 31H74L90 54L74 77H48Z', p.plumFlat, 2.8);
    s += rim('M40 50L50 33H72', 0.4, 2.2);
    s += `    <path d="M28 40C34 44 38 48 42 54M28 68C34 64 38 60 42 54" fill="none" stroke="#1a0b12" stroke-width="2.8" stroke-linecap="round"/>\n`;
    s += `    <path d="M52 54H80" fill="none" stroke="${EMBER}" stroke-width="3" stroke-linecap="round" stroke-opacity=".9"/>\n`;
    s += circle(94, 43, 6.8, p.ember, 2.6);
    s += circle(94, 65, 6.8, p.ember, 2.6);
    s += circle(83, 34, 4.2, p.ember, 2.2);
    s += circle(83, 74, 4.2, p.ember, 2.2);
    s += `    <circle cx="92.4" cy="41" r="1.9" fill="#fff" fill-opacity=".85"/>\n    <circle cx="92.4" cy="63" r="1.9" fill="#fff" fill-opacity=".85"/>\n`;
    out['arachnid-carapace'] = svg(
      'Örümcek başgöğüs',
      SPIDER_ART.carapace.w,
      SPIDER_ART.carapace.h,
      d.toString(),
      scaledGroup(s),
    );
  }

  {
    const d = new Defs('ab');
    const p = palette(d);
    let s = '';
    s += shape(
      'M112 54C112 40 100 30 84 26C64 21 42 22 28 32C14 40 6 48 6 54C6 60 14 68 28 76C42 86 64 87 84 82C100 78 112 68 112 54Z',
      p.steelDark,
      3.8,
    );
    s += shape(
      'M12 54C12 48 16 43 28 36C36 32 42 31 46 31C42 42 42 66 46 77C42 77 36 76 28 72C16 65 12 60 12 54Z',
      p.plum,
      2.8,
    );
    for (const [x, w] of [
      [50, 13],
      [66, 13],
      [82, 12],
    ] as const) {
      s += shape(
        `M${x} 28C${x + 6} 27.6 ${x + w} 28 ${x + w} 28V80C${x + w} 80 ${x + 6} 80.4 ${x} 80C${x - 2} 64 ${x - 2} 44 ${x} 28Z`,
        p.steel,
        2.6,
      );
    }
    s += rim('M52 31C58 30.6 60 30.6 62 31', 0.45, 2);
    s += circle(64, 54, 16, '#1a0d0d', 3);
    s += circle(64, 54, 12, '#3a1410', 2);
    s += `    <path d="M102 41L108 54L102 67" fill="none" stroke="${EMBER}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".85"/>\n`;
    out['arachnid-abdomen'] = svg(
      'Örümcek karın',
      SPIDER_ART.abdomen.w,
      SPIDER_ART.abdomen.h,
      d.toString(),
      scaledGroup(s),
    );
  }

  {
    const d = new Defs('re');
    const g = d.radial(
      'g',
      [
        [0, '#fff2d0', 1],
        [0.25, '#ff9a4a', 0.95],
        [0.55, '#ff5a2a', 0.4],
        [1, '#ff5a2a', 0],
      ],
      [0.5, 0.5, 0.5],
    );
    out['arachnid-reactor'] = svg(
      'Örümcek reaktör parıltısı',
      SPIDER_ART.reactor.w,
      SPIDER_ART.reactor.h,
      d.toString(),
      `    <circle cx="32" cy="32" r="32" fill="${g}"/>\n`,
    );
  }

  {
    const d = new Defs('sh');
    const g = d.radial(
      'g',
      [
        [0, '#000', 0.5],
        [0.6, '#000', 0.28],
        [1, '#000', 0],
      ],
      [0.5, 0.5, 0.5],
    );
    out['arachnid-shadow'] = svg(
      'Örümcek gölge',
      SPIDER_ART.shadow.w,
      SPIDER_ART.shadow.h,
      d.toString(),
      `    <circle cx="96" cy="96" r="96" fill="${g}"/>\n`,
    );
  }

  return out;
}
