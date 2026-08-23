import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasViewportController } from '../../src/ui/controls/CanvasViewportController';
import { CommandHistory } from '../../src/ui/controls/CommandHistory';
import { KeyedVirtualList } from '../../src/ui/layout/KeyedVirtualList';
import { SplitPane } from '../../src/ui/layout/SplitPane';
import { Popover } from '../../src/ui/overlays/Popover';
import { Toolbar } from '../../src/ui/primitives/Toolbar';

/**
 * Bu dosya workbench bileşenlerinde AVLANMIŞ, doğrulanmış hataların geri
 * dönmesini engeller. Her testin başlığı hatanın kullanıcıya nasıl göründüğünü
 * anlatır; kapsam sayısı için değil, o davranış bir daha kaçmasın diye durur.
 */
describe('Toolbar — aksiyon düğmesi seçimi ele geçirmez', () => {
  it('seçimli toolbarda toggle:false düğmeye basmak aktif aracı düşürmez', () => {
    const onChange = vi.fn();
    const toolbar = new Toolbar({
      ariaLabel: 'araçlar',
      selectionMode: 'single',
      value: 'image',
      items: [
        { id: 'image', text: 'G', label: 'Görsel' },
        { id: 'audio', text: 'S', label: 'Ses' },
      ],
      onChange,
    });
    const more = toolbar.add({ id: 'more', text: '...', label: 'Daha fazla', toggle: false });

    more.element.click();

    expect(toolbar.getValue()).toBe('image');
    expect(onChange).not.toHaveBeenCalled();
    expect(more.element.hasAttribute('aria-pressed')).toBe(false);
    toolbar.destroy();
  });

  it('gerçek araç düğmesi hâlâ seçimi değiştirir', () => {
    const onChange = vi.fn();
    const toolbar = new Toolbar({
      ariaLabel: 'araçlar',
      selectionMode: 'single',
      value: 'image',
      items: [
        { id: 'image', text: 'G', label: 'Görsel' },
        { id: 'audio', text: 'S', label: 'Ses' },
      ],
      onChange,
    });

    toolbar.getButton('audio')?.element.click();

    expect(toolbar.getValue()).toBe('audio');
    expect(onChange).toHaveBeenCalledWith('audio');
    toolbar.destroy();
  });
});

describe('CommandHistory — bütçeye sığmayan komut geçmişi ayrıştırmaz', () => {
  it('saklanamayan komuttan sonra undo eski bir komutu geri almaz', () => {
    let value = 'baslangic';
    const history = new CommandHistory({ maxBytes: 100 });
    history.execute({
      label: 'kucuk',
      byteCost: 10,
      apply: () => void (value = 'kucuk'),
      revert: () => void (value = 'baslangic'),
    });

    history.execute({
      label: 'devasa',
      byteCost: 500,
      apply: () => void (value = 'devasa'),
      revert: () => void (value = 'kucuk'),
    });

    // Devasa komut belgeye uygulandı ama saklanamaz; ondan önceki hiçbir undo
    // artık geçerli olmadığı için yığın tümüyle bırakılır.
    expect(value).toBe('devasa');
    expect(history.canUndo()).toBe(false);
    expect(history.getSnapshot().undoCount).toBe(0);
    expect(history.undo()).toBe(false);
    expect(value).toBe('devasa');
  });

  it('bütçeye sığan komutlar normal çalışmaya devam eder', () => {
    let value = 0;
    const history = new CommandHistory({ maxBytes: 100 });
    history.execute({
      label: 'artir',
      byteCost: 10,
      apply: () => void (value += 1),
      revert: () => void (value -= 1),
    });

    expect(value).toBe(1);
    expect(history.undo()).toBe(true);
    expect(value).toBe(0);
    expect(history.redo()).toBe(true);
    expect(value).toBe(1);
  });
});

describe('Popover — kapanışta odağı kullanıcıdan çalmaz', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('dışarıdaki alana tıklayınca odak orada kalır', async () => {
    const trigger = document.createElement('button');
    const outside = document.createElement('input');
    document.body.append(trigger, outside);
    const popover = new Popover(trigger, { focusOnOpen: false });
    popover.add(document.createElement('span'));
    popover.show();
    await Promise.resolve(); // Popup dış tıklama dinleyicisini microtaskte bağlar.

    outside.focus();
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(popover.isOpen()).toBe(false);
    expect(document.activeElement).toBe(outside);
    popover.destroy();
  });

  it('odak popover içindeyken kapanışta tetikleyiciye döner', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const popover = new Popover(trigger, { focusOnOpen: false });
    const inner = document.createElement('button');
    popover.add(inner);
    popover.show();
    await Promise.resolve();
    inner.focus();

    popover.close();

    expect(document.activeElement).toBe(trigger);
    popover.destroy();
  });
});

