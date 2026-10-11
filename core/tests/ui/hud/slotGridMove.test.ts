import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SlotGrid, type SlotItem } from '../../../src/ui/hud/SlotGrid';
import { uiIntentBusFor, type UiIntent } from '../../../src/ui/feedback/uiIntent';
import { cellCenter, mockGridGeometry, stubPointerCapture } from '../../support/slotGridGeometry';

/**
 * UI-08.3: SlotGrid taşıma akışı. Sürükleme tek yol değildir: `beginMove()` ile (ya da Boşluk ile) tutulan öğeyi oklar/D-pad
 * hedefe götürür, kol A / Boşluk / Enter bırakır, B / Escape vazgeçer; dokunmada bir hücreye ya da öğeye dokunmak hedefi
 * seçip bırakır. Tutulan öğe yön girdisini `data-vol-arrows` ile kendisi alır (D-pad komşu öğeye kaçmaz).
 */
const COLUMNS = 4;
let grid: SlotGrid | null = null;

beforeAll(stubPointerCapture);

afterEach(() => {
  grid?.destroy();
  grid = null;
  document.body.replaceChildren();
});

const item = (id: string, label = id): SlotItem => ({ id, label });

function mount(items: Record<number, SlotItem>, swap = false) {
  const root = document.createElement('div');
  document.body.append(root);
  const handle = uiIntentBusFor(root);
  const seen: UiIntent[] = [];
  handle.bus.subscribe({ onIntent: (intent) => seen.push(intent) });
  const onMove = vi.fn();
  grid = new SlotGrid({
    slotCount: 12,
    columns: COLUMNS,
    items,
    onMove,
    onSwapRequest: swap ? () => true : undefined,
  });
  root.append(grid.element);
  mockGridGeometry(grid, COLUMNS);
  return { grid, seen, onMove, release: handle.release };
}

const itemAt = (index: number): HTMLElement =>
  grid!.element.querySelector<HTMLElement>(`.vol-slot-grid__item[data-slot-index="${index}"]`)!;
const cellAt = (index: number): HTMLElement =>
  grid!.element.querySelector<HTMLElement>(`.vol-slot-grid__cell[data-slot-index="${index}"]`)!;
const key = (target: Element, k: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};
const kinds = (seen: UiIntent[]): string[] =>
  seen.map((intent) => `${intent.kind}:${intent.origin}`);
const status = (): string => grid!.element.querySelector('[aria-live]')?.textContent ?? '';
/** Gerçek dokunma: aynı noktada basış + bırakış (eşik altı = tıklama), ardından uyumluluk fare tıklaması. */
function tap(target: Element, at: number): void {
  const { x, y } = cellCenter(at, COLUMNS);
  const init = {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
    pointerId: 7,
    pointerType: 'touch',
    isPrimary: true,
  };
  target.dispatchEvent(new PointerEvent('pointerdown', init));
  target.dispatchEvent(new PointerEvent('pointerup', init));
  target.dispatchEvent(
    new MouseEvent('click', { bubbles: true, detail: 1, clientX: x, clientY: y }),
  );
}

