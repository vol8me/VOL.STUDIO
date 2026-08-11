import { describe, it, expect, vi, afterEach } from 'vitest';
import { Accordion } from '../../src/ui/layout/Accordion';
import { Tree } from '../../src/ui/layout/Tree';
import { UIRoot } from '../../src/ui/layout/UIRoot';
import { VirtualList } from '../../src/ui/layout/VirtualList';
import { Wizard } from '../../src/ui/layout/Wizard';

const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}
afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Accordion', () => {
  function makeSections(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `s${i}`,
      title: `Bölüm ${i}`,
      content: { element: document.createElement('div') },
    }));
  }

  it('singleOpen:true (varsayılan) iken bir bölüm açılınca diğerleri kapanır', () => {
    const accordion = track(new Accordion(makeSections(3)));
    accordion.open('s0');
    accordion.open('s1');

    const header0 = accordion.element.querySelectorAll('.vol-accordion__header')[0];
    const header1 = accordion.element.querySelectorAll('.vol-accordion__header')[1];
    expect(header0.getAttribute('aria-expanded')).toBe('false');
    expect(header1.getAttribute('aria-expanded')).toBe('true');
  });

  it('singleOpen:false iken birden fazla bölüm aynı anda açık kalabilir', () => {
    const accordion = track(new Accordion(makeSections(3), { singleOpen: false }));
    accordion.open('s0');
    accordion.open('s1');

    const headers = accordion.element.querySelectorAll('.vol-accordion__header');
    expect(headers[0].getAttribute('aria-expanded')).toBe('true');
    expect(headers[1].getAttribute('aria-expanded')).toBe('true');
  });

  it('header tıklaması toggle davranışı gösterir', () => {
    const accordion = track(new Accordion(makeSections(1)));
    const header = accordion.element.querySelector<HTMLButtonElement>('.vol-accordion__header')!;

    header.click();
    expect(header.getAttribute('aria-expanded')).toBe('true');
    header.click();
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('defaultOpen ile başlangıçta açık bölümler belirlenebilir', () => {
    const accordion = track(new Accordion(makeSections(2), { defaultOpen: ['s1'] }));
    const headers = accordion.element.querySelectorAll('.vol-accordion__header');
    expect(headers[0].getAttribute('aria-expanded')).toBe('false');
    expect(headers[1].getAttribute('aria-expanded')).toBe('true');
  });

  it("destroy her section'ın content.destroy'unu çağırır", () => {
    const contentDestroy = vi.fn();
    const sections = [
      {
        id: 's0',
        title: 'A',
        content: { element: document.createElement('div'), destroy: contentDestroy },
      },
    ];
    const accordion = new Accordion(sections);

    accordion.destroy();
    expect(contentDestroy).toHaveBeenCalledTimes(1);
  });
});

