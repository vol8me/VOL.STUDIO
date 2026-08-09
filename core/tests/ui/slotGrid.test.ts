import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { SlotGrid, type SlotItem } from '../../src/ui/hud/SlotGrid';

const tracked: SlotGrid[] = [];
function track(grid: SlotGrid): SlotGrid {
  tracked.push(grid);
  return grid;
}

afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
});

beforeAll(() => {
  // jsdom pointer capture desteklemiyor
  if (!('setPointerCapture' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      value: () => {},
      configurable: true,
    });
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      value: () => {},
      configurable: true,
    });
  }
});

function makeItem(overrides?: Partial<SlotItem>): SlotItem {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    label: 'Eşya',
    ...overrides,
  };
}

/**
 * jsdom `getBoundingClientRect` 0 döner. SlotGrid geometri hesabı için
 * grid ve item rect'lerini simüle eder.
 */
function mockGridGeometry(grid: SlotGrid, columns: number, size = 56, gap = 8): void {
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
    const _index = Number(el.dataset.slotIndex);
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

function cellCenter(index: number, columns = 6, size = 56, gap = 8): { x: number; y: number } {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = col * (size + gap) + size / 2;
  const y = row * (size + gap) + size / 2;
  return { x, y };
}

describe('SlotGrid', () => {
  it('doğru sayıda hücre ile grid oluşturur', () => {
    const grid = track(new SlotGrid({ slotCount: 12, items: {} }));
    expect(grid.cellsEl.children.length).toBe(12);
    expect(grid.itemsEl.children.length).toBe(0);
  });

  it('başlangıç öğelerini render eder', () => {
    const item = makeItem({ label: 'Kılıç' });
    const grid = track(
      new SlotGrid({
        slotCount: 6,
        columns: 3,
        items: { 0: item },
      }),
    );
    expect(grid.getItem(0)).toEqual(item);
    expect(grid.itemsEl.children.length).toBe(1);
  });

  it('span kaplamını hesaplar', () => {
    const grid = track(
      new SlotGrid({
        slotCount: 12,
        columns: 4,
        items: {
          0: makeItem({ span: { cols: 2, rows: 2 } }),
        },
      }),
    );
    expect(grid.getItem(0)).toBeDefined();
    expect(grid.getItem(1)).toBeDefined();
    expect(grid.getItem(4)).toBeDefined();
    expect(grid.getItem(5)).toBeDefined();
    expect(grid.getItem(2)).toBeUndefined();
  });

  it('ilk boş slotu bulur', () => {
    const grid = track(
      new SlotGrid({
        slotCount: 6,
        columns: 3,
        items: { 0: makeItem(), 2: makeItem() },
      }),
    );
    expect(grid.findFirstEmptySlot()).toBe(1);
  });

  it('grid doluyken findFirstEmptySlot -1 döner', () => {
    const grid = track(
      new SlotGrid({
        slotCount: 2,
        columns: 2,
        items: { 0: makeItem(), 1: makeItem() },
      }),
    );
    expect(grid.findFirstEmptySlot()).toBe(-1);
  });

  it('setItem öğe ekler ve kaldırır', () => {
    const grid = track(new SlotGrid({ slotCount: 4, columns: 2, items: {} }));
    const item = makeItem();
    grid.setItem(1, item);
    expect(grid.getItem(1)).toEqual(item);
    grid.setItem(1, null);
    expect(grid.getItem(1)).toBeUndefined();
  });

  it('setItem mevcut öğeyi yerinde günceller', () => {
    const item = makeItem({ quantity: 1 });
    const grid = track(new SlotGrid({ slotCount: 4, columns: 2, items: { 0: item } }));
    const updated = { ...item, quantity: 5 };
    grid.setItem(0, updated);
    expect(grid.getItem(0)).toEqual(updated);
    expect(grid.itemsEl.children.length).toBe(1);
  });

  it('satır sonunda geçersiz span yerleşimini reddeder', () => {
    const grid = track(
      new SlotGrid({
        slotCount: 12,
        columns: 4,
        items: {
          3: makeItem({ span: { cols: 2, rows: 1 } }),
        },
      }),
    );
    expect(grid.getItem(3)).toBeUndefined();
    expect(grid.getItem(4)).toBeUndefined();
  });

  it('çakışan span öğelerini reddeder', () => {
    const grid = track(
      new SlotGrid({
        slotCount: 12,
        columns: 4,
        items: {
          0: makeItem({ id: 'a', span: { cols: 2, rows: 2 } }),
          1: makeItem({ id: 'b' }),
        },
      }),
    );
    expect(grid.getItem(0)?.id).toBe('a');
    expect(grid.getItem(1)?.id).toBe('a');
  });

  it('öğeye tıklanınca onSlotClick tetiklenir', () => {
    const item = makeItem({ label: 'Kalkan' });
    const onSlotClick = vi.fn();
    const grid = track(
      new SlotGrid({
        slotCount: 4,
        columns: 2,
        items: { 0: item },
        onSlotClick,
      }),
    );
    const itemEl = grid.itemsEl.querySelector('.vol-slot-grid__item') as HTMLDivElement;
    itemEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
        pointerId: 1,
      }),
    );
    itemEl.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
        pointerId: 1,
      }),
    );
    expect(onSlotClick).toHaveBeenCalledWith(item, 0);
  });

  it('sürükleme sonrası onSlotClick çağrılmaz', () => {
    const item = makeItem();
    const onSlotClick = vi.fn();
    const grid = track(
      new SlotGrid({
        slotCount: 12,
        columns: 4,
        items: { 0: item },
        onSlotClick,
      }),
    );
    mockGridGeometry(grid, 4);

    const itemEl = grid.itemsEl.querySelector('.vol-slot-grid__item') as HTMLDivElement;
    const start = cellCenter(0, 4);
    const end = cellCenter(3, 4);

    itemEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: start.x,
        clientY: start.y,
        pointerId: 1,
      }),
    );
    itemEl.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );
    itemEl.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );

    expect(onSlotClick).not.toHaveBeenCalled();
  });

  it('1x1 öğeyi boş slota taşır', () => {
    const item = makeItem({ id: 'i1' });
    const onMove = vi.fn();
    const grid = track(
      new SlotGrid({
        slotCount: 12,
        columns: 4,
        items: { 0: item },
        onMove,
      }),
    );
    mockGridGeometry(grid, 4);

    const itemEl = grid.itemsEl.querySelector('.vol-slot-grid__item') as HTMLDivElement;
    const start = cellCenter(0, 4);
    const end = cellCenter(2, 4);

    itemEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: start.x,
        clientY: start.y,
        pointerId: 1,
      }),
    );
    itemEl.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );
    itemEl.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );

    expect(grid.getItem(0)).toBeUndefined();
    expect(grid.getItem(2)?.id).toBe('i1');
    expect(onMove).toHaveBeenCalledWith('i1', 0, 2);
  });

  it('onSwapRequest true dönerse iki 1x1 öğeyi yer değiştirir', () => {
    const a = makeItem({ id: 'a' });
    const b = makeItem({ id: 'b' });
    const onMove = vi.fn();
    const grid = track(
      new SlotGrid({
        slotCount: 6,
        columns: 3,
        items: { 0: a, 1: b },
        onMove,
        onSwapRequest: () => true,
      }),
    );
    mockGridGeometry(grid, 3);

    const itemEls = grid.itemsEl.querySelectorAll('.vol-slot-grid__item');
    const start = cellCenter(0, 3);
    const end = cellCenter(1, 3);

    itemEls[0].dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: start.x,
        clientY: start.y,
        pointerId: 1,
      }),
    );
    itemEls[0].dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );
    itemEls[0].dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );

    expect(grid.getItem(0)?.id).toBe('b');
    expect(grid.getItem(1)?.id).toBe('a');
    expect(onMove).toHaveBeenCalledWith('a', 0, 1);
  });

  it('onSwapRequest false dönerse yer değiştirmeyi reddeder', () => {
    const a = makeItem({ id: 'a' });
    const b = makeItem({ id: 'b' });
    const onMove = vi.fn();
    const grid = track(
      new SlotGrid({
        slotCount: 6,
        columns: 3,
        items: { 0: a, 1: b },
        onMove,
        onSwapRequest: () => false,
      }),
    );
    mockGridGeometry(grid, 3);

    const itemEls = grid.itemsEl.querySelectorAll('.vol-slot-grid__item');
    const start = cellCenter(0, 3);
    const end = cellCenter(1, 3);

    itemEls[0].dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: start.x,
        clientY: start.y,
        pointerId: 1,
      }),
    );
    itemEls[0].dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );
    itemEls[0].dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );

    expect(grid.getItem(0)?.id).toBe('a');
    expect(grid.getItem(1)?.id).toBe('b');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('span öğeyi boş bloğa taşır', () => {
    const item = makeItem({ id: 'big', span: { cols: 2, rows: 2 } });
    const onMove = vi.fn();
    const grid = track(
      new SlotGrid({
        slotCount: 16,
        columns: 4,
        items: { 0: item },
        onMove,
      }),
    );
    mockGridGeometry(grid, 4);

    const itemEl = grid.itemsEl.querySelector('.vol-slot-grid__item') as HTMLDivElement;
    const start = cellCenter(0, 4); // 0'ın ortası
    const end = cellCenter(6, 4); // index 6 (row 1, col 2) -> kök 6, block 6,7,10,11

    itemEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: start.x,
        clientY: start.y,
        pointerId: 1,
      }),
    );
    itemEl.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );
    itemEl.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );

    expect(grid.getItem(0)).toBeUndefined();
    expect(grid.getItem(6)).toBeDefined();
    expect(grid.getItem(7)).toBeDefined();
    expect(grid.getItem(10)).toBeDefined();
    expect(grid.getItem(11)).toBeDefined();
    expect(onMove).toHaveBeenCalledWith('big', 0, 6);
  });

  it('span öğe yer değiştirmeye izin vermez', () => {
    const big = makeItem({ id: 'big', span: { cols: 2, rows: 2 } });
    const small = makeItem({ id: 'small' });
    const onMove = vi.fn();
    const grid = track(
      new SlotGrid({
        slotCount: 16,
        columns: 4,
        items: { 0: big, 8: small },
        onMove,
        onSwapRequest: () => true,
      }),
    );
    mockGridGeometry(grid, 4);

    const itemEl = grid.itemsEl.querySelector('.vol-slot-grid__item') as HTMLDivElement;
    const start = cellCenter(0, 4);
    const end = cellCenter(4, 4);

    itemEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: start.x,
        clientY: start.y,
        pointerId: 1,
      }),
    );
    itemEl.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );
    itemEl.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );

    expect(grid.getItem(0)?.id).toBe('big');
    expect(grid.getItem(4)?.id).toBe('big');
    expect(grid.getItem(8)?.id).toBe('small');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('taşırken öğe DOM düğümünü korur', () => {
    const item = makeItem({ id: 'i1' });
    const grid = track(
      new SlotGrid({
        slotCount: 6,
        columns: 3,
        items: { 0: item },
      }),
    );
    mockGridGeometry(grid, 3);

    const itemEl = grid.itemsEl.querySelector('.vol-slot-grid__item') as HTMLDivElement;
    const start = cellCenter(0, 3);
    const end = cellCenter(2, 3);

    itemEl.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: start.x,
        clientY: start.y,
        pointerId: 1,
      }),
    );
    itemEl.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );
    itemEl.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: end.x,
        clientY: end.y,
        pointerId: 1,
      }),
    );

    const movedEl = grid.itemsEl.querySelector('.vol-slot-grid__item') as HTMLDivElement;
    expect(movedEl).toBe(itemEl);
  });
});
