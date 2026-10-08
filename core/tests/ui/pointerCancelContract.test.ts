import { afterEach, describe, expect, it, vi } from 'vitest';
import { Carousel } from '../../src/ui/layout/Carousel';
import { RadialMenu } from '../../src/ui/overlays/RadialMenu';
import { SlotGrid, type SlotItem } from '../../src/ui/hud/SlotGrid';
import { SwipeGestureZone } from '../../src/ui/touch/SwipeGestureZone';

/**
 * Sistem iptali (kesilen dokunma, geri jesti, hareket tanıyıcı) bir BIRAKMA değildir: sürüklemeyi bitirir ama
 * seçim, tıklama, taşıma, sayfa değişimi ya da jest üretmez. Her sürükleme yüzeyi bunu ayrı doğrular.
 */
const tracked: Array<{ destroy(): void }> = [];
afterEach(() => {
  while (tracked.length > 0) tracked.pop()?.destroy();
  document.body.innerHTML = '';
});

function pointer(type: string, init: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, { pointerId: 1, bubbles: true, cancelable: true, ...init });
}

describe('pointercancel sözleşmesi', () => {
  it('RadialMenu: üzerindeki öğeyi seçmeden kapanır', () => {
    const onSelect = vi.fn();
    const menu = new RadialMenu({
      items: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      onSelect,
    });
    tracked.push(menu);
    document.body.appendChild(menu.element);
    vi.spyOn(menu.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    menu.open(100, 100, 1);
    document.dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 50 }));
    document.dispatchEvent(pointer('pointercancel'));
    expect(menu.element.classList.contains('vol-radial-menu--visible')).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('SwipeGestureZone: eşiği aşan sürükleme iptalinde jest üretmez', () => {
    const onSwipe = vi.fn();
    const zone = new SwipeGestureZone({ onSwipe });
    tracked.push(zone);
    document.body.appendChild(zone.element);
    zone.element.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }));
    zone.element.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 0 }));
    zone.element.dispatchEvent(pointer('pointercancel', { clientX: 300, clientY: 0 }));
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('SlotGrid: iptal ne tıklama ne taşıma sayılır; öğe yerinde kalır', () => {
    const item: SlotItem = { id: 'sword', label: 'Kılıç' };
    const onSlotClick = vi.fn();
    const onMove = vi.fn();
    const grid = new SlotGrid({
      slotCount: 4,
      columns: 2,
      items: { 0: item },
      onSlotClick,
      onMove,
    });
    tracked.push(grid);
    const itemEl = grid.itemsEl.querySelector<HTMLDivElement>('.vol-slot-grid__item')!;
    itemEl.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 10, clientY: 10 }));
    itemEl.dispatchEvent(pointer('pointercancel', { clientX: 0, clientY: 0 }));
    expect(onSlotClick).not.toHaveBeenCalled();

    itemEl.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 10, clientY: 10 }));
    itemEl.dispatchEvent(pointer('pointermove', { clientX: 90, clientY: 10 }));
    itemEl.dispatchEvent(pointer('pointercancel', { clientX: 90, clientY: 10 }));
    expect(onMove).not.toHaveBeenCalled();
    expect(grid.getItem(0)).toEqual(item);
    expect(document.querySelector('.vol-slot-grid__ghost')).toBeNull();
  });

  it('Carousel: eşiği aşan sürükleme iptalinde sayfa değişmez', () => {
    const slides = [0, 1, 2].map((id) => ({
      id: String(id),
      element: document.createElement('div'),
    }));
    const carousel = new Carousel({ slides });
    tracked.push(carousel);
    const viewport = carousel.element.querySelector<HTMLDivElement>('.vol-carousel__viewport')!;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 200 });
    viewport.dispatchEvent(pointer('pointerdown', { clientX: 150 }));
    viewport.dispatchEvent(pointer('pointermove', { clientX: 20 }));
    viewport.dispatchEvent(pointer('pointercancel', { clientX: 20 }));
    expect(carousel.getCurrentIndex()).toBe(0);
  });
});
