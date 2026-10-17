import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kanban } from '../../../src/ui/data/Kanban';
import { inlineSign, isRtl } from '../../../src/ui/direction';
import { SlotGrid } from '../../../src/ui/hud/SlotGrid';
import { Accordion } from '../../../src/ui/layout/Accordion';
import { Carousel } from '../../../src/ui/layout/Carousel';
import { Tabs } from '../../../src/ui/layout/Tabs';
import { Tree } from '../../../src/ui/layout/Tree';
import { SegmentedControl } from '../../../src/ui/primitives/SegmentedControl';
import { Toolbar } from '../../../src/ui/primitives/Toolbar';

/**
 * Yazı yönü (UI-07.2) ve yerleşim yaşam döngüsü (UI-05.3): okuma yönünü izleyen yapılarda yatay ok mantıksal
 * ileridir (RTL'de sol ok sonraki), fiziksel denetimler aynalanmaz; gizli sekme paneli etkileşimsizdir;
 * tekli Accordion tek bölüm açar.
 */
afterEach(() => {
  document.documentElement.removeAttribute('dir');
  document.body.replaceChildren();
});

const press = (target: Element, key: string): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

function withDir<T>(dir: 'ltr' | 'rtl', build: () => T): T {
  document.documentElement.setAttribute('dir', dir);
  return build();
}

describe('yön yardımcısı', () => {
  it('en yakın dir özniteliği kazanır; iç içe ltr kök rtl’yi ezer', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    inner.setAttribute('dir', 'ltr');
    outer.append(inner);
    document.body.append(outer);
    expect([isRtl(outer), isRtl(inner)]).toEqual([true, false]);
    expect([inlineSign(outer), inlineSign(inner)]).toEqual([-1, 1]);
  });
});

describe('RTL: sağ ok okuma yönünde geri gider', () => {
  const tabDefs = ['a', 'b', 'c'].map((id) => ({
    id,
    label: id,
    content: { element: document.createElement('div') },
  }));
  const defs = () =>
    tabDefs.map((tab) => ({ ...tab, content: { element: document.createElement('div') } }));

  it.each([
    ['ltr', 'ArrowRight', 'b'],
    ['ltr', 'ArrowLeft', 'c'],
    ['rtl', 'ArrowLeft', 'b'],
    ['rtl', 'ArrowRight', 'c'],
  ] as const)('Tabs %s %s → %s', (dir, key, expected) => {
    const tabs = withDir(dir, () => new Tabs(defs()));
    document.body.append(tabs.element);
    const first = tabs.element.querySelector<HTMLButtonElement>('[role="tab"]')!;
    first.focus();
    press(first, key);
    expect(tabs.element.querySelector('[aria-selected="true"]')!.textContent).toBe(expected);
    tabs.destroy();
  });

  it('Toolbar yatayda RTL’de sol ok sonraki düğmedir', () => {
    const toolbar = withDir(
      'rtl',
      () =>
        new Toolbar({
          ariaLabel: 'Araçlar',
          items: [
            { id: 'a', label: 'A', text: 'A' },
            { id: 'b', label: 'B', text: 'B' },
          ],
        }),
    );
    document.body.append(toolbar.element);
    toolbar.getButton('a')?.focus();
    press(toolbar.element, 'ArrowLeft');
    expect(document.activeElement).toBe(toolbar.getButton('b')?.element);
    toolbar.destroy();
  });

  it('SegmentedControl önceki davranışını korur (RTL’de sol ok sonraki)', () => {
    const control = withDir(
      'rtl',
      () =>
        new SegmentedControl({
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
          value: 'a',
        }),
    );
    document.body.append(control.element);
    const first = control.element.querySelector('button')!;
    first.focus();
    press(first, 'ArrowLeft');
    expect(control.getValue()).toBe('b');
    control.destroy();
  });

  it('Tree: RTL’de sol ok açar/iner, sağ ok kapatır/ebeveyne çıkar', () => {
    const tree = withDir(
      'rtl',
      () => new Tree([{ id: 'root', label: 'Kök', children: [{ id: 'leaf', label: 'Yaprak' }] }]),
    );
    document.body.append(tree.element);
    const root = tree.element.querySelector<HTMLElement>('[role="treeitem"]')!;
    const row = root.querySelector<HTMLElement>('.vol-tree__row')!;
    expect(root.getAttribute('aria-expanded')).toBe('false');
    press(row, 'ArrowRight');
    expect(root.getAttribute('aria-expanded')).toBe('false');
    press(row, 'ArrowLeft');
    expect(root.getAttribute('aria-expanded')).toBe('true');
    press(row, 'ArrowRight');
    expect(root.getAttribute('aria-expanded')).toBe('false');
    tree.destroy();
  });

  it('Carousel: RTL’de iz sağa kayar, sol ok/düğme sonraki sayfadır, etiketler yönü izler', () => {
    const slides = ['1', '2', '3'].map((text) => {
      const element = document.createElement('div');
      element.textContent = text;
      return { id: text, element };
    });
    const onSlideChange = vi.fn();
    const carousel = withDir('rtl', () => new Carousel({ slides, onSlideChange }));
    document.body.append(carousel.element);
    const track = carousel.element.querySelector<HTMLElement>('.vol-carousel__track')!;
    expect(track.style.transform).toBe('translateX(0%)');

    const [left, right] =
      carousel.element.querySelectorAll<HTMLButtonElement>('.vol-carousel__arrow');
    left.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(left.getAttribute('aria-label')).toBe('Sonraki');
    expect(right.getAttribute('aria-label')).toBe('Önceki');

    // Sayfa 0'da RTL'de "sonraki" (sol) etkin, "önceki" (sağ) kenarda kapalıdır (yön ekleme sonrası okunur).
    expect([left.getAttribute('aria-disabled'), right.getAttribute('aria-disabled')]).toEqual([
      'false',
      'true',
    ]);

    left.click();
    expect(carousel.getCurrentIndex()).toBe(1);
    expect(track.style.transform).toBe('translateX(100%)');
    right.click();
    expect(carousel.getCurrentIndex()).toBe(0);
    expect(onSlideChange).toHaveBeenCalledTimes(2);
    carousel.destroy();
  });

  it('SlotGrid: RTL’de sağ ok soldaki (önceki indeks) hücredir', () => {
    const grid = withDir(
      'rtl',
      () =>
        new SlotGrid({
          slotCount: 4,
          columns: 4,
          items: { 0: { id: 'a', label: 'A' }, 1: { id: 'b', label: 'B' } },
        }),
    );
    document.body.append(grid.element);
    const item = (index: number) =>
      grid.element.querySelector<HTMLElement>(`.vol-slot-grid__item[data-slot-index="${index}"]`)!;
    item(1).focus();
    press(item(1), 'ArrowRight');
    expect(document.activeElement).toBe(item(0));
    grid.destroy();
  });

  it('Kanban: RTL’de sol ok kartı sonraki sütuna, sağ ok bir önceki sütuna taşır', () => {
    const onCardMove = vi.fn();
    const kanban = withDir(
      'rtl',
      () =>
        new Kanban({
          columns: [
            { id: 'first', title: 'İlk', cards: [{ id: 'c', title: 'Kart' }] },
            { id: 'second', title: 'İkinci', cards: [] },
          ],
          onCardMove,
        }),
    );
    document.body.append(kanban.element);
    const card = () => kanban.element.querySelector<HTMLElement>('[data-card-id="c"]')!;
    card().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    card().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onCardMove).not.toHaveBeenCalled();
    card().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(onCardMove).toHaveBeenLastCalledWith('c', 'first', 'second', 0);
    card().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onCardMove).toHaveBeenLastCalledWith('c', 'second', 'first', 0);
    kanban.destroy();
  });
});

