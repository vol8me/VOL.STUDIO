import { vi } from 'vitest';
import type { SlotGrid } from '../../src/ui/hud/SlotGrid';

/**
 * jsdom `getBoundingClientRect` 0 döner. SlotGrid geometri hesabı için grid ve
 * item rect'lerini simüle eder.
 */
export function mockGridGeometry(grid: SlotGrid, columns: number, size = 56, gap = 8): void {
  const slotCount = grid['slotCount'];
  const rows = Math.ceil(slotCount / columns);

  vi.spyOn(grid['cellsEl'], 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: columns * size + (columns - 1) * gap,
    bottom: rows * size + (rows - 1) * gap,
    width: columns * size + (columns - 1) * gap,
    height: rows * size + (rows - 1) * gap,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  for (const view of (grid['itemViews'] as Map<number, { element: HTMLDivElement }>).values()) {
    const el = view.element;
    const style = el.style;
    const left = Number.parseFloat(style.left) || 0;
    const top = Number.parseFloat(style.top) || 0;
    const width = Number.parseFloat(style.width) || size;
    const height = Number.parseFloat(style.height) || size;

    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    });
  }
}

export function cellCenter(
  index: number,
  columns = 6,
  size = 56,
  gap = 8,
): { x: number; y: number } {
  const col = index % columns;
  const row = Math.floor(index / columns);
  return { x: col * (size + gap) + size / 2, y: row * (size + gap) + size / 2 };
}

/** jsdom işaretçi yakalamayı desteklemez; sürükleme akışı için boş yedek koyar. */
export function stubPointerCapture(): void {
  if ('setPointerCapture' in Element.prototype) return;
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    value: () => {},
    configurable: true,
  });
  Object.defineProperty(Element.prototype, 'releasePointerCapture', {
    value: () => {},
    configurable: true,
  });
}
