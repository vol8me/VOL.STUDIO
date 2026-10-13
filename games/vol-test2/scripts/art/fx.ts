import { Defs, poly, pt, svg, type GradientStop } from './lib';

/** Efekt ve hava durumu parçacık dokuları: beyaz/nötr, rengi ve karışımı koddan gelir. */
export function fxParts(): Record<string, string> {
  const out: Record<string, string> = {};
  const soft = (
    name: string,
    title: string,
    size: number,
    stops: readonly GradientStop[],
  ): void => {
    const d = new Defs(name);
    const g = d.radial('g', stops, [0.5, 0.5, 0.5]);
    out[name] = svg(
      title,
      size,
      size,
      d.toString(),
      `    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${g}"/>\n`,
    );
  };
  soft('fx-puff', 'Duman/toz bulutu', 64, [
    [0, '#ffffff', 0.9],
    [0.55, '#ffffff', 0.45],
    [1, '#ffffff', 0],
  ]);
  soft('fx-glow', 'Yumuşak parıltı', 64, [
    [0, '#ffffff', 1],
    [0.35, '#ffffff', 0.55],
    [1, '#ffffff', 0],
  ]);
  soft('wx-mote', 'Toz zerresi', 16, [
    [0, '#ffffff', 0.9],
    [1, '#ffffff', 0],
  ]);

  {
    const star = Array.from({ length: 8 }, (_, i) =>
      pt(16, 16, i % 2 === 0 ? 16 : 4.4, (i * Math.PI) / 4),
    );
    const d = new Defs('sp');
    const g = d.radial(
      'g',
      [
        [0, '#ffffff', 1],
        [0.5, '#ffe29a', 0.95],
        [1, '#ffb347', 0.7],
      ],
      [0.5, 0.5, 0.5],
    );
    out['fx-spark'] = svg(
      'Kıvılcım',
      32,
      32,
      d.toString(),
      `    <path d="${poly(star)}" fill="${g}"/>\n`,
    );
  }
  {
    const d = new Defs('rg');
    out['fx-ring'] = svg(
      'Şok halkası',
      128,
      128,
      d.toString(),
      `    <circle cx="64" cy="64" r="58" fill="none" stroke="#fff" stroke-width="8" stroke-opacity=".9"/>\n    <circle cx="64" cy="64" r="50" fill="none" stroke="#fff" stroke-width="3" stroke-opacity=".4"/>\n`,
    );
  }
  {
    const d = new Defs('ch');
    out['fx-chip'] = svg(
      'Parça',
      16,
      16,
      d.toString(),
      `    <path d="M3 5L9 2L14 7L11 14L4 12Z" fill="#9aa8b6" stroke="#0d1217" stroke-width="1.6" stroke-linejoin="round"/>\n    <path d="M5 6L9 4L11 7" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.2"/>\n`,
    );
  }
  {
    const d = new Defs('dp');
    out['wx-drop'] = svg(
      'Yağmur damlası',
      6,
      28,
      d.toString(),
      `    <path d="M3 0C4.4 8 5.4 18 3 28C0.6 18 1.6 8 3 0Z" fill="#fff" fill-opacity=".85"/>\n`,
    );
  }
  {
    const d = new Defs('fl');
    const arms = Array.from({ length: 6 }, (_, i) => {
      const [x, y] = pt(8, 8, 7, (i * Math.PI) / 3);
      return `M8 8L${x} ${y}`;
    }).join('');
    out['wx-flake'] = svg(
      'Kar tanesi',
      16,
      16,
      d.toString(),
      `    <path d="${arms}" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none"/>\n    <circle cx="8" cy="8" r="2.6" fill="#fff"/>\n`,
    );
  }
  {
    const d = new Defs('lf');
    out['wx-leaf'] = svg(
      'Yaprak',
      20,
      20,
      d.toString(),
      `    <path d="M3 17C3 8 9 3 17 3C17 11 12 17 3 17Z" fill="#fff" fill-opacity=".92" stroke="#000" stroke-opacity=".35" stroke-width="1.4" stroke-linejoin="round"/>\n    <path d="M5 15C8 11 11 8 15 5" stroke="#000" stroke-opacity=".35" stroke-width="1.4" fill="none" stroke-linecap="round"/>\n`,
    );
  }
  {
    const d = new Defs('bt');
    const g = d.radial(
      'g',
      [
        [0, '#fff', 0.95],
        [0.4, '#fff', 0.5],
        [1, '#fff', 0],
      ],
      [0.5, 0.5, 0.5],
    );
    out['fx-build'] = svg(
      'Yapı tamamlanma halkası',
      96,
      96,
      d.toString(),
      `    <circle cx="48" cy="48" r="46" fill="none" stroke="#fff" stroke-width="5" stroke-opacity=".9"/>\n    <circle cx="48" cy="48" r="46" fill="${g}" fill-opacity=".25"/>\n`,
    );
  }
  return out;
}
