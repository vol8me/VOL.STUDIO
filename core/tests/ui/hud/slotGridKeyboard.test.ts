import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlotGrid } from '../../../src/ui/hud/SlotGrid';

/**
 * Envanter ızgarası klavye/kol erişimi: sürükleme tek alternatif değildir. Ok tuşları item'lar arasında
 * dolaşır, Space tutar, ok tuşları hedef hücreyi seçer, Space/Enter bırakır, Escape iptal eder; Enter ve kol A
 * (click, detail 0) etkinleştirir. Durumlar canlı bölgeyle duyurulur.
 */
let grid: SlotGrid | null = null;
afterEach(() => {
  grid?.destroy();
  grid = null;
  document.body.replaceChildren();
});

function mount(overrides: Partial<ConstructorParameters<typeof SlotGrid>[0]> = {}): {
  root: HTMLElement;
  onMove: ReturnType<typeof vi.fn>;
  onSlotClick: ReturnType<typeof vi.fn>;
} {
  const onMove = vi.fn();
  const onSlotClick = vi.fn();
  grid = new SlotGrid({
    slotCount: 12,
    columns: 4,
    items: { 0: { id: 'a', label: 'Kılıç' }, 1: { id: 'b', label: 'Kalkan' } },
    onMove,
    onSlotClick,
    ...overrides,
  });
  document.body.append(grid.element);
  return { root: grid.element, onMove, onSlotClick };
}

const itemAt = (root: HTMLElement, index: number): HTMLElement =>
  root.querySelector<HTMLElement>(`.vol-slot-grid__item[data-slot-index="${index}"]`)!;
const key = (target: Element, k: string): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};
const status = (root: HTMLElement): string => root.querySelector('[aria-live]')?.textContent ?? '';

describe('dolaşma', () => {
  it('tek item tabindex=0 alır; ok tuşları item arasında odak taşır', () => {
    const { root } = mount();
    const a = itemAt(root, 0);
    const b = itemAt(root, 1);
    expect([a.tabIndex, b.tabIndex]).toEqual([0, -1]);
    a.focus();
    key(a, 'ArrowRight');
    expect(document.activeElement).toBe(b);
    expect([a.tabIndex, b.tabIndex]).toEqual([-1, 0]);
    key(b, 'ArrowRight');
    expect(document.activeElement).toBe(b);
  });

  it('Enter ve kol A (click, detail 0) etkinleştirir; fare tıklaması çift sayılmaz', () => {
    const { root, onSlotClick } = mount();
    const a = itemAt(root, 0);
    a.focus();
    key(a, 'Enter');
    expect(onSlotClick).toHaveBeenCalledTimes(1);
    a.click();
    expect(onSlotClick).toHaveBeenCalledTimes(2);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(onSlotClick).toHaveBeenCalledTimes(2);
  });
});

describe('klavyeyle taşıma', () => {
  it('Space tutar, ok tuşları hedefi seçer, Space bırakır; onMove çağrılır ve odak taşınan item’da kalır', () => {
    const { root, onMove } = mount();
    const a = itemAt(root, 0);
    a.focus();
    key(a, ' ');
    expect(status(root)).toContain('Kılıç');
    key(a, 'ArrowDown');
    expect(status(root)).toContain('5');
    expect(root.querySelector('.vol-slot-grid__cell--drag-over')).not.toBeNull();
    key(a, ' ');
    expect(onMove).toHaveBeenCalledWith('a', 0, 4);
    expect(document.activeElement).toBe(itemAt(root, 4));
    expect(root.querySelector('.vol-slot-grid__cell--drag-over')).toBeNull();
  });

  it('dolu hedefe bırakma (takas teklifi yok) reddedilir ve item tutulmaya devam eder', () => {
    const { root, onMove } = mount();
    const a = itemAt(root, 0);
    a.focus();
    key(a, ' ');
    key(a, 'ArrowRight');
    expect(root.querySelector('.vol-slot-grid__cell--drag-rejected')).not.toBeNull();
    key(a, ' ');
    expect(onMove).not.toHaveBeenCalled();
    expect(a.classList.contains('vol-slot-grid__item--dragging')).toBe(true);
  });

  it('takas teklifi kabul edilirse dolu hedefle yer değiştirir', () => {
    const onSwapRequest = vi.fn(() => true);
    const { root, onMove } = mount({ onSwapRequest });
    const a = itemAt(root, 0);
    a.focus();
    key(a, ' ');
    key(a, 'ArrowRight');
    key(a, 'Enter');
    expect(onSwapRequest).toHaveBeenCalledWith('a', 0, 1);
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('Escape iptal eder ve tuşu yutar; odak dışına çıkınca da iptal olur', () => {
    const { root, onMove } = mount();
    const later = vi.fn();
    document.addEventListener('keydown', later);
    const a = itemAt(root, 0);
    a.focus();
    key(a, ' ');
    key(a, 'ArrowDown');
    later.mockClear();
    key(a, 'Escape');
    expect(later).not.toHaveBeenCalled();
    expect(a.classList.contains('vol-slot-grid__item--dragging')).toBe(false);
    expect(root.querySelector('.vol-slot-grid__cell--drag-over')).toBeNull();
    expect(onMove).not.toHaveBeenCalled();

    key(a, ' ');
    a.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    expect(a.classList.contains('vol-slot-grid__item--dragging')).toBe(false);
    document.removeEventListener('keydown', later);
  });
});
