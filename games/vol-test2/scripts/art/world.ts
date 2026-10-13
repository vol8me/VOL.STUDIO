import { Defs, OL, circle, f, palette, poly, pt, rim, shape, svg, type Palette } from './lib';

const rng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Dolgun cevher külçesi: tek gövde, büyük aydınlık ve gölge yüzü. */
function nugget(p: Palette, cx: number, cy: number, r: number, rot: number): string {
  const n = 6;
  const pts = Array.from({ length: n }, (_, i) =>
    pt(cx, cy, r * (i % 2 === 0 ? 1 : 0.84), rot + (i * 2 * Math.PI) / n),
  );
  let s = shape(poly(pts), p.amber, 3);
  s += `    <path d="${poly([[cx, cy], pts[4], pts[5], pts[0]])}" fill="#fff5cf" fill-opacity=".55"/>\n`;
  s += `    <path d="${poly([[cx, cy], pts[1], pts[2], pts[3]])}" fill="#5a3708" fill-opacity=".5"/>\n`;
  s += `    <circle cx="${f(cx + r * 0.34 * Math.cos(rot + 5))}" cy="${f(cy + r * 0.34 * Math.sin(rot + 5))}" r="${f(r * 0.13)}" fill="#fff" fill-opacity=".85"/>\n`;
  return s;
}

function ore(seed: number, chunks: number, title: string): string {
  const r = rng(seed);
  const d = new Defs(`o${seed}`);
  const p = palette(d);
  const dirt = d.radial(
    'dirt',
    [
      [0, '#6a5632'],
      [0.7, '#46381d'],
      [1, '#2b2312'],
    ],
    [0.4, 0.35, 0.8],
  );
  let s = '';
  const mound = Array.from({ length: 11 }, (_, i) =>
    pt(32, 32, 27 + r() * 4, (i * 2 * Math.PI) / 11 + r() * 0.25),
  );
  s += shape(poly(mound), dirt, 3.4);
  s += rim('M12 22C16 14 24 9 34 8', 0.22, 2.4);
  const placed: [number, number, number, number][] = [];
  for (let i = 0; i < chunks; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const a = r() * Math.PI * 2;
      const dist = Math.sqrt(r()) * 14;
      const [x, y] = pt(32, 32, dist, a);
      const rad = 8 + r() * 5;
      if (placed.every(([cx, cy, cr]) => Math.hypot(cx - x, cy - y) > (cr + rad) * 0.78)) {
        placed.push([x, y, rad, r() * Math.PI]);
        break;
      }
    }
  }
  placed.sort((a, b) => a[1] - b[1]);
  for (const [x, y, rad, rot] of placed) s += nugget(p, x, y, rad, rot);
  return svg(title, 64, 64, d.toString(), s);
}

