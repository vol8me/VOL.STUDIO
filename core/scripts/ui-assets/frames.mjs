import { el, split, svg } from './svg.mjs';

/**
 * Çerçeve ailesi: dış hairline, iç hairline, köşe vurgusu, başlık şeridi ve ayraç.
 * Her parça tema tokenlarından (`frameHairline`, `frameCorner`, `frameHeader`,
 * `frameDivider`, `panel`/`plate`/`well`, `plateTopLight`, `wellInnerShadow`,
 * `hairlineAlpha`) çizilir; tema başına ayrı dosya üretilir (SVG `border-image`
 * sayfa değişkenlerini göremez).
 *
 * 9-dilim: panel/plate/well 48×48 ve dilim 12'dir (`border-image-slice: 12 fill`,
 * `border-image-width: 12px`); köşeler 12×12 içinde kalır, kenarlar uzar.
 * Başlık şeridi yatay 8 dilimlidir. Ölçü CSS px'tir; vektör olduğundan 2× ekranda
 * keskin kalır.
 */
export const FRAME_SLICE = { panel: 12, plate: 12, well: 12, header: 8 };

const fillOf = (hex) => {
  const { color, opacity } = split(hex);
  return { fill: color, 'fill-opacity': opacity === 1 ? undefined : opacity };
};
const strokeOf = (hex, width = 1) => {
  const { color, opacity } = split(hex);
  return {
    stroke: color,
    'stroke-opacity': opacity === 1 ? undefined : opacity,
    'stroke-width': width,
  };
};

export function frameFiles(theme, t) {
  const box = (children) => svg({ width: 48, height: 48 }, children);
  const outer = (fill) =>
    el('rect', {
      x: 0.5,
      y: 0.5,
      width: 47,
      height: 47,
      rx: 4,
      ...fillOf(fill),
      ...strokeOf(t.frameHairline),
    });

  const corners = ['M2 9V2h7', 'M46 9V2h-7', 'M2 39v7h7', 'M46 39v7h-7']
    .map((d) =>
      el('path', { d, fill: 'none', ...strokeOf(t.frameCorner, 1.5), 'stroke-linecap': 'round' }),
    )
    .join('');

  const panel = box(
    outer(t.panel) +
      el('rect', {
        x: 3.5,
        y: 3.5,
        width: 41,
        height: 41,
        rx: 2,
        fill: 'none',
        ...strokeOf(t.hairlineAlpha),
      }) +
      corners,
  );
  const plate = box(
    outer(t.plate) +
      el('path', { d: 'M3 1.5h42', fill: 'none', ...strokeOf(t.plateTopLight) }) +
      el('path', { d: 'M3 46.5h42', fill: 'none', ...strokeOf(t.wellInnerShadow) }),
  );
  const well = box(
    outer(t.well) + el('rect', { x: 1, y: 1, width: 46, height: 4, ...fillOf(t.wellInnerShadow) }),
  );
  const header = svg(
    { width: 96, height: 24 },
    el('rect', { width: 96, height: 24, ...fillOf(t.frameHeader) }) +
      el('path', { d: 'M0 23.5h96', fill: 'none', ...strokeOf(t.frameDivider) }),
  );
  const divider = svg(
    { width: 48, height: 4 },
    el('path', { d: 'M0 2h48', fill: 'none', ...strokeOf(t.frameDivider) }) +
      el('rect', { x: 21, y: 0.5, width: 6, height: 3, rx: 1, ...fillOf(t.frameCorner) }),
  );

  return new Map([
    [`frames/${theme}/panel.svg`, panel],
    [`frames/${theme}/plate.svg`, plate],
    [`frames/${theme}/well.svg`, well],
    [`frames/${theme}/header.svg`, header],
    [`frames/${theme}/divider.svg`, divider],
  ]);
}