describe('Tree', () => {
  const sampleNodes = [
    {
      id: 'root1',
      label: 'Kök 1',
      children: [
        { id: 'child1', label: 'Çocuk 1' },
        { id: 'child2', label: 'Çocuk 2' },
      ],
    },
    { id: 'root2', label: 'Kök 2', disabled: true },
  ];

  it('bir yaprak düğüme (children olmayan) tıklamak seçer ve onSelect çağırır', () => {
    const onSelect = vi.fn();
    const tree = track(new Tree(sampleNodes, { onSelect }));
    document.body.appendChild(tree.element);

    // rows[1] = child1 (root1'in ilk çocuğu, children yok -> yaprak).
    const rows = tree.element.querySelectorAll<HTMLDivElement>('.vol-tree__row');
    rows[1].click();
    expect(onSelect).toHaveBeenCalledWith('child1');
  });

  it('selectableFolders:false (varsayılan) iken klasöre tıklamak yalnızca açar, SEÇMEZ', () => {
    const onSelect = vi.fn();
    const tree = track(new Tree(sampleNodes, { onSelect, selectableFolders: false }));
    const rootRow = tree.element.querySelector<HTMLDivElement>('.vol-tree__row')!;

    rootRow.click();
    expect(onSelect).not.toHaveBeenCalled();
    const item = tree.element.querySelector('[role="treeitem"]')!;
    expect(item.getAttribute('aria-expanded')).toBe('true');
  });

  it('selectableFolders:true iken klasöre tıklamak hem açar hem seçer', () => {
    const onSelect = vi.fn();
    const tree = track(new Tree(sampleNodes, { onSelect, selectableFolders: true }));
    const rootRow = tree.element.querySelector<HTMLDivElement>('.vol-tree__row')!;

    rootRow.click();
    expect(onSelect).toHaveBeenCalledWith('root1');
  });

  it('disabled düğüm tıklamaya tepki vermez', () => {
    const onSelect = vi.fn();
    const tree = track(new Tree(sampleNodes, { onSelect }));
    const rows = tree.element.querySelectorAll<HTMLDivElement>('.vol-tree__row');
    const disabledRow = rows[rows.length - 1]; // root2, disabled

    disabledRow.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('multiSelect:true iken birden fazla düğüm bağımsız işaretlenebilir', () => {
    const onSelectionChange = vi.fn();
    const tree = track(new Tree(sampleNodes, { multiSelect: true, onSelectionChange }));
    const rows = tree.element.querySelectorAll<HTMLDivElement>('.vol-tree__row');
    // rows[1] = child1 (yaprak) — root1 (children'lı) selectableFolders:false
    // iken select() hiç çağırmıyor (yalnızca aç/kapatıyor), bu yüzden
    // multiSelect testi de bir yaprak düğüm üzerinden yapılmalı.

    rows[1].click(); // child1
    expect(tree.getSelectedIds()).toEqual(['child1']);

    rows[1].click(); // tekrar tıkla -> kaldır
    expect(tree.getSelectedIds()).toEqual([]);
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it('caret tıklaması yalnızca aç/kapatır, seçim tetiklemez (event.stopPropagation)', () => {
    const onSelect = vi.fn();
    const tree = track(new Tree(sampleNodes, { onSelect, selectableFolders: true }));
    const caret = tree.element.querySelector<HTMLSpanElement>('.vol-tree__caret')!;

    caret.click();
    expect(onSelect).not.toHaveBeenCalled();
    const item = tree.element.querySelector('[role="treeitem"]')!;
    expect(item.getAttribute('aria-expanded')).toBe('true');
  });

  it('ArrowDown/ArrowUp görünür düğümler arasında odağı taşır', () => {
    const tree = track(new Tree(sampleNodes));
    document.body.appendChild(tree.element);
    const rootRow = tree.element.querySelector<HTMLDivElement>('.vol-tree__row')!;
    rootRow.focus();

    rootRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    // root1'in çocukları henüz açık değil -> flatOrder'da sadece root1 ve root2 var, ArrowDown root2'ye gitmeli.
    expect(document.activeElement?.textContent).toContain('Kök 2');
  });

  it('destroy tüm satır listenerlarını temizler', () => {
    const tree = new Tree(sampleNodes);
    const rows = Array.from(tree.element.querySelectorAll<HTMLDivElement>('.vol-tree__row'));
    const removeSpies = rows.map((row) => vi.spyOn(row, 'removeEventListener'));

    tree.destroy();
    for (const spy of removeSpies) {
      expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
    }
  });
});

describe('UIRoot', () => {
  it('parent altında .vol-ui-root elementi oluşturur', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = track(new UIRoot(container));
    expect(container.querySelector('.vol-ui-root')).toBe(root.element);
  });

  it('aynı parent için ikinci kez çağrılırsa mevcut kökü yeniden kullanır (çoklamaz)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const first = new UIRoot(container);
    const second = track(new UIRoot(container));

    expect(first.element).toBe(second.element);
    expect(container.querySelectorAll('.vol-ui-root').length).toBe(1);
  });

  it('string id ile parent bulunamazsa hata fırlatır', () => {
    expect(() => new UIRoot('nonexistent-id')).toThrow();
  });

  it('mount/unmount node ekler/kaldırır', () => {
    const root = track(new UIRoot(document.createElement('div')));
    const node = document.createElement('span');

    root.mount(node);
    expect(root.element.contains(node)).toBe(true);

    root.unmount(node);
    expect(root.element.contains(node)).toBe(false);
  });
});

describe('VirtualList', () => {
  it('yalnızca görünür + overscan aralığındaki satırları render eder', () => {
    const list = track(
      new VirtualList({
        items: Array.from({ length: 1000 }, (_, i) => i),
        itemHeight: 20,
        height: 100,
        overscan: 2,
        renderItem: (item) => {
          const el = document.createElement('div');
          el.textContent = String(item);
          return el;
        },
      }),
    );

    const rows = list.element.querySelectorAll('.vol-virtual-list__row');
    // ~5 görünür + 2*2 overscan = ~9
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(12);
  });

  it('setItems scroll konumunu (mümkünse) korur ve yeniden render eder', () => {
    const list = track(
      new VirtualList({
        items: Array.from({ length: 100 }, (_, i) => i),
        itemHeight: 20,
        height: 100,
        renderItem: (_item) => document.createElement('div'),
      }),
    );

    list.setItems(Array.from({ length: 5 }, (_, i) => i));
    // Kısa listede yalnızca 5 satır olmalı, spacer yüksekliği güncellenmiş olmalı.
    const spacer = list.element.querySelector<HTMLDivElement>('.vol-virtual-list__spacer')!;
    expect(spacer.style.height).toBe('100px'); // 5 * 20
  });

  it("scrollToIndex geçerli aralığa sıkıştırır ve scrollTop'ı ayarlar", () => {
    const list = track(
      new VirtualList({
        items: Array.from({ length: 10 }, (_, i) => i),
        itemHeight: 20,
        height: 100,
        renderItem: () => document.createElement('div'),
      }),
    );

    list.scrollToIndex(999); // aralık dışı -> son öğeye kenetlenir
    expect(list.element.scrollTop).toBe(9 * 20);

    list.scrollToIndex(-5);
    expect(list.element.scrollTop).toBe(0);
  });

  it("destroy bekleyen rAF'ı iptal eder ve scroll listener'ı kaldırır", () => {
    const list = new VirtualList({
      items: [1, 2, 3],
      itemHeight: 20,
      height: 100,
      renderItem: () => document.createElement('div'),
    });
    const removeListener = vi.spyOn(list.element, 'removeEventListener');
    list.destroy();
    expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});

describe('Wizard', () => {
  function makeSteps(count: number, validate?: () => boolean | Promise<boolean>) {
    return Array.from({ length: count }, (_, i) => ({
      id: `step${i}`,
      title: `Adım ${i + 1}`,
      content: { element: document.createElement('div') },
      ...(i === 0 && validate ? { validate } : {}),
    }));
  }

  it('İleri butonuna tıklamak sonraki adıma geçer, onStepChange çağırır', () => {
    vi.useFakeTimers();
    const onStepChange = vi.fn();
    const wizard = track(new Wizard({ steps: makeSteps(3), onStepChange }));
    const nextButton = wizard.element.querySelector<HTMLButtonElement>(
      '.vol-wizard__nav-button--next',
    )!;

    nextButton.click();
    vi.advanceTimersByTime(200);

    expect(wizard.getCurrentIndex()).toBe(1);
    expect(onStepChange).toHaveBeenCalledWith(1, expect.objectContaining({ id: 'step1' }));
  });

  it('validate false dönerse bir sonraki adıma geçilmez', async () => {
    vi.useFakeTimers();
    const validate = vi.fn().mockReturnValue(false);
    const wizard = track(new Wizard({ steps: makeSteps(3, validate) }));
    const nextButton = wizard.element.querySelector<HTMLButtonElement>(
      '.vol-wizard__nav-button--next',
    )!;

    nextButton.click();
    await Promise.resolve();

    expect(validate).toHaveBeenCalledTimes(1);
    expect(wizard.getCurrentIndex()).toBe(0);
  });

  it('son adımda İleri butonu finishLabel gösterir ve tıklayınca onFinish çağrılır', async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const wizard = track(new Wizard({ steps: makeSteps(2), onFinish, finishLabel: 'Tamamla' }));
    const nextButton = wizard.element.querySelector<HTMLButtonElement>(
      '.vol-wizard__nav-button--next',
    )!;

    nextButton.click();
    vi.advanceTimersByTime(200);
    expect(nextButton.textContent).toBe('Tamamla');

    nextButton.click();
    await Promise.resolve();
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("Geri butonu ilk adımda disabled'dır, ikinci adımda aktif olur", () => {
    vi.useFakeTimers();
    const wizard = track(new Wizard({ steps: makeSteps(2) }));
    const backButton = wizard.element.querySelector<HTMLButtonElement>(
      '.vol-wizard__nav-button--back',
    )!;
    const nextButton = wizard.element.querySelector<HTMLButtonElement>(
      '.vol-wizard__nav-button--next',
    )!;

    expect(backButton.disabled).toBe(true);
    nextButton.click();
    vi.advanceTimersByTime(200);
    expect(backButton.disabled).toBe(false);
  });

  it('goToStep doğrudan (validate atlayarak) belirtilen adıma atlar', () => {
    vi.useFakeTimers();
    const wizard = track(new Wizard({ steps: makeSteps(3) }));
    wizard.goToStep(2);
    vi.advanceTimersByTime(200);
    expect(wizard.getCurrentIndex()).toBe(2);
  });

  it("destroy her adımın content.destroy'unu çağırır", () => {
    const contentDestroy = vi.fn();
    const steps = [
      {
        id: 's0',
        title: 'A',
        content: { element: document.createElement('div'), destroy: contentDestroy },
      },
    ];
    const wizard = new Wizard({ steps });
    wizard.destroy();
    expect(contentDestroy).toHaveBeenCalledTimes(1);
  });

  it('K9: boş steps dizisi anlaşılır bir hata fırlatır', () => {
    expect(() => new Wizard({ steps: [] })).toThrow(/en az bir adım/i);
  });
});
