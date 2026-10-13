import { Defs, OL, circle, palette, poly, pt, rim, rounded, shape, svg, type Point } from './lib';

const AMBER = '#f2b544';
const TEAL = '#52f5cf';

/** Oyuncu: tırtıllı inşaat tankı "Mimar". Doğuya bakar; gövde 128×96 (2×1.5 karo). */
export const TANK_ART = {
  hull: { w: 128, h: 96, center: [64, 48] as Point },
  turret: { w: 112, h: 56, pivot: [32, 28] as Point },
  tread: { w: 32, h: 20 },
  /** Tırtıl şeritleri gövde sprite uzayında: yatay başlangıç, genişlik, üst ve alt şeridin y'si, yükseklik. */
  treadBand: { x: 14, w: 100, topY: 6, bottomY: 70, h: 20 },
} as const;

export function tankParts(): Record<string, string> {
  const out: Record<string, string> = {};

  {
    const d = new Defs('hu');
    const p = palette(d);
    const glacis = d.linear(
      'glacis',
      [
        [0, '#3a4958'],
        [1, '#8aa0b4'],
      ],
      [0, 0, 1, 0],
    );
    let s = '';
    // Tırtıl yuvaları: koyu, kalın çerçeve; şerit görseli oyunda üstüne kayar.
    for (const y of [3, 69]) {
      s += shape(rounded(8, y, 112, 24, 11), '#0e1317', 3.6);
      s += `    <rect x="${TANK_ART.treadBand.x - 2}" y="${y + 2}" width="${TANK_ART.treadBand.w + 4}" height="20" rx="8" fill="#0a0e11" opacity=".0"/>\n`;
    }
    // Gövde
    s += shape('M22 24H98L124 38V58L98 72H22L8 62V34Z', p.steel, 3.8);
    s += rim('M24 28H96', 0.4, 2.6);
    s += shape('M98 26L120 39V57L98 70Z', glacis, 2.8);
    s += rim('M100 32L116 41', 0.4, 2);
    s += `    <path d="M104 40L110 48L104 56M111 40L117 48L111 56" fill="none" stroke="${AMBER}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>\n`;
    s += shape(rounded(116, 41, 8, 14, 3), p.teal, 2);
    // Arka motor kabuğu: üç erik plaka
    for (const [x, w] of [
      [12, 12],
      [26, 12],
      [40, 12],
    ]) {
      s += shape(
        `M${x} 32C${x + 4} 30 ${x + w - 2} 30 ${x + w} 32V64C${x + w - 2} 66 ${x + 4} 66 ${x} 64Z`,
        p.plum,
        2.6,
      );
      s += `    <path d="M${x + 2} 40C${x + 5} 43 ${x + w - 4} 43 ${x + w - 1} 40" fill="none" stroke="${TEAL}" stroke-width="2.2" stroke-linecap="round" stroke-opacity=".8"/>\n`;
    }
    // Torete yatağı
    s += circle(64, 48, 24, '#0a0e12', 3.4);
    s += `    <circle cx="64" cy="48" r="20" fill="none" stroke="#1d3a36" stroke-width="3.6"/>\n`;
    s += `    <circle cx="64" cy="48" r="24" fill="none" stroke="#4d5e6e" stroke-width="1.8" stroke-opacity=".8"/>\n`;
    // Yan amber işaret
    for (const y of [28, 68])
      s += `    <rect x="72" y="${y - 1.6}" width="14" height="3.2" rx="1.6" fill="${AMBER}" fill-opacity=".85"/>\n`;
    out['tank-hull'] = svg('Mimar gövde', TANK_ART.hull.w, TANK_ART.hull.h, d.toString(), s);
  }

  {
    const d = new Defs('tt');
    const p = palette(d);
    const barrel = d.linear('barrel', [
      [0, '#8aa2b8'],
      [0.5, '#3f4f5f'],
      [1, '#1b232b'],
    ]);
    const dome = d.radial(
      'dome',
      [
        [0, '#9db4c8'],
        [0.5, '#46586a'],
        [1, '#1b232b'],
      ],
      [0.38, 0.32, 0.8],
    );
    let s = '';
    for (const y of [18, 38]) {
      s += shape(rounded(32, y - 4.4, 62, 8.8, 3.4), barrel, 2.8);
      s += shape(rounded(80, y - 5.8, 18, 11.6, 3), p.steelDark, 2.6);
      s += `    <rect x="94" y="${y - 3}" width="3" height="6" rx="1" fill="${TEAL}"/>\n`;
      s += rim(`M38 ${y - 2}H76`, 0.4, 1.8);
    }
    const body = Array.from({ length: 8 }, (_, i) =>
      pt(32, 28, 24, (i * Math.PI) / 4 + Math.PI / 8),
    );
    s += shape(poly(body), dome, 3.6);
    s += shape('M12 20C16 12 24 8 32 7C30 13 29 20 28 28C22 26 16 24 12 20Z', p.plum, 2.4);
    s += shape('M12 36C16 44 24 48 32 49C30 43 29 36 28 28C22 30 16 32 12 36Z', p.plumFlat, 2.4);
    s += circle(38, 28, 8, p.teal, 2.8);
    s += `    <circle cx="35.6" cy="25.6" r="2.2" fill="#fff" fill-opacity=".9"/>\n`;
    s += `    <rect x="6" y="24" width="9" height="8" rx="2" fill="#26303a" stroke="${OL}" stroke-width="2"/>\n`;
    out['tank-turret'] = svg('Mimar kule', TANK_ART.turret.w, TANK_ART.turret.h, d.toString(), s);
  }

  {
    const d = new Defs('tr');
    let s = `    <rect width="32" height="20" fill="#0e1317"/>\n`;
    for (const x of [1, 17]) {
      s += `    <rect x="${x + 0.8}" y="1.6" width="12.4" height="16.8" rx="3" fill="#2b3640" stroke="${OL}" stroke-width="1.6"/>\n`;
      s += `    <rect x="${x + 2}" y="3" width="3.2" height="14" rx="1.4" fill="#6b7d8d"/>\n`;
      s += `    <rect x="${x + 6.4}" y="6" width="5" height="8" rx="1.6" fill="#1b232b"/>\n`;
    }
    out['tank-tread'] = svg('Mimar tırtıl', TANK_ART.tread.w, TANK_ART.tread.h, d.toString(), s);
  }

  {
    const d = new Defs('tl');
    const g = d.linear(
      'g',
      [
        [0, '#d8fff6', 0.55],
        [0.5, '#52f5cf', 0.18],
        [1, '#52f5cf', 0],
      ],
      [0, 0.5, 1, 0.5],
    );
    out['tank-light'] = svg(
      'Mimar far',
      160,
      120,
      d.toString(),
      `    <path d="M0 52L160 4V116L0 68Z" fill="${g}"/>\n`,
    );
  }
  {
    const d = new Defs('tm');
    const g = d.linear(
      'g',
      [
        [0, '#52f5cf', 0],
        [0.5, '#d8fff6', 1],
        [1, '#52f5cf', 0],
      ],
      [0, 0, 0, 1],
    );
    out['tank-beam'] = svg(
      'Mimar inşa ışını',
      64,
      16,
      d.toString(),
      `    <rect x="0" y="0" width="64" height="16" fill="${g}"/>\n`,
    );
  }
  return out;
}