describe('yerleşim yaşam döngüsü', () => {
  it('Tabs gizli paneli etkileşimsizdir (inert + aria-hidden); seçim değişince yer değiştirir', () => {
    const elements = ['a', 'b'].map(() => document.createElement('div'));
    const tabs = new Tabs(
      elements.map((element, index) => ({
        id: String(index),
        label: String(index),
        content: { element },
      })),
    );
    document.body.append(tabs.element);
    expect([elements[0].inert, elements[1].inert]).toEqual([false, true]);
    tabs.select('1');
    expect([elements[0].inert, elements[1].inert]).toEqual([true, false]);
    expect(elements[0].getAttribute('aria-hidden')).toBe('true');
    expect(elements[1].getAttribute('aria-hidden')).toBe('false');
    tabs.destroy();
  });

  it('Tree kapalı dalı etkileşimsizdir; kapanan dalın içindeki odak ve sekme durağı sahibi satıra taşınır', () => {
    const tree = new Tree([
      {
        id: 'root',
        label: 'Kök',
        expanded: true,
        children: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
      { id: 'other', label: 'Öteki', children: [{ id: 'c', label: 'C' }] },
    ]);
    document.body.append(tree.element);
    const outers = tree.element.querySelectorAll<HTMLElement>('.vol-tree__children-outer');
    expect([outers[0].inert, outers[1].inert]).toEqual([false, true]);

    const rows = tree.element.querySelectorAll<HTMLElement>('.vol-tree__row');
    const [rootRow, rowA] = rows;
    rowA.tabIndex = 0;
    rowA.focus();
    expect(document.activeElement).toBe(rowA);
    // Odak A'dayken kök satır kapatılır (örn. işaretçiyle ya da başka bir kısayolla).
    press(rootRow, 'ArrowLeft');
    expect(rootRow.closest('li')!.getAttribute('aria-expanded')).toBe('false');
    expect(outers[0].inert).toBe(true);
    expect(rootRow.tabIndex).toBe(0);
    expect(rowA.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(rootRow);

    press(rootRow, 'ArrowRight');
    expect(outers[0].inert).toBe(false);
    tree.destroy();
  });

  it('tekli Accordion birden çok defaultOpen verilse de yalnız ilk geçerli bölümü açar; bilinmeyen kimlik yok sayılır', () => {
    const section = (id: string) => ({
      id,
      title: id,
      content: { element: document.createElement('div') },
    });
    const accordion = new Accordion([section('a'), section('b'), section('c')], {
      defaultOpen: ['x', 'b', 'c'],
    });
    const open = () =>
      [...accordion.element.querySelectorAll('.vol-accordion__header')]
        .filter((header) => header.getAttribute('aria-expanded') === 'true')
        .map((header) => header.textContent);
    expect(open()).toEqual(['b']);
    accordion.open('missing');
    expect(open()).toEqual(['b']);
    accordion.open('c');
    expect(open()).toEqual(['c']);

    const multi = new Accordion([section('a'), section('b')], {
      singleOpen: false,
      defaultOpen: ['a', 'b'],
    });
    expect(
      multi.element.querySelectorAll('.vol-accordion__header[aria-expanded="true"]'),
    ).toHaveLength(2);
    accordion.destroy();
    multi.destroy();
  });
});
