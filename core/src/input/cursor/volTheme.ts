import type { CursorAsset, CursorColorTokens, CursorId, CursorLayer, CursorTheme } from './types';

/**
 * VOL cursor renk paleti.
 *
 * Vurgu rengi VOL_COLORS.accentSolid ile aynı; body yüzey metni,
 * outline koyu arka plana karşı okunurluk verir. Danger ve disabled
 * rolleri yalnızca ilgili cursor'larda kullanılır.
 */
export const VOL_CURSOR_COLORS: CursorColorTokens = {
  outline: '#070a0d',
  body: '#e8eef5',
  accent: '#565dbe',
  danger: '#b94a4a',
  disabled: '#5d6a75',
};

/** Her cursor aynı 24×24 viewBox'ta çizilir. */
const VIEWBOX = 24;

const BODY_STROKE = 1.75;
const OUTLINE_STROKE = 2.75;
const ACCENT_STROKE = 1.5;

/** Tek renk rolüne göre katman üretir. */
function layer(
  d: string,
  role: 'outline' | 'body' | 'accent' | 'danger',
  options: { fill?: boolean; stroke?: boolean } = {},
): CursorLayer {
  const strokeWidth =
    role === 'outline'
      ? OUTLINE_STROKE
      : role === 'body'
      ? BODY_STROKE
      : role === 'danger'
      ? BODY_STROKE
      : ACCENT_STROKE;

  return {
    d,
    role,
    fill: options.fill ?? false,
    stroke: options.stroke ?? true,
    strokeWidth,
  };
}

/** İki katmanlı outline + body çifti. */
function strokePair(d: string, accentD?: string): CursorLayer[] {
  const layers: CursorLayer[] = [layer(d, 'outline'), layer(d, 'body')];
  if (accentD) layers.push(layer(accentD, 'accent'));
  return layers;
}

