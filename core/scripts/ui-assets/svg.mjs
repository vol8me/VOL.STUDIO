/**
 * Deterministik SVG yardımcıları. Aynı girdi her zaman aynı bayt dizisini verir:
 * sayılar sabit biçimlenir, nitelik sırası çağıranın verdiği sıradır, zaman,
 * rastgelelik (tohumsuz) ve çalışma ortamı çıktıya girmez.
 */

/** En çok 3 ondalık, gereksiz sıfırsız (`1.50` → `1.5`, `2.000` → `2`). */
export function num(value) {
  const text = Number(value.toFixed(3)).toString();
  return text === '-0' ? '0' : text;
}

/** `{ a: 1, b: 'x' }` → ` a="1" b="x"` (undefined/null atlanır). */
export function attrs(map) {
  return Object.entries(map)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ` ${key}="${typeof value === 'number' ? num(value) : value}"`)
    .join('');
}

export function el(name, map = {}, children = '') {
  return children === ''
    ? `<${name}${attrs(map)}/>`
    : `<${name}${attrs(map)}>${children}</${name}>`;
}

/** Kök `<svg>`: boyut ve görünüm kutusu açık yazılır; XML bildirimi yok (SVG1.1 uyumlu). */
export function svg({ width, height, viewBox }, children) {
  return `${el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width,
      height,
      viewBox: viewBox ?? `0 0 ${num(width)} ${num(height)}`,
    },
    children,
  )}\n`;
}

/** mulberry32: 32 bitlik, tohumlu, platformdan bağımsız tamsayı tabanlı üreteç. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `#rrggbbaa` → `{ color: '#rrggbb', opacity }` (SVG `fill-opacity` için). */
export function split(value) {
  if (value.length === 9) {
    return {
      color: value.slice(0, 7),
      opacity: Number((parseInt(value.slice(7), 16) / 255).toFixed(3)),
    };
  }
  return { color: value, opacity: 1 };
}