export function worldParts(): Record<string, string> {
  const out: Record<string, string> = {};
  out['ore-a'] = ore(11, 4, 'Cevher A');
  out['ore-b'] = ore(23, 5, 'Cevher B');
  out['ore-c'] = ore(37, 3, 'Cevher C');

  /* ───────────── YUVA (düşman, 3×3 karo = 192) ───────────── */
  {
    const d = new Defs('nb');
    const p = palette(d);
    const r = rng(77);
    const bone = d.linear('bone', [
      [0, '#8a4458'],
      [1, '#2b121c'],
    ]);
    let s = '';
    const ring = Array.from({ length: 18 }, (_, i) =>
      pt(96, 96, 84 + r() * 6, (i * 2 * Math.PI) / 18 + r() * 0.1),
    );
    s += shape(poly(ring), p.plum, 5);
    s += rim('M30 60C38 38 56 24 80 18', 0.35, 4);
    // Sırt dikenleri
    for (let i = 0; i < 9; i++) {
      const a = (i * 2 * Math.PI) / 9 + 0.2;
      const base0 = pt(96, 96, 66, a - 0.16);
      const base1 = pt(96, 96, 66, a + 0.16);
      const tip = pt(96, 96, 96, a);
      s += shape(poly([base0, tip, base1]), bone, 3);
    }
    s += circle(96, 96, 44, '#2a0f18', 5);
    s += circle(96, 96, 34, '#12060a', 4);
    // Yumurta keseleri
    for (const [x, y, rx, ry, rot] of [
      [46, 128, 15, 11, -30],
      [140, 56, 14, 10, 40],
      [58, 52, 12, 9, 60],
    ] as const) {
      s += `    <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="${p.plumFlat}" stroke="${OL}" stroke-width="3.2"/>\n`;
      s += `    <ellipse cx="${x - 4}" cy="${y - 3}" rx="${rx * 0.34}" ry="${ry * 0.3}" transform="rotate(${rot} ${x} ${y})" fill="#fff" fill-opacity=".4"/>\n`;
    }
    out['nest-base'] = svg('Yuva gövde', 192, 192, d.toString(), s);
  }
  {
    const d = new Defs('ng');
    const g = d.radial(
      'g',
      [
        [0, '#fff2d0', 1],
        [0.3, '#ff7a3a', 0.9],
        [0.65, '#c0301c', 0.45],
        [1, '#c0301c', 0],
      ],
      [0.5, 0.5, 0.5],
    );
    out['nest-glow'] = svg(
      'Yuva parıltısı',
      192,
      192,
      d.toString(),
      `    <circle cx="96" cy="96" r="70" fill="${g}"/>\n`,
    );
  }

  /* ───────────── ZEMİN SÜSLERİ: nötr (beyaz/siyah alfa), mevsim rengi koddan gelir ───────────── */
  const decal = (name: string, title: string, body: string): void => {
    out[name] = svg(title, 64, 64, '', body);
  };
  const L = (path: string, a = 0.2): string =>
    `    <path d="${path}" fill="#fff" fill-opacity="${a}"/>\n`;
  const D = (path: string, a = 0.24): string =>
    `    <path d="${path}" fill="#000" fill-opacity="${a}"/>\n`;
  decal(
    'decal-tuft',
    'Ot öbeği',
    D('M14 50Q20 28 26 50Z', 0.3) +
      D('M26 52Q34 18 42 52Z', 0.3) +
      D('M40 50Q46 30 52 50Z', 0.3) +
      L('M20 46Q22 36 24 46Z', 0.25) +
      L('M32 46Q36 30 38 46Z', 0.25),
  );
  decal(
    'decal-pebbles',
    'Çakıl',
    D('M10 40a9 7 0 1 0 18 0a9 7 0 1 0-18 0Z', 0.28) +
      D('M32 28a11 8 0 1 0 22 0a11 8 0 1 0-22 0Z', 0.28) +
      D('M26 52a7 5 0 1 0 14 0a7 5 0 1 0-14 0Z', 0.28) +
      L('M12 37a6 3 0 1 0 12 0a6 3 0 1 0-12 0Z', 0.3) +
      L('M36 25a7 3.4 0 1 0 14 0a7 3.4 0 1 0-14 0Z', 0.3),
  );
  decal(
    'decal-crack',
    'Çatlak',
    `    <path d="M8 40L22 34L28 42L40 30L56 38" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>\n`,
  );
  decal(
    'decal-drift',
    'Kar yığını',
    L('M6 46C10 30 28 24 40 30C52 28 60 38 58 46C48 52 18 54 6 46Z', 0.5) +
      D('M10 48C22 52 46 52 56 47', 0.18),
  );
  decal(
    'decal-ripple',
    'Su halkası',
    `    <circle cx="32" cy="32" r="20" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="3.4"/>\n    <circle cx="32" cy="32" r="10" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="3.4"/>\n`,
  );
  decal(
    'decal-reed',
    'Kamış',
    D('M18 56L22 16L26 56Z', 0.32) +
      D('M30 56L36 10L42 56Z', 0.32) +
      D('M46 56L48 24L52 56Z', 0.32) +
      L('M24 50L35 22L38 52Z', 0.16),
  );
  return out;
}
