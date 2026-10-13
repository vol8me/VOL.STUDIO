import {
  Defs,
  OL,
  chamfer,
  circle,
  f,
  palette,
  poly,
  pt,
  rim,
  rounded,
  shape,
  svg,
  type Palette,
  type Point,
} from './lib';

const AMBER = '#f2b544';
const TEAL = '#52f5cf';

/** Köşe pedi: kalın çizgili küçük amber kare. */
const pad = (p: Palette, x: number, y: number, r = 5): string =>
  shape(
    `M${x - r} ${y - r + 1.5}L${x - r + 1.5} ${y - r}H${x + r - 1.5}L${x + r} ${y - r + 1.5}V${y + r - 1.5}L${x + r - 1.5} ${y + r}H${x - r + 1.5}L${x - r} ${y + r - 1.5}Z`,
    p.amber,
    2.4,
  );

export function buildingParts(): Record<string, string> {
  const out: Record<string, string> = {};

  /* ───────────── KONVEYÖR ───────────── */
  {
    const d = new Defs('cb');
    const p = palette(d);
    let s = '';
    s += shape(chamfer(2, 4, 60, 56, 8), p.steel, 3.6);
    s += rim('M10 8H54', 0.4, 2.4);
    s += shape(rounded(8, 15, 48, 34, 6), '#161d24', 2.8);
    s += `    <path d="M12 19H52" stroke="#000" stroke-opacity=".5" stroke-width="4" stroke-linecap="round"/>\n`;
    s += shape('M2 24H9V40H2Z', p.steelDark, 2.4);
    s += shape('M55 24H62V40H55Z', p.steelDark, 2.4);
    out['conveyor-base'] = svg('Konveyör zemin', 64, 64, d.toString(), s);
  }
  {
    // Kesintisiz bant: yatayda 64 birimde döner; ok başları tamamen içeride.
    const d = new Defs('cbl');
    const band = d.linear('band', [
      [0, '#7c8995'],
      [0.5, '#5d6975'],
      [1, '#434d57'],
    ]);
    let s = `    <rect x="0" y="0" width="64" height="32" fill="${band}"/>\n`;
    s += `    <rect x="0" y="0" width="64" height="4" fill="#fff" fill-opacity=".12"/>\n    <rect x="0" y="28" width="64" height="4" fill="#000" fill-opacity=".25"/>\n`;
    for (const x of [2, 26]) {
      s += `    <path d="M${x} 6L${x + 12} 16L${x} 26L${x + 8} 26L${x + 20} 16L${x + 8} 6Z" fill="${AMBER}" stroke="#7a5214" stroke-width="2" stroke-linejoin="round"/>
`;
      s += `    <path d="M${x + 2} 8L${x + 11} 16L${x + 5} 16L${x + 2} 12Z" fill="#fff" fill-opacity=".45"/>
`;
    }
    out['conveyor-belt'] = svg('Konveyör bant', 48, 32, d.toString(), s);
  }
  {
    const d = new Defs('cr');
    const p = palette(d);
    let s = '';
    for (const y of [4, 49]) {
      s += shape(rounded(2, y, 60, 11, 4), p.steel, 3);
      s += rim(`M8 ${y + 3.4}H56`, 0.4, 1.8);
      s += `    <rect x="12" y="${y + 3.4}" width="8" height="4" rx="1" fill="${AMBER}" fill-opacity=".9"/>\n    <rect x="44" y="${y + 3.4}" width="8" height="4" rx="1" fill="${AMBER}" fill-opacity=".9"/>\n`;
    }
    out['conveyor-rails'] = svg('Konveyör raylar', 64, 64, d.toString(), s);
  }

  /* ───────────── MATKAP ───────────── */
  {
    const d = new Defs('db');
    const p = palette(d);
    let s = '';
    s += shape(chamfer(3, 3, 58, 58, 12), p.steel, 3.8);
    s += rim('M14 7H50', 0.4, 2.4);
    s += shape(chamfer(11, 11, 42, 42, 8), p.steelDark, 2.8);
    s += circle(32, 32, 21, '#140d07', 3.2);
    s += `    <circle cx="32" cy="32" r="18.5" fill="none" stroke="#b8742f" stroke-width="4"/>\n`;
    s += `    <path d="M18 24A16 16 0 0 1 30 15.6" fill="none" stroke="#ffd9a0" stroke-opacity=".6" stroke-width="2.4" stroke-linecap="round"/>\n`;
    for (const [x, y] of [
      [9, 9],
      [55, 9],
      [9, 55],
      [55, 55],
    ])
      s += pad(p, x, y, 4.5);
    s += shape('M22 58H42V62H22Z', p.amber, 2);
    out['drill-base'] = svg('Matkap gövde', 64, 64, d.toString(), s);
  }
  {
    const d = new Defs('dr');
    const p = palette(d);
    let s = '';
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 2;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const rot = (x: number, y: number): Point => [f(24 + x * c - y * sn), f(24 + x * sn + y * c)];
      s += shape(
        poly([rot(5, -7), rot(17, -9), rot(22, -4), rot(22, 4), rot(17, 9), rot(5, 7)]),
        p.amber,
        2.8,
      );
      s += `    <path d="M${rot(8, -4.6).join(' ')} L${rot(18, -5.6).join(' ')}" stroke="#fff" stroke-opacity=".5" stroke-width="2.2" stroke-linecap="round"/>\n`;
    }
    s += circle(24, 24, 8, p.steel, 3);
    s += circle(24, 24, 3.6, p.amber, 2);
    out['drill-rotor'] = svg('Matkap kafası', 48, 48, d.toString(), s);
  }

  /* ───────────── ERGİTİCİ ───────────── */
  {
    const d = new Defs('sb');
    const p = palette(d);
    let s = '';
    s += shape(chamfer(2, 4, 60, 56, 9), p.steel, 3.8);
    s += rim('M12 8H52', 0.4, 2.4);
    for (const x of [3, 49]) s += shape(rounded(x, 12, 12, 40, 4), p.plum, 2.6);
    s += shape(rounded(17, 14, 30, 26, 5), '#150c0a', 3);
    s += shape(rounded(19, 42, 26, 10, 3), p.steelDark, 2.4);
    for (const x of [23, 31, 39])
      s += `    <rect x="${x}" y="45" width="4" height="4" rx="1" fill="${AMBER}"/>\n`;
    s += circle(55, 10, 3.2, p.teal, 2);
    out['smelter-base'] = svg('Ergitici gövde', 64, 64, d.toString(), s);
  }
  {
    const d = new Defs('sg');
    const g = d.radial(
      'g',
      [
        [0, '#fff0c8', 1],
        [0.35, '#ff9a3c', 0.95],
        [0.75, '#e0431a', 0.55],
        [1, '#e0431a', 0],
      ],
      [0.5, 0.5, 0.5],
    );
    out['smelter-glow'] = svg(
      'Ergitici ocak parıltısı',
      64,
      64,
      d.toString(),
      `    <ellipse cx="32" cy="27" rx="28" ry="22" fill="${g}"/>\n`,
    );
  }
  {
    const d = new Defs('sf');
    const p = palette(d);
    let s = '';
    for (let a = 0; a < 3; a++) {
      const ang = (a * 2 * Math.PI) / 3;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const rot = (x: number, y: number): Point => [f(10 + x * c - y * sn), f(10 + x * sn + y * c)];
      s += shape(
        poly([rot(2, -3), rot(9, -6.5), rot(11.5, -1), rot(11.5, 3), rot(2, 3)]),
        p.steel,
        2.4,
      );
    }
    s += circle(10, 10, 3, p.amber, 1.8);
    out['smelter-fan'] = svg('Ergitici fan', 20, 20, d.toString(), s);
  }

  /* ───────────── TARET ───────────── */
  {
    const d = new Defs('tb');
    const p = palette(d);
    let s = '';
    const oct = Array.from({ length: 8 }, (_, i) =>
      pt(32, 32, 30, (i * Math.PI) / 4 + Math.PI / 8),
    );
    s += shape(poly(oct), p.steel, 3.8);
    s += rim('M12 18C16 12 22 9 32 9', 0.42, 2.6);
    s += circle(32, 32, 22, '#10161b', 3.2);
    s += `    <circle cx="32" cy="32" r="19" fill="none" stroke="${TEAL}" stroke-width="3.4" stroke-opacity=".85"/>\n`;
    for (const [x, y] of [
      [10, 32],
      [54, 32],
      [32, 10],
      [32, 54],
    ])
      s += pad(p, x, y, 3.6);
    out['turret-base'] = svg('Taret kaide', 64, 64, d.toString(), s);
  }
  {
    // Doğuya bakar; dönme merkezi kubbe (20,20).
    const d = new Defs('th');
    const p = palette(d);
    const barrel = d.linear('barrel', [
      [0, '#8aa2b8'],
      [0.5, '#3f4f5f'],
      [1, '#1b232b'],
    ]);
    let s = '';
    for (const y of [12.5, 27.5]) {
      s += shape(rounded(20, y - 3.6, 38, 7.2, 3), barrel, 2.6);
      s += shape(rounded(46, y - 4.8, 12, 9.6, 2.4), p.steelDark, 2.4);
      s += rim(`M24 ${y - 1.6}H44`, 0.4, 1.6);
    }
    const dome = Array.from({ length: 8 }, (_, i) =>
      pt(20, 20, 17.5, (i * Math.PI) / 4 + Math.PI / 8),
    );
    s += shape(poly(dome), p.plum, 3.4);
    s += rim('M8 13C11 8 15 6 20 5.6', 0.45, 2.2);
    s += circle(23, 20, 6.4, p.teal, 2.6);
    s += `    <circle cx="21.4" cy="18.2" r="1.7" fill="#fff" fill-opacity=".9"/>\n`;
    out['turret-head'] = svg('Taret kafa', 64, 40, d.toString(), s);
  }
  {
    const d = new Defs('tf');
    const g = d.radial(
      'g',
      [
        [0, '#ffffff', 1],
        [0.3, '#fff2a8', 0.95],
        [0.7, '#ffb347', 0.5],
        [1, '#ffb347', 0],
      ],
      [0.5, 0.5, 0.5],
    );
    const star = Array.from({ length: 16 }, (_, i) =>
      pt(24, 24, i % 2 === 0 ? 24 : 9, (i * Math.PI) / 8),
    );
    out['turret-flash'] = svg(
      'Taret namlu ışığı',
      48,
      48,
      d.toString(),
      `    <path d="${poly(star)}" fill="${g}"/>\n`,
    );
  }

  /* ───────────── DUVAR ───────────── */
  {
    const d = new Defs('wl');
    const p = palette(d);
    let s = '';
    s += shape(chamfer(2, 2, 60, 60, 10), p.steel, 3.8);
    s += rim('M12 6H52', 0.42, 2.6);
    s += shape(chamfer(10, 10, 44, 44, 6), p.steelDark, 2.6);
    s += `    <path d="M32 12V52M12 32H52" stroke="${OL}" stroke-width="3" stroke-linecap="round"/>\n`;
    s += `    <path d="M14 14H30M34 34H50" stroke="#fff" stroke-opacity=".25" stroke-width="2.4" stroke-linecap="round"/>\n`;
    for (const [x, y] of [
      [8, 8],
      [56, 8],
      [8, 56],
      [56, 56],
    ])
      s += circle(x, y, 3.2, p.amber, 2);
    out['wall'] = svg('Duvar', 64, 64, d.toString(), s);
  }
  const cracks: readonly (readonly [string, readonly string[]])[] = [
    ['wall-crack-1', ['M20 12L28 26L24 34L34 46']],
    ['wall-crack-2', ['M20 12L28 26L24 34L34 46', 'M52 18L42 28L46 38', 'M12 44L22 40']],
    [
      'wall-crack-3',
      [
        'M20 12L28 26L24 34L34 46L30 54',
        'M52 18L42 28L46 38L38 48',
        'M12 44L22 40L30 44',
        'M44 8L40 18',
      ],
    ],
  ];
  for (const [name, paths] of cracks) {
    const d = new Defs(name);
    const s = paths
      .map(
        (q) =>
          `    <path d="${q}" fill="none" stroke="#06090c" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".9"/>\n`,
      )
      .join('');
    out[name] = svg('Duvar çatlağı', 64, 64, d.toString(), s);
  }

  /* ───────────── ÇEKİRDEK (3×3 karo = 192) ───────────── */
  {
    const d = new Defs('co');
    const p = palette(d);
    let s = '';
    s += shape(chamfer(6, 6, 180, 180, 40), p.steel, 5);
    s += rim('M40 14H152', 0.4, 4);
    s += shape(chamfer(22, 22, 148, 148, 28), p.steelDark, 4);
    s += circle(96, 96, 66, p.plum, 5);
    s += circle(96, 96, 50, '#0c1318', 4);
    for (const [x, y] of [
      [22, 22],
      [170, 22],
      [22, 170],
      [170, 170],
    ])
      s += pad(p, x, y, 11);
    s += shape('M70 8H122V16H70Z', p.amber, 3);
    s += shape('M70 176H122V184H70Z', p.amber, 3);
    out['core-base'] = svg('Çekirdek gövde', 192, 192, d.toString(), s);
  }
  {
    const d = new Defs('cn');
    const p = palette(d);
    let s = '';
    for (let i = 0; i < 8; i++) {
      const a0 = (i * Math.PI) / 4 + 0.09;
      const a1 = a0 + Math.PI / 4 - 0.18;
      const o = (a: number, r: number): [number, number] => pt(96, 96, r, a);
      const outer0 = o(a0, 64);
      const outer1 = o(a1, 64);
      const inner1 = o(a1, 46);
      const inner0 = o(a0, 46);
      s += shape(
        `M${outer0.join(' ')} A64 64 0 0 1 ${outer1.join(' ')} L${inner1.join(' ')} A46 46 0 0 0 ${inner0.join(' ')} Z`,
        i % 2 === 0 ? p.steel : p.plumFlat,
        3.2,
      );
    }
    out['core-ring'] = svg('Çekirdek halka', 192, 192, d.toString(), s);
  }
  {
    const d = new Defs('cg');
    const g = d.radial(
      'g',
      [
        [0, '#f2fffc', 1],
        [0.2, '#8ffbe2', 0.95],
        [0.5, '#52f5cf', 0.45],
        [1, '#52f5cf', 0],
      ],
      [0.5, 0.5, 0.5],
    );
    out['core-glow'] = svg(
      'Çekirdek parıltısı',
      192,
      192,
      d.toString(),
      `    <circle cx="96" cy="96" r="96" fill="${g}"/>\n`,
    );
  }

  return out;
}
