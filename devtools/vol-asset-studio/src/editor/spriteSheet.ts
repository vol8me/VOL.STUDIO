import type { SpriteDocument } from './SpriteDocument';
import type { RasterBuffer } from './transform';

export type SheetLayout = 'horizontal' | 'vertical' | 'grid';

export interface SpriteSheetOptions {
  layout?: SheetLayout;
  /** `grid` düzeninde sütun sayısı. */
  columns?: number;
  /** Kareler arası saydam boşluk (piksel). */
  padding?: number;
}

export interface SpriteSheetFrameRect {
  frameId: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  durationMs: number;
  tags: string[];
}

export interface SpriteSheet {
  buffer: RasterBuffer;
  frames: SpriteSheetFrameRect[];
  columns: number;
  rows: number;
}

/**
 * Kareleri tek sayfaya dizer.
 *
 * Dizilim ve kare dikdörtgenleri BİRLİKTE döner: sayfayı üretip koordinatları
 * ayrı hesaplamak, iki tarafın kaçınılmaz olarak ayrışacağı bir yol açar.
 * Runtime metadata bu dikdörtgenlerden üretilir.
 */
export function buildSpriteSheet(
  document: SpriteDocument,
  options: SpriteSheetOptions = {},
): SpriteSheet {
  const layout = options.layout ?? 'horizontal';
  const padding = Math.max(0, Math.trunc(options.padding ?? 0));
  const count = document.frameCount;
  const columns =
    layout === 'horizontal'
      ? count
      : layout === 'vertical'
      ? 1
      : Math.max(1, Math.min(count, Math.trunc(options.columns ?? Math.ceil(Math.sqrt(count)))));
  const rows = Math.ceil(count / columns);

  const cellWidth = document.width + padding;
  const cellHeight = document.height + padding;
  // Son sütun/satırdan sonra boşluk bırakılmaz; kenardaki dolgu sprite'ı
  // gereksiz büyütür ve runtime'da yanlış hizalamaya davetiye çıkarır.
  const sheetWidth = columns * cellWidth - (columns > 0 ? padding : 0);
  const sheetHeight = rows * cellHeight - (rows > 0 ? padding : 0);
  const buffer: RasterBuffer = {
    width: Math.max(1, sheetWidth),
    height: Math.max(1, sheetHeight),
    rgba: new Uint8ClampedArray(Math.max(1, sheetWidth) * Math.max(1, sheetHeight) * 4),
  };

  const frames: SpriteSheetFrameRect[] = [];
  for (let index = 0; index < count; index += 1) {
    const frame = document.frameAt(index);
    if (frame === null) continue;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const originX = column * cellWidth;
    const originY = row * cellHeight;
    const composite = document.compositeFrame(index);
    for (let y = 0; y < document.height; y += 1) {
      const from = y * document.width * 4;
      const to = ((originY + y) * buffer.width + originX) * 4;
      buffer.rgba.set(composite.rgba.subarray(from, from + document.width * 4), to);
    }
    frames.push({
      frameId: frame.id,
      index,
      x: originX,
      y: originY,
      width: document.width,
      height: document.height,
      durationMs: frame.durationMs,
      tags: [...frame.tags],
    });
  }

  return { buffer, frames, columns, rows };
}

export interface SpriteRuntimeMetadata {
  schemaVersion: 1;
  canvas: { width: number; height: number };
  sheet: { width: number; height: number; columns: number; rows: number };
  pivot?: { x: number; y: number };
  frames: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    durationMs: number;
    tags?: string[];
  }[];
  metadata?: Record<string, unknown>;
}

/**
 * Oyun bağımsız runtime metadata'sı.
 *
 * Hiçbir motor tipine, sahne adına veya oyun kavramına bağlanmaz: yalnız
 * dikdörtgen, süre ve etiket taşır. Tüketici hangi motor olursa olsun bunu
 * kendi biçimine çevirebilir.
 */
export function buildRuntimeMetadata(
  document: SpriteDocument,
  sheet: SpriteSheet,
): SpriteRuntimeMetadata {
  return {
    schemaVersion: 1,
    canvas: { width: document.width, height: document.height },
    sheet: {
      width: sheet.buffer.width,
      height: sheet.buffer.height,
      columns: sheet.columns,
      rows: sheet.rows,
    },
    ...(document.pivot === null ? {} : { pivot: { ...document.pivot } }),
    frames: sheet.frames.map((frame) => ({
      id: frame.frameId,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      durationMs: frame.durationMs,
      ...(frame.tags.length > 0 ? { tags: frame.tags } : {}),
    })),
    ...(Object.keys(document.metadata).length === 0 ? {} : { metadata: { ...document.metadata } }),
  };
}

/**
 * Onion skin katmanları.
 *
 * Önceki ve sonraki kareler azalan opaklıkla döner. Bu katmanlar YALNIZ
 * ekrandadır; export ve kayıt onları hiç görmez.
 */
export function buildOnionSkin(
  document: SpriteDocument,
  frameIndex: number,
  before: number,
  after: number,
): { buffer: RasterBuffer; opacity: number }[] {
  const layers: { buffer: RasterBuffer; opacity: number }[] = [];
  for (let offset = Math.max(1, 0); offset <= before; offset += 1) {
    const index = frameIndex - offset;
    if (index < 0) break;
    layers.push({ buffer: document.compositeFrame(index), opacity: 0.35 / offset });
  }
  for (let offset = 1; offset <= after; offset += 1) {
    const index = frameIndex + offset;
    if (index >= document.frameCount) break;
    layers.push({ buffer: document.compositeFrame(index), opacity: 0.25 / offset });
  }
  return layers;
}