describe('SlotGrid taşıma akışı (kol / klavye)', () => {
  it('SlotGrid beginMove odaktaki öğeyi tutar; yön girdisi ve basılı durum öğede toplanır', () => {
    const { grid: g } = mount({ 0: item('a'), 5: item('b') });
    itemAt(5).focus();
    expect(g.beginMove()).toBe(true);
    expect(g.isMoving).toBe(true);
    expect(itemAt(5).dataset.volArrows).toBe('both');
    expect(itemAt(5).getAttribute('aria-pressed')).toBe('true');
    expect(itemAt(0).hasAttribute('data-vol-arrows')).toBe(false);
    expect(g.element.classList.contains('vol-slot-grid--moving')).toBe(true);
    expect(document.activeElement).toBe(itemAt(5));
    expect(status()).toContain('b');
  });

  it('SlotGrid beginMove(index) belirli öğeyi tutar; boş hücrede, boş ızgarada ve çift çağrıda false', () => {
    const { grid: g } = mount({ 0: item('a'), 5: item('b') });
    expect(g.beginMove(3)).toBe(false);
    expect(g.isMoving).toBe(false);
    expect(g.beginMove(0)).toBe(true);
    expect(itemAt(0).dataset.volArrows).toBe('both');
    expect(g.beginMove(5)).toBe(false);
    g.destroy();
    grid = null;
    const empty = mount({});
    expect(empty.grid.beginMove()).toBe(false);
  });

  it('SlotGrid kol akışı: D-pad (sentetik ok) hedefi seçer, A (click detail 0) bırakır, onMove çağrılır', () => {
    const { grid: g, seen, onMove } = mount({ 0: item('a') });
    g.beginMove(0);
    const held = itemAt(0);
    // FocusNavController tutulan öğeye sentetik ok olayı gönderir; öğe olayı tüketir (spatial gezinme yok).
    expect(key(held, 'ArrowRight').defaultPrevented).toBe(true);
    expect(key(held, 'ArrowDown').defaultPrevented).toBe(true);
    expect(status()).toContain('6');
    held.click();
    expect(onMove).toHaveBeenCalledWith('a', 0, 5);
    expect(g.isMoving).toBe(false);
    expect(held.hasAttribute('data-vol-arrows')).toBe(false);
    expect(held.hasAttribute('aria-pressed')).toBe(false);
    expect(g.element.classList.contains('vol-slot-grid--moving')).toBe(false);
    expect(document.activeElement).toBe(itemAt(5));
    expect(kinds(seen)).toEqual(['drop:SlotGrid']);
  });

  it('SlotGrid B/Escape ya da cancelMove vazgeçer; öğe yerinde kalır, öznitelikler temizlenir', () => {
    const { grid: g, onMove } = mount({ 0: item('a') });
    g.beginMove(0);
    key(itemAt(0), 'ArrowRight');
    expect(key(itemAt(0), 'Escape').defaultPrevented).toBe(true);
    expect(g.isMoving).toBe(false);
    expect(g.getItem(0)?.id).toBe('a');
    expect(itemAt(0).hasAttribute('data-vol-arrows')).toBe(false);
    g.beginMove(0);
    g.cancelMove();
    expect(g.isMoving).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('SlotGrid tutulmuyorken kol A etkinleştirir (onSlotClick), taşıma başlatmaz', () => {
    const onSlotClick = vi.fn();
    grid = new SlotGrid({ slotCount: 8, columns: 4, items: { 0: item('a') }, onSlotClick });
    document.body.append(grid.element);
    itemAt(0).click();
    expect(onSlotClick).toHaveBeenCalledTimes(1);
    expect(grid.isMoving).toBe(false);
  });

  it('SlotGrid programatik beginMove sessizdir; tutulan öğe odak dışına çıkınca bırakılır', () => {
    const { grid: g, seen } = mount({ 0: item('a'), 1: item('b') });
    g.beginMove(0);
    expect(seen).toEqual([]);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    itemAt(0).dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    expect(g.isMoving).toBe(false);
  });
});

describe('SlotGrid tek niyet', () => {
  it('SlotGrid sürükle-bırak sonrası gelen uyumluluk click kök yedeğinde ikinci press üretmez', () => {
    const { seen } = mount({ 0: item('a') });
    const source = itemAt(0);
    const base = { bubbles: true, button: 0, pointerId: 4, pointerType: 'mouse', isPrimary: true };
    const at = (index: number) => ({
      clientX: cellCenter(index, COLUMNS).x,
      clientY: cellCenter(index, COLUMNS).y,
    });
    source.dispatchEvent(new PointerEvent('pointerdown', { ...base, ...at(0) }));
    source.dispatchEvent(new PointerEvent('pointermove', { ...base, ...at(1) }));
    source.dispatchEvent(new PointerEvent('pointermove', { ...base, ...at(2) }));
    source.dispatchEvent(new PointerEvent('pointerup', { ...base, ...at(2) }));
    source.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(kinds(seen)).toEqual(['pick:SlotGrid', 'drop:SlotGrid']);
  });

  it('SlotGrid bırakma hücresi alt-piksel sapmaya dayanıklıdır (gerçek dokunuş koordinatı tam hücre sınırına denk gelmez)', () => {
    // Öğe hücre merkezinden tutulup hedef hücrenin merkezine bırakılır: hayalet öğenin köşesi tam hücre sınırındadır. Parmak
    // koordinatı tamsayı olmadığından 0,4 px sapma köşeyi bir önceki hücreye (burada dolu) düşürüyordu: bırakma reddediliyordu.
    const { seen, onMove } = mount({ 0: item('a'), 1: item('b') });
    const source = itemAt(0);
    const base = { bubbles: true, button: 0, pointerId: 6, pointerType: 'touch', isPrimary: true };
    const start = cellCenter(0, COLUMNS);
    const end = cellCenter(2, COLUMNS);
    source.dispatchEvent(
      new PointerEvent('pointerdown', { ...base, clientX: start.x, clientY: start.y }),
    );
    for (const [x, y] of [
      [end.x - 20, end.y - 0.4],
      [end.x - 0.4, end.y - 0.4],
    ] as const) {
      source.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: x, clientY: y }));
    }
    source.dispatchEvent(
      new PointerEvent('pointerup', { ...base, clientX: end.x - 0.4, clientY: end.y - 0.4 }),
    );
    expect(kinds(seen)).toEqual(['pick:SlotGrid', 'drop:SlotGrid']);
    expect(onMove).toHaveBeenCalledWith('a', 0, 2);
  });

  it('SlotGrid eşik altı fare tıklaması yine kök yedeğinden tek press alır (etkinleştirme)', () => {
    const { seen } = mount({ 0: item('a') });
    tap(itemAt(0), 0);
    expect(kinds(seen)).toEqual(['press:auto']);
  });
});

