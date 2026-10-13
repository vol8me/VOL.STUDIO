import { DX, DY } from '@/sim/state';
import { BELT } from '@/config/forge';

export interface ChunkRange {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface WorldRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Kameranın gördüğü dünya dikdörtgenindeki chunk aralığı (kapalı), dünya sınırına kırpılmış. */
export function visibleChunks(
  view: WorldRect,
  chunkPx: number,
  chunksX: number,
  chunksY: number,
): ChunkRange {
  const x0 = Math.max(0, Math.floor(view.x / chunkPx));
  const y0 = Math.max(0, Math.floor(view.y / chunkPx));
  const x1 = Math.min(chunksX - 1, Math.floor((view.x + view.width) / chunkPx));
  const y1 = Math.min(chunksY - 1, Math.floor((view.y + view.height) / chunkPx));
  return { x0, y0, x1, y1 };
}

/** Dünya pikselinden tile kenarı; dünya dışındaysa `null`. */
export function tileAt(
  worldX: number,
  worldY: number,
  tilePx: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return null;
  const x = Math.floor(worldX / tilePx);
  const y = Math.floor(worldY / tilePx);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return { x, y };
}

/**
 * Bant üzerindeki eşyanın tile içindeki dünya pikseli: `position` (0..BELT.length-1) giriş
 * kenarından çıkışa doğru ilerler, yan eksende tile ortasındadır.
 */
export function beltItemPoint(
  tileX: number,
  tileY: number,
  rot: number,
  position: number,
  tilePx: number,
  out: { x: number; y: number },
): void {
  const along = (position / BELT.length) * tilePx;
  const dx = DX[rot & 3];
  const dy = DY[rot & 3];
  const centerX = tileX * tilePx + tilePx / 2;
  const centerY = tileY * tilePx + tilePx / 2;
  // Giriş kenarı = merkez - yön * yarım tile; eşya oradan `along` kadar ilerler.
  out.x = centerX + dx * (along - tilePx / 2);
  out.y = centerY + dy * (along - tilePx / 2);
}

/** Önceki ve şimdiki konum arasında `alpha` (0..1) oranında ara değer. */
export function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}
