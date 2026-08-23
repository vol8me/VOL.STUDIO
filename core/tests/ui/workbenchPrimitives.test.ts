import { describe, expect, it, vi } from 'vitest';
import { Icon, VOL_ICONS } from '../../src/ui/primitives/Icon';
import { Toolbar, ToolButton } from '../../src/ui/primitives/Toolbar';
import { PropertyField } from '../../src/ui/primitives/PropertyField';
import { Popover } from '../../src/ui/overlays/Popover';
import { SplitPane } from '../../src/ui/layout/SplitPane';
import { KeyedVirtualList } from '../../src/ui/layout/KeyedVirtualList';

describe('Icon', () => {
  it('güvenli SVG registry üretir ve dekoratif/etiketli kipleri ayırır', () => {
    expect(Object.keys(VOL_ICONS).length).toBeGreaterThan(10);
    const decorative = new Icon({ name: 'image', size: 20 });
    expect(decorative.element.getAttribute('aria-hidden')).toBe('true');
    expect(decorative.element.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(decorative.element.getAttribute('width')).toBe('20');

    decorative.setName('audio');
    expect(decorative.element.querySelectorAll('path')).toHaveLength(VOL_ICONS.audio.paths.length);
    const labelled = new Icon({ name: 'save', label: 'Kaydet', className: 'test-icon' });
    expect(labelled.element.getAttribute('role')).toBe('img');
    expect(labelled.element.getAttribute('aria-label')).toBe('Kaydet');
    expect(labelled.element.classList.contains('test-icon')).toBe(true);
    decorative.destroy();
    labelled.destroy();
  });
});

describe('Toolbar ve ToolButton', () => {
  it('standalone toggle pressed durumunu callbackten önce günceller', () => {
    const onPress = vi.fn();
    const button = new ToolButton({
      id: 'grid',
      label: 'Izgara',
      icon: 'image',
      toggle: true,
      shortcut: 'G',
      onPress,
    });
    button.element.click();
    expect(button.isPressed()).toBe(true);
    expect(onPress).toHaveBeenCalledWith(true);
    button.setPressed(false);
    button.setDisabled(true);
    expect(button.element.disabled).toBe(true);
    button.destroy();

    expect(() => new ToolButton({ id: 'empty', label: 'Boş' })).toThrow(/icon veya text/);
  });

  it('tek seçim, roving tabindex ve yatay klavye gezinmesini yönetir', () => {
    const onChange = vi.fn();
    const toolbar = new Toolbar({
      ariaLabel: 'Araçlar',
      selectionMode: 'single',
      value: 'select',
      onChange,
      items: [
        { id: 'select', label: 'Seçim', text: 'V' },
        { id: 'disabled', label: 'Kapalı', text: 'X', disabled: true },
        { id: 'brush', label: 'Kalem', icon: 'image' },
      ],
    });
    const [select, disabled, brush] = [
      ...toolbar.element.querySelectorAll<HTMLButtonElement>('button'),
    ];
    document.body.appendChild(toolbar.element);
    expect(select.tabIndex).toBe(0);
    expect(disabled.tabIndex).toBe(-1);
    expect(toolbar.getValue()).toBe('select');

    select.focus();
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(brush);
    brush.click();
    expect(toolbar.getValue()).toBe('brush');
    expect(onChange).toHaveBeenCalledWith('brush');

    toolbar.setValue('select');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(toolbar.getButton('select')?.isPressed()).toBe(true);
    expect(() => toolbar.add({ id: 'select', label: 'Tekrar', text: 'S' })).toThrow(/yinelenen/);
    toolbar.destroy();
  });

  it('dikey çoklu seçim, Home/End ve komut toolbar kiplerini destekler', () => {
    const onChange = vi.fn();
    const toolbar = new Toolbar({
      ariaLabel: 'Katmanlar',
      orientation: 'vertical',
      selectionMode: 'multiple',
      value: ['a'],
      onChange,
      items: [
        { id: 'a', label: 'A', text: 'A' },
        { id: 'b', label: 'B', text: 'B' },
        { id: 'c', label: 'C', text: 'C' },
      ],
    });
    const buttons = [...toolbar.element.querySelectorAll<HTMLButtonElement>('button')];
    document.body.appendChild(toolbar.element);
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(buttons[2]);
    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]);
    buttons[1].click();
    expect(toolbar.getValue()).toEqual(['a', 'b']);
    toolbar.destroy();

    const commandChange = vi.fn();
    const command = new Toolbar({
      ariaLabel: 'Komutlar',
      selectionMode: 'none',
      onChange: commandChange,
      items: [{ id: 'save', label: 'Kaydet', icon: 'save' }],
    });
    command.getButton('save')?.element.click();
    expect(commandChange).not.toHaveBeenCalled();
    command.destroy();
  });
});