const VOL_CURSOR_ASSETS: Record<CursorId, CursorAsset> = {
  default: {
    id: 'default',
    viewBox: VIEWBOX,
    hotspotX: 2,
    hotspotY: 2,
    fallback: 'default',
    layers: strokePair('M2 2 L2 19 L7 14 L11 22 L15 20 L11 12 L22 12 Z'),
  },

  pointer: {
    id: 'pointer',
    viewBox: VIEWBOX,
    hotspotX: 6,
    hotspotY: 2,
    fallback: 'pointer',
    layers: strokePair(
      'M6 22 L6 11 C6 10 7 9 8 9 L9 9 L9 3 C9 2 10 1 11 1 C12 1 13 2 13 3 L13 9 L14 9 C15 9 16 10 16 11 L16 17 C16 19 14 21 12 21 L8 21 C7 21 6 20 6 19 Z M3 15 Q5 10 9 12',
    ),
  },

  text: {
    id: 'text',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'text',
    layers: strokePair('M9 4 L15 4 M12 4 L12 20 M9 20 L15 20'),
  },

  crosshair: {
    id: 'crosshair',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'crosshair',
    layers: strokePair('M12 2 L12 22 M2 12 L22 12'),
  },

  precision: {
    id: 'precision',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'crosshair',
    layers: strokePair(
      'M12 2 L12 6 M12 18 L12 22 M2 12 L6 12 M18 12 L22 12 M12 6 A6 6 0 1 1 12 18 A6 6 0 1 1 12 6',
      'M12 9 A3 3 0 1 1 12 15 A3 3 0 1 1 12 9',
    ),
  },

  grab: {
    id: 'grab',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'grab',
    layers: strokePair(
      'M6 16 C6 11 10 8 14 8 C18 8 21 11 21 16 L21 18 C21 20 19 22 17 22 L10 22 C8 22 6 20 6 18 Z M9 8 L9 5 C9 4 10 3 11 3 C12 3 13 4 13 5 L13 8 M14 8 L14 5 C14 4 15 3 16 3 C17 3 18 4 18 5 L18 8 M10 8 L10 6 C10 5 11 4 12 4 C13 4 14 5 14 6 L14 8',
    ),
  },

  grabbing: {
    id: 'grabbing',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'grabbing',
    layers: strokePair(
      'M7 22 L7 13 C7 11 9 10 11 10 L15 10 C17 10 19 11 19 13 L19 18 C19 20 17 22 15 22 Z M4 16 C4 14 6 12 8 13 M10 10 L10 7 C10 6 11 5 12 5 C13 5 14 6 14 7 L14 10 M15 10 L15 7 C15 6 16 5 17 5 C18 5 19 6 19 7 L19 10',
      'M12 14 L12 18',
    ),
  },

  pan: {
    id: 'pan',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'grab',
    layers: strokePair(
      'M6 16 C6 11 10 8 14 8 C18 8 21 11 21 16 L21 18 C21 20 19 22 17 22 L10 22 C8 22 6 20 6 18 Z M12 5 L12 2 M9 8 L6 5 M15 8 L18 5 M12 22 L12 25',
    ),
  },

  move: {
    id: 'move',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'move',
    layers: strokePair(
      'M12 2 L12 7 M12 17 L12 22 M2 12 L7 12 M17 12 L22 12 M7 7 L12 2 L17 7 M7 17 L12 22 L17 17 M7 7 L2 12 L7 17 M17 7 L22 12 L17 17',
    ),
  },

  'resize-ew': {
    id: 'resize-ew',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'ew-resize',
    layers: strokePair('M7 7 L2 12 L7 17 M17 7 L22 12 L17 17 M7 12 L17 12'),
  },

  'resize-ns': {
    id: 'resize-ns',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'ns-resize',
    layers: strokePair('M7 7 L12 2 L17 7 M7 17 L12 22 L17 17 M12 7 L12 17'),
  },

  'resize-nesw': {
    id: 'resize-nesw',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'nesw-resize',
    layers: strokePair('M4 20 L20 4 M14 4 L20 4 L20 10 M4 14 L4 20 L10 20'),
  },

  'resize-nwse': {
    id: 'resize-nwse',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'nwse-resize',
    layers: strokePair('M4 4 L20 20 M4 10 L4 4 L10 4 M14 20 L20 20 L20 14'),
  },

  'resize-all': {
    id: 'resize-all',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'all-scroll',
    layers: strokePair(
      'M12 2 L12 22 M2 12 L22 12 M7 7 L2 12 L7 17 M17 7 L22 12 L17 17 M7 17 L12 22 L17 17 M7 7 L12 2 L17 7',
    ),
  },

  'zoom-in': {
    id: 'zoom-in',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'zoom-in',
    layers: strokePair(
      'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z M16 16 L20 20 M8 11 L14 11 M11 8 L11 14',
    ),
  },

  'zoom-out': {
    id: 'zoom-out',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'zoom-out',
    layers: strokePair('M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z M16 16 L20 20 M8 11 L14 11'),
  },

  'not-allowed': {
    id: 'not-allowed',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'not-allowed',
    layers: [
      layer('M12 4 A8 8 0 1 1 12 20 A8 8 0 1 1 12 4', 'outline'),
      layer('M12 4 A8 8 0 1 1 12 20 A8 8 0 1 1 12 4', 'body'),
      layer('M5 5 L19 19', 'danger'),
    ],
    animation: { type: 'shake', duration: 400, amount: 1.5 },
  },

  wait: {
    id: 'wait',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'wait',
    layers: strokePair('M5 4 L19 4 L12 12 L19 20 L5 20 L12 12 Z'),
    animation: { type: 'rotate', duration: 1200 },
  },

  help: {
    id: 'help',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'help',
    layers: strokePair(
      'M12 4 A8 8 0 1 1 12 20 A8 8 0 1 1 12 4 M12 16 L12 16.01 M10 9 C10 7 12 6 14 6 C16 6 17 7 17 9 C17 11 15 12 14 13 L14 15',
      'M12 17 A1 1 0 1 1 12 19 A1 1 0 1 1 12 17',
    ),
    animation: { type: 'pulse', duration: 1000, scale: { from: 1, to: 1.08 } },
  },

  target: {
    id: 'target',
    viewBox: VIEWBOX,
    hotspotX: 12,
    hotspotY: 12,
    fallback: 'crosshair',
    layers: strokePair(
      'M12 4 A8 8 0 1 1 12 20 A8 8 0 1 1 12 4 M12 7 A5 5 0 1 1 12 17 A5 5 0 1 1 12 7 M12 2 L12 22 M2 12 L22 12',
      'M12 5 A7 7 0 1 1 12 19 A7 7 0 1 1 12 5',
    ),
    animation: { type: 'pulse', duration: 900, scale: { from: 1, to: 1.15 } },
  },
};

/**
 * VOL cursor teması: 20 adet vektörel cursor ve renk paleti.
 */
export const VolCursorTheme: CursorTheme = {
  id: 'vol',
  viewBox: VIEWBOX,
  colors: VOL_CURSOR_COLORS,
  cursors: VOL_CURSOR_ASSETS,
};

export { VOL_CURSOR_ASSETS };
