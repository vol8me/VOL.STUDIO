import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardTile, CARD_ENTER_ANIMATION_MS } from '../../src/ui/cards/CardTile';
import { Carousel } from '../../src/ui/controls/Carousel';
import { SwipeableCardStack } from '../../src/ui/controls/SwipeableCardStack';
import { DataTable } from '../../src/ui/data/DataTable';
import { ActionBar } from '../../src/ui/hud/ActionBar';
import { SplitPane } from '../../src/ui/layout/SplitPane';
import { Tabs } from '../../src/ui/layout/Tabs';
import { Tree } from '../../src/ui/layout/Tree';
import { RangeSlider } from '../../src/ui/primitives/RangeSlider';
import { UI_TIMING } from '../../src/constants';

const tracked: Array<{ destroy(): void }> = [];

function track<T extends { destroy(): void }>(value: T): T {
  tracked.push(value);
  return value;
}

function pointer(
  type: string,
  init: Partial<PointerEventInit> & { pointerId: number; clientX?: number; clientY?: number },
): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
}

afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('Tabs uç davranışları', () => {
  function definitions(destroy = vi.fn()) {
    return ['a', 'b', 'c'].map((id) => ({
      id,
      label: id.toUpperCase(),
      content: { element: document.createElement('section'), destroy },
    }));
  }

  it('boş tanımı reddeder; dikey başlık, seçim ve cleanup sözleşmesini uygular', () => {
    expect(() => new Tabs([])).toThrow(/en az bir/);
    const destroy = vi.fn();
    const onChange = vi.fn();
    const header = document.createElement('header');
    const tabs = track(
      new Tabs(definitions(destroy), { orientation: 'vertical', listHeader: header, onChange }),
    );
    document.body.appendChild(tabs.element);

    expect(tabs.element.classList.contains('vol-tabs--vertical')).toBe(true);
    expect(header.parentElement?.firstElementChild).toBe(header);
    const buttons = tabs.element.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[1].click();
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(buttons[0].tabIndex).toBe(-1);
    expect(buttons[1].tabIndex).toBe(0);
    tabs.select('b');
    tabs.select('yok');
    expect(onChange).toHaveBeenCalledTimes(1);

    tabs.destroy();
    tracked.pop();
    expect(destroy).toHaveBeenCalledTimes(3);
    expect(tabs.element.isConnected).toBe(false);
  });

  it('yatay ve dikey klavye yönlerini, Home/End ve ilgisiz tuşu ayırır', () => {
    const horizontal = track(new Tabs(definitions()));
    document.body.appendChild(horizontal.element);
    const horizontalButtons =
      horizontal.element.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    horizontalButtons[0].focus();
    horizontalButtons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(horizontalButtons[2]);
    horizontalButtons[2].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(horizontalButtons[0]);
    horizontalButtons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(horizontalButtons[2]);
    const ignored = new KeyboardEvent('keydown', { key: 'Space', bubbles: true, cancelable: true });
    horizontalButtons[2].dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false);

    const vertical = track(new Tabs(definitions(), { orientation: 'vertical' }));
    document.body.appendChild(vertical.element);
    const verticalButtons = vertical.element.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    verticalButtons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(verticalButtons[1]);
    verticalButtons[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(verticalButtons[0]);
  });
});