describe('PropertyField ve Popover', () => {
  it('label ilişkisi, açıklama, disabled nedeni ve reset yaşam döngüsünü kurar', () => {
    const input = document.createElement('input');
    const reset = vi.fn();
    const field = new PropertyField({
      label: 'Opaklık',
      control: input,
      description: 'Katman opaklığı',
      disabledReason: 'Katman kilitli',
      onReset: reset,
    });
    expect(field.element.querySelector('label')?.htmlFor).toBe(input.id);
    expect(input.getAttribute('aria-describedby')).toContain('description');
    expect(field.element.classList.contains('vol-property-field--disabled')).toBe(true);
    field.element.querySelector<HTMLButtonElement>('button')!.click();
    expect(reset).toHaveBeenCalledTimes(1);
    field.setLabel('Alfa');
    field.setDescription(undefined);
    field.setDisabledReason(undefined);
    expect(field.element.querySelector('label')?.textContent).toBe('Alfa');
    expect(field.element.classList.contains('vol-property-field--disabled')).toBe(false);
    field.destroy();
  });

  it('popover aria durumunu, odağı ve dışarı tıklamayla kapanmayı yönetir', async () => {
    const target = document.createElement('button');
    document.body.appendChild(target);
    const action = document.createElement('button');
    action.textContent = 'Eylem';
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const popover = new Popover(target, { ariaLabel: 'Araç seçenekleri', onOpen, onClose });
    popover.add(action);
    popover.show();
    await Promise.resolve();
    expect(popover.isOpen()).toBe(true);
    expect(target.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(action);
    expect(onOpen).toHaveBeenCalledTimes(1);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(popover.isOpen()).toBe(false);
    expect(target.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(target);
    expect(onClose).toHaveBeenCalledTimes(1);
    popover.toggle();
    popover.toggle();
    popover.destroy();
    expect(target.hasAttribute('aria-controls')).toBe(false);
    target.remove();
  });
});

describe('SplitPane', () => {
  it('pointer/klavye resize, clamp, collapse ve sessiz programatik setter sağlar', () => {
    const onResize = vi.fn();
    const onCommit = vi.fn();
    const split = new SplitPane({
      primary: document.createElement('aside'),
      secondary: document.createElement('main'),
      initialSize: 200,
      minPrimary: 100,
      minSecondary: 120,
      onResize,
      onCommit,
    });
    Object.defineProperty(split.element, 'clientWidth', { configurable: true, value: 600 });
    split.setSize(200);
    split.separator.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 8, clientX: 200, button: 0 }),
    );
    split.separator.dispatchEvent(new PointerEvent('pointermove', { pointerId: 8, clientX: 350 }));
    split.separator.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, clientX: 350 }));
    expect(split.getSize()).toBe(350);
    expect(onResize).toHaveBeenLastCalledWith(350);
    expect(onCommit).toHaveBeenCalledWith(350);

    split.separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(split.getSize()).toBe(480);
    split.separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(split.getSize()).toBe(100);
    split.collapsePane('primary');
    expect(split.primaryPane.hidden).toBe(true);
    split.togglePane('primary');
    expect(split.getCollapsedPane()).toBeNull();
    split.collapsePane('secondary');
    expect(split.secondaryPane.hidden).toBe(true);
    split.expandPane();
    split.setSize(999);
    expect(split.getSize()).toBe(480);
    split.destroy();
  });

  it('dikey yönde Y koordinatı ve sağ mouse filtresi kullanır', () => {
    const onResize = vi.fn();
    const split = new SplitPane({
      direction: 'vertical',
      primary: document.createElement('div'),
      secondary: document.createElement('div'),
      initialSize: 100,
      minPrimary: 40,
      minSecondary: 40,
      onResize,
    });
    Object.defineProperty(split.element, 'clientHeight', { configurable: true, value: 400 });
    split.setSize(100);
    const rightMouse = new PointerEvent('pointerdown', {
      pointerId: 1,
      clientY: 100,
      button: 2,
    });
    Object.defineProperty(rightMouse, 'pointerType', { value: 'mouse' });
    split.separator.dispatchEvent(rightMouse);
    split.separator.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientY: 180 }));
    expect(onResize).not.toHaveBeenCalled();
    split.separator.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientY: 100, button: 0 }),
    );
    split.separator.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, clientY: 180 }));
    expect(split.getSize()).toBe(180);
    split.destroy();
  });
});

