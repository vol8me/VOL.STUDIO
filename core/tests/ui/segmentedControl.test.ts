import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SegmentedControl,
  type SegmentedControlOption,
  type SegmentedControlOptions,
} from '../../src/ui/primitives/SegmentedControl';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  document.body.innerHTML = '';
});

const ORIENTATION: SegmentedControlOption[] = [
  { value: 'portrait', label: 'Dikey' },
  { value: 'landscape', label: 'Yatay' },
];

const THREE_WITH_GAP: SegmentedControlOption[] = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B', disabled: true },
  { value: 'c', label: 'C' },
];

function mount(options: SegmentedControlOptions, parent: HTMLElement = document.body) {
  const control = new SegmentedControl(options);
  parent.appendChild(control.element);
  cleanups.push(() => control.destroy());
  return control;
}

function buttonsOf(control: SegmentedControl): HTMLButtonElement[] {
  return Array.from(control.element.querySelectorAll<HTMLButtonElement>('button'));
}

function press(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('SegmentedControl — seçenekleri yenileme', () => {
  it('setOptions etiketleri yeniler, seçimi korur ve geri çağrı üretmez', () => {
    const onCommit = vi.fn();
    const control = mount({ options: ORIENTATION, value: 'landscape', onCommit });

    control.setOptions([
      { value: 'portrait', label: 'Portrait' },
      { value: 'landscape', label: 'Landscape' },
    ]);

    const buttons = buttonsOf(control);
    expect(buttons.map((button) => button.textContent)).toEqual(['Portrait', 'Landscape']);
    expect(control.getValue()).toBe('landscape');
    expect(buttons[1].getAttribute('aria-checked')).toBe('true');
    expect(buttons[1].classList.contains('vol-segmented__item--active')).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();

    buttons[0].click();
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('portrait');
  });

  it('eski segmentlerin dinleyicilerini bırakır', () => {
    const onCommit = vi.fn();
    const control = mount({ options: ORIENTATION, value: 'portrait', onCommit });
    const stale = buttonsOf(control)[1];

    control.setOptions(ORIENTATION);
    stale.click();

    expect(stale.isConnected).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
    expect(buttonsOf(control)).toHaveLength(2);
  });

  it('seçili değer yeni listede yoksa seçim düşer', () => {
    const control = mount({ options: ORIENTATION, value: 'landscape' });
    control.setOptions([{ value: 'portrait', label: 'Dikey' }]);
    expect(control.getValue()).toBeUndefined();
    expect(buttonsOf(control)[0].tabIndex).toBe(0);
  });

  it('ariaLabel grubu adlandırır, setAriaLabel yeniler', () => {
    const control = mount({ options: ORIENTATION, ariaLabel: 'Ekran yönü' });
    expect(control.element.getAttribute('aria-label')).toBe('Ekran yönü');
    control.setAriaLabel('Screen orientation');
    expect(control.element.getAttribute('aria-label')).toBe('Screen orientation');
  });
});

describe('SegmentedControl — klavye', () => {
  it('grup tek sekme durağıdır: seçili segment, yoksa ilk kapalı olmayan', () => {
    const control = mount({
      options: [{ value: 'x', label: 'X', disabled: true }, ...THREE_WITH_GAP],
    });
    expect(buttonsOf(control).map((button) => button.tabIndex)).toEqual([-1, 0, -1, -1]);

    control.setValue('c');
    expect(buttonsOf(control).map((button) => button.tabIndex)).toEqual([-1, -1, -1, 0]);
  });

  it('ok tuşları kapalı segmenti atlayarak seçer, uçlarda sarar ve odağı taşır', () => {
    const onCommit = vi.fn<(value: string) => void>();
    const control = mount({ options: THREE_WITH_GAP, value: 'a', onCommit });
    const [a, , c] = buttonsOf(control);
    a.focus();

    press(a, 'ArrowRight');
    expect(control.getValue()).toBe('c');
    expect(document.activeElement).toBe(c);

    press(c, 'ArrowRight');
    expect(control.getValue()).toBe('a');

    press(a, 'ArrowLeft');
    expect(control.getValue()).toBe('c');

    press(c, 'Home');
    expect(control.getValue()).toBe('a');

    press(a, 'End');
    expect(control.getValue()).toBe('c');

    expect(onCommit.mock.calls.map(([value]) => value)).toEqual(['c', 'a', 'c', 'a', 'c']);
    expect(c.tabIndex).toBe(0);
    expect(a.tabIndex).toBe(-1);
  });

  it('sağdan sola yönde sağ ok önceki segmente gider', () => {
    const wrapper = document.createElement('div');
    wrapper.dir = 'rtl';
    document.body.appendChild(wrapper);
    const control = mount({ options: THREE_WITH_GAP, value: 'c' }, wrapper);
    const c = buttonsOf(control)[2];
    c.focus();

    press(c, 'ArrowRight');
    expect(control.getValue()).toBe('a');
  });

  it('gezinme tuşu olmayan tuşlara dokunmaz', () => {
    const onCommit = vi.fn();
    const control = mount({ options: ORIENTATION, value: 'portrait', onCommit });
    const [portrait] = buttonsOf(control);
    portrait.focus();

    expect(press(portrait, 'Enter').defaultPrevented).toBe(false);
    expect(press(portrait, 'ArrowDown').defaultPrevented).toBe(true);
    expect(control.getValue()).toBe('landscape');
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('landscape');
  });
});

describe('SegmentedControl — pasif grup', () => {
  it('seçimi gösterir; tıklama ve ok tuşuyla değişmez, programatik değer izlenir', () => {
    const onCommit = vi.fn();
    const control = mount({ options: ORIENTATION, value: 'portrait', disabled: true, onCommit });
    const buttons = buttonsOf(control);

    expect(control.element.classList.contains('vol-segmented--disabled')).toBe(true);
    expect(control.element.getAttribute('aria-disabled')).toBe('true');
    expect(buttons.every((button) => button.disabled)).toBe(true);

    buttons[1].click();
    press(control.element, 'ArrowRight');
    expect(control.getValue()).toBe('portrait');

    control.setValue('landscape');
    expect(control.getValue()).toBe('landscape');
    expect(buttons[1].getAttribute('aria-checked')).toBe('true');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('pasifken yenilenen segmentler de kapalı kurulur', () => {
    const control = mount({ options: ORIENTATION, disabled: true });
    control.setOptions(ORIENTATION);
    expect(buttonsOf(control).every((button) => button.disabled)).toBe(true);
  });

  it('setDisabled(false) grubu açar ama tek tek kapalı segmenti korur', () => {
    const control = mount({ options: THREE_WITH_GAP, disabled: true });
    control.setDisabled(false);

    expect(control.element.classList.contains('vol-segmented--disabled')).toBe(false);
    expect(control.element.hasAttribute('aria-disabled')).toBe(false);
    expect(buttonsOf(control).map((button) => button.disabled)).toEqual([false, true, false]);
  });

  it('destroy sonrası klavye olayı seçim değiştirmez', () => {
    const onCommit = vi.fn();
    const control = new SegmentedControl({ options: ORIENTATION, value: 'portrait', onCommit });
    document.body.appendChild(control.element);
    const element = control.element;

    control.destroy();
    press(element, 'ArrowRight');

    expect(element.isConnected).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
