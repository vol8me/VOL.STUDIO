import { el, seeded, svg } from './svg.mjs';

/**
 * Doku döşemeleri: küçük, vektör, tekrarlanan SVG parçalar. Raster ya da video
 * yoktur. `grain` sabit tohumla üretilir (aynı tohum aynı bayt; farklı tohum
 * farklı döşeme); `scanlines` ve `dots` tohumsuzdur. Hiçbiri animasyon taşımaz:
 * azaltılmış hareketin yedeği zaten durağan hâlidir.
 */
export const GRAIN = { size: 64, count: 160 };

export function textureFiles(seed) {
  const random = seeded(seed);
  const specks = [];
  for (let index = 0; index < GRAIN.count; index += 1) {
    const x = Math.floor(random() * GRAIN.size);
    const y = Math.floor(random() * GRAIN.size);
    const opacity = 0.03 + Math.floor(random() * 6) * 0.01;
    specks.push(
      el('rect', {
        x,
        y,
        width: 1,
        height: 1,
        fill: '#ffffff',
        'fill-opacity': Number(opacity.toFixed(2)),
      }),
    );
  }
  const grain = svg({ width: GRAIN.size, height: GRAIN.size }, specks.join(''));
  const scanlines = svg(
    { width: 4, height: 4 },
    el('rect', { y: 2, width: 4, height: 1, fill: '#000000', 'fill-opacity': 0.12 }),
  );
  const dots = svg(
    { width: 8, height: 8 },
    el('circle', { cx: 4, cy: 4, r: 0.6, fill: '#ffffff', 'fill-opacity': 0.08 }),
  );
  return new Map([
    ['textures/grain.svg', grain],
    ['textures/scanlines.svg', scanlines],
    ['textures/dots.svg', dots],
  ]);
}