describe('KeyedVirtualList', () => {
  interface Item {
    id: number;
    label: string;
  }

  it('key aynıysa DOM ve odak korunur, içerik update callbackiyle yenilenir', () => {
    const renderItem = vi.fn((item: Item) => {
      const button = document.createElement('button');
      button.textContent = item.label;
      return button;
    });
    const updateItem = vi.fn((element: HTMLElement, item: Item) => {
      element.textContent = item.label;
    });
    const list = new KeyedVirtualList<Item>({
      items: [
        { id: 1, label: 'A' },
        { id: 2, label: 'B' },
        { id: 3, label: 'C' },
      ],
      getKey: (item) => item.id,
      itemHeight: 20,
      height: 40,
      overscan: 0,
      ariaLabel: 'Varlıklar',
      renderItem,
      updateItem,
    });
    document.body.appendChild(list.element);
    const original = list.getRenderedElement(1)!;
    original.focus();
    list.setItems([
      { id: 2, label: 'B2' },
      { id: 1, label: 'A2' },
      { id: 3, label: 'C' },
    ]);
    expect(list.getRenderedElement(1)).toBe(original);
    expect(document.activeElement).toBe(original);
    expect(original.textContent).toBe('A2');
    expect(list.getRenderedKeys()).toEqual([2, 1]);
    expect(renderItem).toHaveBeenCalledTimes(2);

    list.scrollToKey(3, 'center');
    expect(list.getRenderedElement(3)).toBeDefined();
    list.refresh();
    list.setItems([]);
    expect(list.getRenderedKeys()).toEqual([]);
    list.destroy();
  });

  it('geçersiz yükseklik ve yinelenen keyleri reddeder, string height destekler', () => {
    expect(
      () =>
        new KeyedVirtualList({
          items: [],
          getKey: () => 'x',
          itemHeight: 0,
          renderItem: () => document.createElement('div'),
        }),
    ).toThrow(/itemHeight/);
    expect(
      () =>
        new KeyedVirtualList({
          items: [{ id: 1 }, { id: 1 }],
          getKey: (item) => item.id,
          itemHeight: 20,
          renderItem: () => document.createElement('div'),
        }),
    ).toThrow(/yinelenen key/);
    const flexible = new KeyedVirtualList({
      items: [{ id: 1 }],
      getKey: (item) => item.id,
      itemHeight: 20,
      height: '50vh',
      renderItem: () => document.createElement('div'),
    });
    expect(flexible.element.style.height).toBe('50vh');
    flexible.scrollToIndex(99, 'end');
    flexible.destroy();
  });
});