describe('Tree klavye ve içerik sınırları', () => {
  function treeNodes() {
    const icon = document.createElement('em');
    icon.textContent = 'N';
    return [
      {
        id: 'root',
        label: 'Kök',
        icon: '📁',
        expanded: true,
        children: [
          { id: 'child', label: 'Çocuk', icon },
          { id: 'disabled', label: 'Kilitli', disabled: true },
        ],
      },
      { id: 'leaf', label: 'Yaprak' },
    ];
  }

  it('ikon çeşitleri, expanded başlangıcı ve programatik tekli seçim güvenlidir', () => {
    const tree = track(new Tree(treeNodes()));
    document.body.appendChild(tree.element);
    const items = tree.element.querySelectorAll('[role="treeitem"]');
    expect(items[0].getAttribute('aria-expanded')).toBe('true');
    expect(tree.element.textContent).toContain('📁');
    expect(tree.element.querySelector('em')?.textContent).toBe('N');
    tree.select('child');
    tree.select('leaf');
    expect(tree.element.querySelector('[aria-selected="true"] .vol-tree__label')?.textContent).toBe(
      'Yaprak',
    );
    tree.select('olmayan');
    expect(tree.element.querySelector('[aria-selected="true"]')).toBeNull();
  });

  it('tam klavye ağacında aç/kapat, çocuğa/ebeveyne ve uçlara odaklanır', () => {
    const onSelect = vi.fn();
    const tree = track(new Tree(treeNodes(), { selectableFolders: true, onSelect }));
    document.body.appendChild(tree.element);
    const row = (id: string) =>
      tree.element.querySelector<HTMLElement>(
        `[role="treeitem"]:has(.vol-tree__label) [data-none]`,
      ) ??
      [...tree.element.querySelectorAll<HTMLDivElement>('.vol-tree__row')].find(
        (candidate) => candidate.querySelector('.vol-tree__label')?.textContent === id,
      )!;
    const root = row('Kök');
    const child = row('Çocuk');
    const leaf = row('Yaprak');

    root.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(child);
    child.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(root);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(root.closest('[role="treeitem"]')?.getAttribute('aria-expanded')).toBe('false');
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(root.closest('[role="treeitem"]')?.getAttribute('aria-expanded')).toBe('true');
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(leaf);
    leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(root);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('root');
    const ignored = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    root.dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false);
  });

  it('multiSelect programatik toggle ve boş ağaç davranışını korur', () => {
    const onSelectionChange = vi.fn();
    const tree = track(new Tree(treeNodes(), { multiSelect: true, onSelectionChange }));
    expect(tree.element.getAttribute('aria-multiselectable')).toBe('true');
    tree.select('leaf');
    tree.select('leaf');
    tree.select('olmayan');
    expect(tree.getSelectedIds()).toEqual([]);
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);

    const empty = track(new Tree([]));
    expect(empty.element.querySelector('[tabindex="0"]')).toBeNull();
  });
});

describe('CardTile durum geçişleri', () => {
  const data = {
    id: 'card',
    title: 'Başlık',
    description: 'Açıklama',
    rarity: 'rare' as const,
  };

  it('rozet ve fiyatı yoktan ekler, günceller ve yeniden kaldırır', () => {
    const tile = track(new CardTile({ data, compact: true, className: 'custom' }));
    expect(tile.element.className).toContain('vol-card--compact');
    expect(tile.element.className).toContain('custom');
    expect(tile.element.querySelector('.vol-card__badges')).toBeNull();

    tile.update({
      title: 'Yeni',
      description: 'Yeni açıklama',
      rarity: 'epic',
      rarityLabel: 'EPİK',
      typeLabel: 'TİP',
      priceLabel: '12',
    });
    expect(tile.element.textContent).toContain('Yeni açıklama');
    expect(tile.element.classList.contains('vol-card--epic')).toBe(true);
    expect(tile.element.querySelector('.vol-card__rarity')?.textContent).toBe('EPİK');
    expect(tile.element.querySelector('.vol-card__type')?.textContent).toBe('TİP');
    expect(tile.element.querySelector('.vol-card__price')?.textContent).toBe('12');

    tile.update({ rarity: 'epic', rarityLabel: 'E', typeLabel: 'T', priceLabel: '13' });
    expect(tile.element.querySelector('.vol-card__price')?.textContent).toBe('13');
    tile.update({ rarityLabel: '', typeLabel: '', priceLabel: '' });
    expect(tile.element.querySelector('.vol-card__badges')).toBeNull();
    expect(tile.element.querySelector('.vol-card__price')).toBeNull();
  });

  it('birincil/ikincil aksiyonları ekler, günceller, sıralar ve kaldırır', () => {
    const primary = vi.fn();
    const secondary = vi.fn();
    const tile = track(new CardTile({ data, onAction: primary }));

    tile.setSecondaryAction('İKİNCİ', secondary);
    tile.setActionLabel('BİRİNCİ');
    const buttons = tile.element.querySelectorAll<HTMLButtonElement>('.vol-card__action');
    expect(buttons[0].textContent).toBe('BİRİNCİ');
    expect(buttons[1].textContent).toBe('İKİNCİ');
    buttons[0].click();
    buttons[1].click();
    expect(primary).toHaveBeenCalledWith('card');
    expect(secondary).toHaveBeenCalledWith('card');

    tile.setActionLabel('YENİ');
    tile.setSecondaryAction('YENİ İKİ', secondary);
    expect(buttons[0].textContent).toBe('YENİ');
    expect(buttons[1].textContent).toBe('YENİ İKİ');
    tile.setActionLabel(undefined);
    tile.setSecondaryAction(undefined);
    expect(tile.element.querySelector('.vol-card__action')).toBeNull();
  });

  it('disabled/locked/drag ve animation yeniden girişlerini güvenli yönetir', () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const tile = track(
      new CardTile({ data, actionLabel: 'YAP', secondaryActionLabel: 'İKİ', onAction: action }),
    );
    tile.setLocked(true);
    tile.setDisabled(true, 'KİLİTLİ');
    tile.element.querySelector<HTMLButtonElement>('.vol-card__action')!.click();
    expect(action).not.toHaveBeenCalled();
    expect(tile.element.classList.contains('vol-card--locked')).toBe(true);
    tile.setLocked(false);
    tile.setDisabled(false);

    tile.setDraggable('a');
    tile.setDraggable('b');
    tile.element.dispatchEvent(new Event('dragstart'));
    expect(tile.element.classList.contains('vol-card--dragging')).toBe(true);
    tile.element.dispatchEvent(new Event('dragend'));
    expect(tile.element.classList.contains('vol-card--dragging')).toBe(false);
    tile.setDraggable(undefined);
    expect(tile.element.draggable).toBe(false);

    tile.startEnterAnimation();
    expect(tile.element.classList.contains('vol-card--entering')).toBe(false);
    document.body.appendChild(tile.element);
    tile.startEnterAnimation();
    tile.startEnterAnimation();
    tile.element.dispatchEvent(new Event('animationend'));
    expect(tile.element.classList.contains('vol-card--entering')).toBe(false);
    vi.advanceTimersByTime(CARD_ENTER_ANIMATION_MS);
  });
});