describe('SplitPane — pencere daralması kullanıcı tercihini silmez', () => {
  /** Gerçek ResizeObserver'ı yakalayıp callbacki elle sürebilmek için stub. */
  function withCapturedResizeObserver<T>(run: (fire: () => void) => T): T {
    const original = globalThis.ResizeObserver;
    let callback: ResizeObserverCallback | undefined;
    globalThis.ResizeObserver = class {
      constructor(next: ResizeObserverCallback) {
        callback = next;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    try {
      return run(() => callback?.([], {} as ResizeObserver));
    } finally {
      globalThis.ResizeObserver = original;
    }
  }

  it('daraltıp yeniden genişletince seçilen boyut geri gelir', () => {
    withCapturedResizeObserver((fireResize) => {
      let width = 1000;
      const pane = new SplitPane({
        primary: document.createElement('div'),
        secondary: document.createElement('div'),
        initialSize: 400,
        minPrimary: 100,
        minSecondary: 100,
      });
      Object.defineProperty(pane.element, 'clientWidth', { get: () => width });
      pane.setSize(400);
      expect(pane.getSize()).toBe(400);

      width = 300; // pencere daralır: tavan 300 - 100 = 200
      fireResize();
      expect(pane.getSize()).toBe(200);

      width = 1000; // pencere yeniden genişler
      fireResize();
      expect(pane.getSize()).toBe(400);

      pane.destroy();
    });
  });

  it('kullanıcı daralmışken sürüklerse yeni boyut tercih olur', () => {
    withCapturedResizeObserver((fireResize) => {
      let width = 300;
      const pane = new SplitPane({
        primary: document.createElement('div'),
        secondary: document.createElement('div'),
        initialSize: 400,
        minPrimary: 100,
        minSecondary: 100,
      });
      Object.defineProperty(pane.element, 'clientWidth', { get: () => width });

      pane.setSize(150);
      width = 1000;
      fireResize();

      // Kullanıcı 150 seçti; pencere genişleyince 400'e sıçramaz.
      expect(pane.getSize()).toBe(150);
      pane.destroy();
    });
  });

  it('daraltılan panel açılınca kullanıcının boyutuna döner', () => {
    const pane = new SplitPane({
      primary: document.createElement('div'),
      secondary: document.createElement('div'),
      initialSize: 320,
      minPrimary: 100,
      minSecondary: 100,
    });

    pane.collapsePane('primary');
    expect(pane.getCollapsedPane()).toBe('primary');
    pane.expandPane();

    expect(pane.getSize()).toBe(320);
    pane.destroy();
  });
});

describe('KeyedVirtualList — görünürden çıkan satırlar temizlenir', () => {
  it('kaydırmada düşen satır için destroyItem çağrılır', () => {
    const destroyItem = vi.fn();
    const items = Array.from({ length: 200 }, (_, index) => ({ id: `row-${index}` }));
    const list = new KeyedVirtualList({
      items,
      getKey: (item) => item.id,
      itemHeight: 20,
      height: 100,
      overscan: 0,
      renderItem: (item) => {
        const node = document.createElement('div');
        node.textContent = item.id;
        return node;
      },
      destroyItem,
    });
    document.body.appendChild(list.element);
    Object.defineProperty(list.element, 'clientHeight', { get: () => 100 });

    list.scrollToIndex(150);

    expect(destroyItem).toHaveBeenCalled();
    const destroyedIds = destroyItem.mock.calls.map((call) => (call[1] as { id: string }).id);
    expect(destroyedIds).toContain('row-0');
    list.destroy();
  });

  it('destroy görünür kalan satırları da temizler', () => {
    const destroyItem = vi.fn();
    const list = new KeyedVirtualList({
      items: [{ id: 'a' }, { id: 'b' }],
      getKey: (item) => item.id,
      itemHeight: 20,
      height: 100,
      renderItem: () => document.createElement('div'),
      destroyItem,
    });

    list.destroy();

    expect(destroyItem).toHaveBeenCalledTimes(2);
  });
});

describe('CanvasViewportController — kenarlıklı viewportta koordinat sapmaz', () => {
  it('ekran ve belge dönüşümü kenarlık kalınlığını hesaba katar', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    element.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 400, height: 300 }) as DOMRect;
    Object.defineProperty(element, 'clientLeft', { get: () => 10 });
    Object.defineProperty(element, 'clientTop', { get: () => 10 });

    const controller = new CanvasViewportController(element, {
      documentWidth: 200,
      documentHeight: 200,
      initialTransform: { offsetX: 0, offsetY: 0, zoom: 1 },
    });

    // Belge origin'i, kenarlığın İÇ kenarındadır: 100 + 10, 50 + 10.
    expect(controller.documentToScreen({ x: 0, y: 0 })).toEqual({ x: 110, y: 60 });
    expect(controller.screenToDocument({ x: 110, y: 60 })).toEqual({ x: 0, y: 0 });

    controller.destroy();
  });

  it('dönüşüm her zaman terslenebilir kalır', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    element.getBoundingClientRect = () =>
      ({ left: 12, top: 7, width: 400, height: 300 }) as DOMRect;

    const controller = new CanvasViewportController(element, {
      documentWidth: 256,
      documentHeight: 256,
      initialTransform: { offsetX: 33, offsetY: -12, zoom: 2.5 },
    });

    const original = { x: 41.5, y: 88.25 };
    const roundTrip = controller.screenToDocument(controller.documentToScreen(original));

    expect(roundTrip.x).toBeCloseTo(original.x, 10);
    expect(roundTrip.y).toBeCloseTo(original.y, 10);
    controller.destroy();
  });
});
