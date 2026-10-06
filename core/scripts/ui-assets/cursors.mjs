import { el, svg } from './svg.mjs';

/**
 * Tema imleçleri: 24×24 vektör ok (`arrow`) ve etkileşim vurgulu ok (`pointer`,
 * marka dolgusu). Etkin nokta (hotspot) ok ucudur. Sistem METİN imleci (I-beam)
 * ve işletim sistemi seçim tutamaçları taklit edilmez: metin alanları sistem
 * imlecini korur.
 */
export const CURSOR_SIZE = 24;
export const CURSOR_HOTSPOT = { x: 3, y: 2 };
const ARROW = 'M3 2v17l4.2-3.8 2.8 6 2.4-1.1-2.7-5.9h5.8z';

export function cursorFiles(theme, t) {
  const shape = (fill) =>
    svg(
      { width: CURSOR_SIZE, height: CURSOR_SIZE },
      el('path', {
        d: ARROW,
        fill,
        stroke: t.uiBg,
        'stroke-width': 1.2,
        'stroke-linejoin': 'round',
      }),
    );
  return new Map([
    [`cursors/${theme}/arrow.svg`, shape(t.uiText)],
    [`cursors/${theme}/pointer.svg`, shape(t.brandSolid)],
  ]);
}