describe('RangeSlider giriş sınırları', () => {
  function handles(slider: RangeSlider) {
    return slider.element.querySelectorAll<HTMLDivElement>('[role="slider"]');
  }

  it('başlangıcı normalize eder, geçersiz step/değerleri ve sessiz setValue davranışını sınırlar', () => {
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const slider = track(
      new RangeSlider({
        min: 10,
        max: 20,
        step: 0,
        value: { min: 30, max: Number.NaN },
        label: 'Aralık',
        formatValue: (value) => `${value}x`,
        onInput,
        onCommit,
      }),
    );
    expect(slider.getValue()).toEqual({ min: 10, max: 20 });
    expect(slider.element.textContent).toContain('10x – 20x');
    slider.setValue({ min: 19, max: 11 });
    expect(slider.getValue()).toEqual({ min: 11, max: 19 });
    expect(onInput).not.toHaveBeenCalled();
    slider.setValueAndNotify({ min: 11, max: 19 });
    expect(onCommit).not.toHaveBeenCalled();
    slider.setValueAndNotify({ min: 12, max: 18 });
    expect(onInput).toHaveBeenCalledWith({ min: 12, max: 18 });
    expect(onCommit).toHaveBeenCalledWith({ min: 12, max: 18 });
  });

  it('iki handle için ok/Home/End ve etkisiz tuş sözleşmesini uygular', () => {
    const onCommit = vi.fn();
    const slider = track(
      new RangeSlider({ min: 0, max: 10, step: 2, value: { min: 2, max: 8 }, onCommit }),
    );
    const [minHandle, maxHandle] = handles(slider);
    for (const key of ['ArrowRight', 'ArrowUp']) {
      minHandle.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    }
    expect(slider.getValue().min).toBe(6);
    for (const key of ['ArrowLeft', 'ArrowDown']) {
      maxHandle.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    }
    expect(slider.getValue().max).toBe(6);
    minHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    maxHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(slider.getValue()).toEqual({ min: 0, max: 10 });
    const ignored = new KeyboardEvent('keydown', {
      key: 'PageDown',
      bubbles: true,
      cancelable: true,
    });
    minHandle.dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false);
    expect(onCommit).toHaveBeenCalledTimes(5);
  });

  it('pointer yakınlığı, doğrudan handle, yanlış pointer ve cancel geri alma yollarını ayırır', () => {
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const slider = track(
      new RangeSlider({ min: 0, max: 100, value: { min: 20, max: 80 }, onInput, onCommit }),
    );
    document.body.appendChild(slider.element);
    const trackElement = slider.element.querySelector<HTMLDivElement>('.vol-range-slider__track')!;
    vi.spyOn(trackElement, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 10,
      right: 100,
      bottom: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const [minHandle, maxHandle] = handles(slider);

    trackElement.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 50 }));
    trackElement.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 30 }));
    trackElement.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 70 }));
    trackElement.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 40 }));
    trackElement.dispatchEvent(pointer('pointercancel', { pointerId: 1, clientX: 40 }));
    expect(slider.getValue()).toEqual({ min: 20, max: 80 });
    expect(onCommit).not.toHaveBeenCalled();

    maxHandle.dispatchEvent(pointer('pointerdown', { pointerId: 3, clientX: 90 }));
    trackElement.dispatchEvent(pointer('pointerup', { pointerId: 4, clientX: 90 }));
    trackElement.dispatchEvent(pointer('pointerup', { pointerId: 3, clientX: 90 }));
    expect(slider.getValue().max).toBe(90);
    expect(onCommit).toHaveBeenLastCalledWith({ min: 20, max: 90 });

    minHandle.dispatchEvent(pointer('pointerdown', { pointerId: 5, clientX: 95 }));
    slider.setDisabled(true);
    expect(slider.getValue().min).toBe(20);
    expect(minHandle.tabIndex).toBe(-1);
    minHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(slider.getValue().min).toBe(20);
  });
});

