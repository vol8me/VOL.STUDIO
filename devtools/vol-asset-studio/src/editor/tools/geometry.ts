import type { ToolPoint } from './types';

/**
 * İki piksel arasını Bresenham ile doldurur.
 *
 * Pointer olayları hızlı harekette seyrek gelir; ara örnekleme olmadan kalem
 * kesikli noktalar bırakır. `getCoalescedEvents()` bu boşluğu azaltır ama
 * kapatmaz — interpolasyon yine de zorunludur.
 */
export function linePoints(from: ToolPoint, to: ToolPoint): ToolPoint[] {
  const points: ToolPoint[] = [];
  let x = Math.trunc(from.x);
  let y = Math.trunc(from.y);
  const targetX = Math.trunc(to.x);
  const targetY = Math.trunc(to.y);
  const deltaX = Math.abs(targetX - x);
  const deltaY = -Math.abs(targetY - y);
  const stepX = x < targetX ? 1 : -1;
  const stepY = y < targetY ? 1 : -1;
  let error = deltaX + deltaY;

  for (;;) {
    points.push({ x, y });
    if (x === targetX && y === targetY) return points;
    const doubled = error * 2;
    if (doubled >= deltaY) {
      error += deltaY;
      x += stepX;
    }
    if (doubled <= deltaX) {
      error += deltaX;
      y += stepY;
    }
  }
}

/**
 * Kare fırça ayak izi.
 *
 * Tek sayı boyutlarda merkez tam piksele oturur; çift sayıda sola/yukarı
 * yaslanır. Pixel-art'ta yarım piksel kaydırma görünür bir kusurdur.
 */
export function brushOffsets(size: number): ToolPoint[] {
  const clamped = Math.max(1, Math.min(64, Math.trunc(size)));
  const start = -Math.floor((clamped - 1) / 2);
  const offsets: ToolPoint[] = [];
  for (let dy = 0; dy < clamped; dy += 1) {
    for (let dx = 0; dx < clamped; dx += 1) {
      offsets.push({ x: start + dx, y: start + dy });
    }
  }
  return offsets;
}
