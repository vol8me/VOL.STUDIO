import type { CursorEntry, ReticleEntry } from './cursorData';
import type { CursorId } from './cursorNames';

/** Hazır imleç boyutları (CSS piksel). 32 en uyumlu; tarayıcılar 128 üstünü yok sayar. */
export type CursorSize = 32 | 48 | 64;

export interface CursorColors {
  /** Gövde rengi (ton ile değişir). */
  readonly body: string;
  /** Dış çizgi; açık/koyu her zeminde okunur kalması için koyudur. */
  readonly outline: string;
}

/** Sistem imleç anahtar sözcükleri: kayıt gelmezse ya da görsel reddedilirse geri düşülür. */
export const CURSOR_FALLBACK: Readonly<Record<CursorId, string>> = {
  default: 'default',
  link: 'pointer',
  text: 'text',
  busy: 'progress',
  wait: 'wait',
  denied: 'not-allowed',
  help: 'help',
  grab: 'grab',
  grabbing: 'grabbing',
  resizeH: 'ew-resize',
  resizeV: 'ns-resize',
  resizeNWSE: 'nwse-resize',
  resizeNESW: 'nesw-resize',
  moveAll: 'move',
  zoomIn: 'zoom-in',
  zoomOut: 'zoom-out',
  copy: 'copy',
  alias: 'alias',
  aimSmall: 'crosshair',
  select: 'default',
  attack: 'crosshair',
  walk: 'pointer',
  build: 'cell',
  repair: 'cell',
  mine: 'cell',
  chop: 'cell',
  rally: 'crosshair',
  patrol: 'pointer',
  garrison: 'pointer',
  cancelOrder: 'not-allowed',
  scrollN: 'n-resize',
  scrollNE: 'ne-resize',
  scrollE: 'e-resize',
  scrollSE: 'se-resize',
  scrollS: 's-resize',
  scrollSW: 'sw-resize',
  scrollW: 'w-resize',
  scrollNW: 'nw-resize',
  look: 'default',
};

/** İmleç kimliği → kök CSS değişkeni (`resizeH` → `--vol-cursor-resize-h`). */
export function cursorVar(id: CursorId): string {
  return `--vol-cursor-${id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

const layer = (paths: readonly string[], fill: string): string =>
  paths.map((d) => `<path fill="${fill}" d="${d}"/>`).join('');

/** İmleç SVG'si: önce dış çizgi, üstüne gövde; `size` piksel doğal boyuttur. */
export function cursorSvg(
  entry: CursorEntry,
  gridSize: number,
  size: number,
  colors: CursorColors,
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${gridSize} ${gridSize}">${layer(entry.outline, colors.outline)}${layer(entry.body, colors.body)}</svg>`
  );
}

/** CSS `cursor` değeri: veri URL'si + ölçeklenmiş etkin nokta + sistem yedeği. */
export function cursorCssValue(
  id: CursorId,
  entry: CursorEntry,
  gridSize: number,
  size: number,
  colors: CursorColors,
): string {
  const scale = size / gridSize;
  const x = Math.round(entry.hotspot[0] * scale);
  const y = Math.round(entry.hotspot[1] * scale);
  const svg = cursorSvg(entry, gridSize, size, colors);
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${CURSOR_FALLBACK[id]}`;
}

/** Nişangâh SVG'si: tek yol kümesi, `currentColor` ile boyanır. */
export function reticleSvg(entry: ReticleEntry, gridSize: number): string {
  const paths = entry.paths.map((d) => `<path d="${d}"/>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gridSize} ${gridSize}" ` +
    `fill="currentColor" aria-hidden="true" focusable="false">${paths}</svg>`
  );
}