interface TableRow {
  id: string;
  name: string | null;
  score: number;
}

describe('DataTable veri ve seçim sınırları', () => {
  const rows: TableRow[] = [
    { id: 'b', name: null, score: 2 },
    { id: 'a', name: 'Ada', score: 1 },
    { id: 'c', name: 'Cem', score: 2 },
  ];

  it('boş/custom metin, sütun stilleri, string ve Node render yollarını uygular', () => {
    const table = track(
      new DataTable<TableRow>({
        rows: [],
        emptyText: 'Boş',
        columns: [
          { key: 'name', header: 'Ad', sortable: false, align: 'center', width: '40px' },
          {
            key: 'score',
            header: 'Puan',
            render: (row) => {
              const strong = document.createElement('strong');
              strong.textContent = String(row.score);
              return strong;
            },
          },
        ],
      }),
    );
    expect(table.element.textContent).toContain('Boş');
    const firstHeader = table.element.querySelector<HTMLTableCellElement>('th')!;
    expect(firstHeader.style.textAlign).toBe('center');
    expect(firstHeader.style.width).toBe('40px');
    expect(firstHeader.querySelector('button')).toBeNull();
    table.setRows(rows);
    expect(table.element.querySelector('strong')?.textContent).toBe('2');
    expect(table.element.querySelector('td')?.textContent).toBe('');
  });

  it('çoklu seçimi toggle eder ve row callback ile birlikte bildirir', () => {
    const onSelectionChange = vi.fn();
    const onRowClick = vi.fn();
    const table = track(
      new DataTable<TableRow>({
        rows,
        columns: [{ key: 'name', header: 'Ad' }],
        multiSelect: true,
        onSelectionChange,
        onRowClick,
      }),
    );
    let rendered = table.element.querySelectorAll<HTMLTableRowElement>('.vol-datatable__row');
    rendered[0].click();
    expect(table.getSelectedKeys()).toEqual(['b']);
    expect(onRowClick).toHaveBeenLastCalledWith(rows[0]);
    rendered = table.element.querySelectorAll<HTMLTableRowElement>('.vol-datatable__row');
    rendered[0].click();
    expect(table.getSelectedKeys()).toEqual([]);
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it('başlangıç/üç aşamalı sıralamada sayı, metin, null ve eşit değerleri işler', () => {
    const table = track(
      new DataTable<TableRow>({
        rows,
        initialSort: { key: 'score', direction: 'desc' },
        columns: [
          { key: 'score', header: 'Puan', sortValue: (row) => row.score },
          { key: 'name', header: 'Ad' },
        ],
      }),
    );
    expect(table.element.querySelector('th')?.getAttribute('aria-sort')).toBe('descending');
    const headers = table.element.querySelectorAll<HTMLButtonElement>(
      '.vol-datatable__sort-button',
    );
    headers[1].click();
    expect(
      table.element.querySelectorAll('.vol-datatable__row')[0].querySelectorAll('td')[1]
        .textContent,
    ).toBe('');
    headers[1].click();
    expect(table.element.querySelectorAll('th')[1].getAttribute('aria-sort')).toBe('descending');
    expect(table.element.querySelectorAll('.vol-datatable__row')[0].textContent).toContain('Cem');
    headers[1].click();
    expect(table.element.querySelectorAll('th')[1].getAttribute('aria-sort')).toBe('none');
  });

  it('virtual scroll aynı aralıkta no-op, yeni aralıkta render ve destroy sırasında rAF iptalidir', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const many = Array.from({ length: 50 }, (_, index) => ({
      id: String(index),
      name: `N${index}`,
      score: index,
    }));
    const table = track(
      new DataTable<TableRow>({
        rows: many,
        columns: [{ key: 'id', header: 'ID' }],
        virtualize: { rowHeight: 10, height: 40, overscan: 0 },
      }),
    );
    table.element.dispatchEvent(new Event('scroll'));
    table.element.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
    table.element.scrollTop = 200;
    table.element.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
    expect(table.element.querySelector('.vol-datatable__spacer')).not.toBeNull();
    table.element.dispatchEvent(new Event('scroll'));
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    table.destroy();
    tracked.pop();
    expect(cancel).toHaveBeenCalled();
  });
});

describe('SplitPane yön, drag ve collapse sınırları', () => {
  function content() {
    return {
      primary: document.createElement('main'),
      secondary: { element: document.createElement('aside') },
    };
  }

  it('vertical drag, keyboard, collapse ve callback yollarını uygular', () => {
    const onResize = vi.fn();
    const onCommit = vi.fn();
    const pane = track(
      new SplitPane({
        ...content(),
        direction: 'vertical',
        initialSize: 100,
        minPrimary: 20,
        minSecondary: 30,
        maxPrimary: 200,
        keyboardStep: 5,
        className: 'custom',
        separatorLabel: 'Ayır',
        onResize,
        onCommit,
      }),
    );
    expect(pane.element.classList.contains('custom')).toBe(true);
    expect(pane.separator.getAttribute('aria-orientation')).toBe('horizontal');
    pane.collapsePane('primary');
    pane.collapsePane('secondary');
    expect(pane.getCollapsedPane()).toBe('secondary');
    pane.togglePane('secondary');
    expect(pane.getCollapsedPane()).toBeUndefined();
    pane.togglePane('primary');

    pane.separator.dispatchEvent(
      pointer('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 1, clientY: 10 }),
    );
    pane.separator.dispatchEvent(
      pointer('pointerdown', { pointerId: 2, pointerType: 'mouse', button: 0, clientY: 10 }),
    );
    pane.separator.dispatchEvent(pointer('pointermove', { pointerId: 3, clientY: 50 }));
    pane.separator.dispatchEvent(pointer('pointermove', { pointerId: 2, clientY: 30 }));
    pane.separator.dispatchEvent(pointer('pointerup', { pointerId: 3, clientY: 30 }));
    pane.separator.dispatchEvent(pointer('pointerup', { pointerId: 2, clientY: 30 }));
    expect(onResize).toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalled();

    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End', 'Space']) {
      pane.separator.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          shiftKey: key === 'ArrowDown',
          bubbles: true,
          cancelable: true,
        }),
      );
    }
    expect(pane.getSize()).toBeGreaterThanOrEqual(20);
  });

  it('horizontal sonsuz üst sınır, non-finite set ve aynı boyutta commit yollarını ayırır', () => {
    const onCommit = vi.fn();
    const pane = track(new SplitPane({ ...content(), minPrimary: 10, onCommit }));
    pane.setSize(Number.POSITIVE_INFINITY);
    expect(pane.getSize()).toBe(10);
    pane.separator.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
    );
    pane.separator.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
    );
    expect(onCommit).toHaveBeenLastCalledWith(10);
    pane.expandPane();
  });
});

