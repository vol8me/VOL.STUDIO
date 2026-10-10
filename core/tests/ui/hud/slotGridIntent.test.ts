import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SlotGrid, type SlotItem } from '../../../src/ui/hud/SlotGrid';
import { uiIntentBusFor, type UiIntent } from '../../../src/ui/feedback/uiIntent';
import { cellCenter, mockGridGeometry, stubPointerCapture } from '../../support/slotGridGeometry';

/**
 * Sürükle-bırak ses niyeti GERÇEK işaretçi akışıyla: kaldırma `pick`, geçerli bırakma `drop`,
 * reddedilen bırakma `reject`; iptal ve eşik altı hareket (tıklama) sessizdir.
 */
const COLUMNS = 4;
let grid: SlotGrid | null = null;

beforeAll(stubPointerCapture);

afterEach(() => {
  grid?.destroy();
  grid = null;
  document.body.replaceChildren();
});

const item = (id: string, overrides: Partial<SlotItem> = {}): SlotItem => ({
  id,
  label: id,
  ...overrides,
});

function mount(items: Record<number, SlotItem>) {
  const root = document.createElement('div');
  document.body.append(root);
  const handle = uiIntentBusFor(root);
  const seen: UiIntent[] = [];
  handle.bus.subscribe({ onIntent: (intent) => seen.push(intent) });
  grid = new SlotGrid({ slotCount: 12, columns: COLUMNS, items });
  root.append(grid.element);
  mockGridGeometry(grid, COLUMNS);
  const source = grid.itemsEl.querySelector<HTMLElement>('.vol-slot-grid__item')!;
  const pointer = (type: string, at: number, pointerId = 1): void => {
    const { x, y } = cellCenter(at, COLUMNS);
    source.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: y,
        pointerId,
        pointerType: 'mouse',
      }),
    );
  };
  return { seen, pointer, release: handle.release };
}

const kinds = (seen: UiIntent[]): string[] =>
  seen.map((intent) => `${intent.kind}:${intent.origin}`);

describe('SlotGrid sürükleme niyeti (gerçek işaretçi)', () => {
  it('boş hücreye bırakma: kaldırma ve bırakma birer niyet, ikisi de işaretçi kaynaklı', () => {
    const { seen, pointer, release } = mount({ 0: item('a') });
    pointer('pointerdown', 0);
    pointer('pointermove', 1);
    pointer('pointermove', 2);
    pointer('pointerup', 2);
    expect(kinds(seen)).toEqual(['pick:SlotGrid', 'drop:SlotGrid']);
    expect(seen.map((intent) => intent.source)).toEqual(['pointer', 'pointer']);
    release();
  });

  it('dolu hücreye (takas tarifi yok) bırakma reddedilir: reject niyeti, öğe yerinde', () => {
    const { seen, pointer, release } = mount({ 0: item('a'), 2: item('b') });
    pointer('pointerdown', 0);
    pointer('pointermove', 2);
    pointer('pointerup', 2);
    expect(kinds(seen)).toEqual(['pick:SlotGrid', 'reject:SlotGrid']);
    expect(grid!.getItem(0)?.id).toBe('a');
    release();
  });

  it('pointercancel sessizdir: ne bırakma ne ret', () => {
    const { seen, pointer, release } = mount({ 0: item('a') });
    pointer('pointerdown', 0);
    pointer('pointermove', 2);
    pointer('pointercancel', 2);
    expect(kinds(seen)).toEqual(['pick:SlotGrid']);
    release();
  });

  it('eşik altı hareket tıklamadır: kaldırma niyeti yok', () => {
    const { seen, pointer, release } = mount({ 0: item('a') });
    pointer('pointerdown', 0);
    pointer('pointerup', 0);
    expect(seen).toEqual([]);
    release();
  });
});