describe('SlotGrid dokun-yerleştir', () => {
  it('SlotGrid tutulan öğe varken boş hücreye dokunmak hedefi seçip bırakır; tek drop niyeti', () => {
    const { grid: g, seen, onMove } = mount({ 0: item('a') });
    g.beginMove(0);
    cellAt(6).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith('a', 0, 6);
    expect(g.isMoving).toBe(false);
    expect(kinds(seen)).toEqual(['drop:SlotGrid']);
    expect(status()).toContain('7');
  });

  it('SlotGrid tutulmuyorken hücre dokunuşu hiçbir şey yapmaz', () => {
    const { seen, onMove } = mount({ 0: item('a') });
    cellAt(6).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(onMove).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('SlotGrid hücreye basış odağı tutulan öğeden almaz (mousedown iptal edilir)', () => {
    const { grid: g } = mount({ 0: item('a') });
    const idle = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    cellAt(6).dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
    g.beginMove(0);
    const held = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    cellAt(6).dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
  });

  it('SlotGrid dolu öğeye dokunmak takas tarifi varsa yer değiştirir', () => {
    const { grid: g, onMove } = mount({ 0: item('a'), 2: item('b') }, true);
    g.beginMove(0);
    tap(itemAt(2), 2);
    expect(g.getItem(0)?.id).toBe('b');
    expect(g.getItem(2)?.id).toBe('a');
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(g.isMoving).toBe(false);
  });

  it('SlotGrid takas tarifi yoksa dolu öğeye dokunmak reddedilir; öğe tutulmaya devam eder ve odak ona döner', () => {
    const { grid: g, seen, onMove } = mount({ 0: item('a'), 2: item('b') });
    g.beginMove(0);
    tap(itemAt(2), 2);
    expect(onMove).not.toHaveBeenCalled();
    expect(g.isMoving).toBe(true);
    expect(kinds(seen)).toEqual(['reject:SlotGrid']);
    expect(document.activeElement).toBe(itemAt(0));
    expect(status()).toContain('a');
  });

  it('SlotGrid tutulan öğenin kendi hücresine dokunmak vazgeçmektir', () => {
    const { grid: g, onMove } = mount({ 0: item('a') });
    g.beginMove(0);
    tap(itemAt(0), 0);
    expect(g.isMoving).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
    expect(g.getItem(0)?.id).toBe('a');
  });

  it('SlotGrid işaretçi sürüklemesi başlarsa tutulan öğe bırakılır (iki taşıma birlikte sürmez)', () => {
    const { grid: g } = mount({ 0: item('a'), 5: item('b') });
    g.beginMove(0);
    const target = itemAt(5);
    const down = cellCenter(5, COLUMNS);
    const far = cellCenter(7, COLUMNS);
    const base = { bubbles: true, button: 0, pointerId: 9, pointerType: 'mouse', isPrimary: true };
    target.dispatchEvent(
      new PointerEvent('pointerdown', { ...base, clientX: down.x, clientY: down.y }),
    );
    target.dispatchEvent(
      new PointerEvent('pointermove', { ...base, clientX: far.x, clientY: far.y }),
    );
    expect(g.isMoving).toBe(false);
    target.dispatchEvent(
      new PointerEvent('pointercancel', { ...base, clientX: far.x, clientY: far.y }),
    );
  });
});