describe('SwipeableCardStack gesture sınırları', () => {
  function cards(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      id: `c${index}`,
      element: document.createElement('article'),
    }));
  }

  it('boş deste ve action button durumunu bildirir', () => {
    const onEmpty = vi.fn();
    const stack = track(new SwipeableCardStack({ cards: [], showActionButtons: true, onEmpty }));
    expect(onEmpty).toHaveBeenCalledTimes(1);
    expect(stack.remaining).toBe(0);
    const buttons = stack.element.querySelectorAll<HTMLButtonElement>('button');
    expect([...buttons].every((button) => button.disabled)).toBe(true);
    stack.swipeTop('left');
    expect(stack.remaining).toBe(0);
  });

  it('yalnız üç kart render eder; reentrant swipeı reddeder ve son kartta onEmpty çağırır', () => {
    vi.useFakeTimers();
    const onSwipe = vi.fn();
    const onEmpty = vi.fn();
    const stack = track(
      new SwipeableCardStack({ cards: cards(4), showActionButtons: true, onSwipe, onEmpty }),
    );
    expect(stack.element.querySelectorAll('.vol-card-stack__card')).toHaveLength(3);
    stack.swipeTop('right');
    stack.swipeTop('left');
    expect(stack.remaining).toBe(3);
    expect(onSwipe).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);
    stack.element.querySelectorAll<HTMLButtonElement>('button')[0].click();
    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);
    stack.swipeTop('left');
    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);
    stack.swipeTop('right');
    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);
    expect(stack.remaining).toBe(0);
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it('drag altında geri döner; sağ/sol eşiği ve yanlış pointerı ayırır', () => {
    vi.useFakeTimers();
    const onSwipe = vi.fn();
    const stack = track(new SwipeableCardStack({ cards: cards(3), swipeThreshold: 50, onSwipe }));
    let top = stack.element.querySelector<HTMLDivElement>('.vol-card-stack__card:last-child')!;
    top.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 10 }));
    top.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 100 }));
    top.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 30 }));
    top.dispatchEvent(pointer('pointerup', { pointerId: 2, clientX: 30 }));
    top.dispatchEvent(pointer('pointerup', { pointerId: 1, clientX: 30 }));
    expect(onSwipe).not.toHaveBeenCalled();
    expect(top.style.transform).toBe('');

    top.dispatchEvent(pointer('pointerdown', { pointerId: 3, clientX: 0 }));
    top.dispatchEvent(pointer('pointermove', { pointerId: 3, clientX: 60 }));
    top.dispatchEvent(pointer('pointerup', { pointerId: 3, clientX: 60 }));
    expect(onSwipe).toHaveBeenLastCalledWith('c0', 'right');
    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);

    top = stack.element.querySelector<HTMLDivElement>('.vol-card-stack__card:last-child')!;
    top.dispatchEvent(pointer('pointerdown', { pointerId: 4, clientX: 80 }));
    top.dispatchEvent(pointer('pointermove', { pointerId: 4, clientX: 20 }));
    top.dispatchEvent(pointer('pointercancel', { pointerId: 4, clientX: 20 }));
    expect(onSwipe).toHaveBeenLastCalledWith('c1', 'left');
  });
});

describe('ActionBar kısayol ve görünüm sınırları', () => {
  it('string/Node/fallback ikonları, aktif durum ve boyut değişkenini çizer', () => {
    const nodeIcon = document.createElement('strong');
    nodeIcon.textContent = 'NODE';
    const bar = track(
      new ActionBar({
        size: 72,
        onActivate: vi.fn(),
        slots: [
          { id: 'string', label: 'String', icon: 'S', active: true },
          { id: 'node', label: 'Node', icon: nodeIcon },
          { id: 'fallback', label: 'Fallback' },
        ],
      }),
    );
    expect(bar.element.style.getPropertyValue('--vol-action-bar-size')).toBe('72px');
    expect(bar.element.querySelector('strong')).not.toBe(nodeIcon);
    expect(bar.element.querySelector('.vol-action-bar__initial')?.textContent).toBe('FA');
    const active = bar.element.querySelector<HTMLButtonElement>('[aria-label="String"]')!;
    expect(active.classList.contains('vol-action-bar__slot--active')).toBe(true);
    bar.setActive('string', false);
    bar.setActive('olmayan', true);
    expect(active.classList.contains('vol-action-bar__slot--active')).toBe(false);
  });

  it('cooldown değerini sınırlar; bilinmeyen slot güncellemeleri no-op kalır', () => {
    const bar = track(
      new ActionBar({
        onActivate: vi.fn(),
        slots: [{ id: 'a', label: 'A', cooldownProgress: 0 }],
      }),
    );
    const overlay = bar.element.querySelector<HTMLDivElement>('.vol-action-bar__cooldown')!;
    bar.setCooldown('a', 4);
    expect(overlay.style.getPropertyValue('--vol-action-bar-cooldown')).toBe('1');
    bar.setCooldown('a', -2, 10);
    expect(overlay.style.getPropertyValue('--vol-action-bar-cooldown')).toBe('0');
    expect(overlay.textContent).toBe('');
    bar.setCooldown('olmayan', 0.5, 5);
    bar.setDisabled('olmayan', true);
  });

  it('kısayol harf büyüklüğünü normalize eder; input/textarea/contenteditable ve disabled slotu atlar', () => {
    const onActivate = vi.fn();
    const bar = track(
      new ActionBar({
        enableKeyboardShortcuts: true,
        onActivate,
        slots: [
          { id: 'cast', label: 'Büyü', shortcut: 'Q' },
          { id: 'locked', label: 'Kilitli', shortcut: 'E', disabled: true },
        ],
      }),
    );
    const send = (key: string, target: HTMLElement = document.body) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    };
    expect(send('q').defaultPrevented).toBe(true);
    expect(onActivate).toHaveBeenLastCalledWith('cast');
    send('z');
    send('e');
    expect(onActivate).toHaveBeenCalledTimes(1);

    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    for (const target of [input, textarea, editable]) {
      document.body.appendChild(target);
      send('q', target);
    }
    expect(onActivate).toHaveBeenCalledTimes(1);

    bar.setDisabled('locked', false);
    send('E');
    expect(onActivate).toHaveBeenLastCalledWith('locked');
  });
});

describe('Carousel gesture ve kontrol sınırları', () => {
  function slides(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      id: String(index),
      element: document.createElement('section'),
    }));
  }

  it('dot/ok kontrolleri ve dil güncellemesi erişilebilir etiketleri korur', () => {
    const carousel = track(new Carousel({ slides: slides(3) }));
    const dots = carousel.element.querySelectorAll<HTMLButtonElement>('.vol-carousel__dot');
    dots[2].click();
    expect(carousel.getCurrentIndex()).toBe(2);
    carousel.element.querySelector<HTMLButtonElement>('.vol-carousel__arrow--left')!.click();
    expect(carousel.getCurrentIndex()).toBe(1);
    expect(dots[1].getAttribute('aria-selected')).toBe('true');
  });

  it('yanlış pointerı atlar; sağ/sol eşik ve eşik altı geri dönüşünü uygular', () => {
    const carousel = track(new Carousel({ slides: slides(3) }));
    const viewport = carousel.element.querySelector<HTMLDivElement>('.vol-carousel__viewport')!;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 200 });
    const drag = (id: number, from: number, to: number, upId = id) => {
      viewport.dispatchEvent(pointer('pointerdown', { pointerId: id, clientX: from }));
      viewport.dispatchEvent(pointer('pointermove', { pointerId: id + 10, clientX: to }));
      viewport.dispatchEvent(pointer('pointermove', { pointerId: id, clientX: to }));
      viewport.dispatchEvent(pointer('pointerup', { pointerId: upId, clientX: to }));
    };

    drag(1, 100, 20);
    expect(carousel.getCurrentIndex()).toBe(1);
    drag(2, 20, 100);
    expect(carousel.getCurrentIndex()).toBe(0);
    drag(3, 100, 90);
    expect(carousel.getCurrentIndex()).toBe(0);
    viewport.dispatchEvent(pointer('pointerup', { pointerId: 99, clientX: 0 }));
  });

  it('autoplay pointer enter/leave ve drag sonrasında kontrollü yeniden başlar', () => {
    vi.useFakeTimers();
    const carousel = track(new Carousel({ slides: slides(2), autoPlayIntervalMs: 100 }));
    const viewport = carousel.element.querySelector<HTMLDivElement>('.vol-carousel__viewport')!;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 200 });
    carousel.element.dispatchEvent(new PointerEvent('pointerenter'));
    vi.advanceTimersByTime(200);
    expect(carousel.getCurrentIndex()).toBe(0);
    carousel.element.dispatchEvent(new PointerEvent('pointerleave'));
    vi.advanceTimersByTime(100);
    expect(carousel.getCurrentIndex()).toBe(1);
    viewport.dispatchEvent(pointer('pointerdown', { pointerId: 5, clientX: 100 }));
    viewport.dispatchEvent(pointer('pointercancel', { pointerId: 5, clientX: 100 }));
    vi.advanceTimersByTime(100);
    expect(carousel.getCurrentIndex()).toBe(0);
  });
});
