import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAMEPAD_BUTTON, type PadLike } from '../../src/input/GamepadState';
import { ChargeButton } from '../../src/ui/buttons/ChargeButton';
import { HoldButton } from '../../src/ui/buttons/HoldButton';
import { LongPressButton } from '../../src/ui/buttons/LongPressButton';
import { DirectionButton } from '../../src/ui/touch/DirectionButton';
import { FocusNavController } from '../../src/ui/focus/FocusNavController';

/**
 * Basılı-tutma denetimlerinin klavye ve kol eşdeğeri. Fare/dokunma tek yol olamaz: Space/Enter ve kol A
 * aynı basış/bırakış çiftini üretir, native `click` eylem sayılmaz, odak kaybı basışı iptal eder.
 */
const key = (
  element: Element,
  type: 'keydown' | 'keyup',
  k = ' ',
  repeat = false,
): KeyboardEvent => {
  const event = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, repeat });
  element.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('klavye eşdeğeri', () => {
  it('HoldButton: Space basış/bırakış, tekrar basış sayılmaz, native click yutulur, aria-pressed izler', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const button = new HoldButton({ label: 'Ateş', onPress, onRelease });
    document.body.append(button.element);
    expect(button.element.getAttribute('aria-pressed')).toBe('false');
    expect(key(button.element, 'keydown').defaultPrevented).toBe(true);
    key(button.element, 'keydown', ' ', true);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.element.getAttribute('aria-pressed')).toBe('true');
    key(button.element, 'keyup');
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(button.element.getAttribute('aria-pressed')).toBe('false');
    expect(button.element.dispatchEvent(new MouseEvent('click', { cancelable: true }))).toBe(false);
    button.destroy();
  });

  it('ChargeButton: Enter basılı tutunca dolar, bırakınca kısmi bırakış; odak kaybı iptal eder', () => {
    const onRelease = vi.fn();
    const onCancel = vi.fn();
    const onCharged = vi.fn();
    const button = new ChargeButton({ chargeDurationMs: 1000, onRelease, onCancel, onCharged });
    document.body.append(button.element);
    key(button.element, 'keydown', 'Enter');
    expect(button.element.getAttribute('aria-pressed')).toBe('true');
    vi.advanceTimersByTime(400);
    key(button.element, 'keyup', 'Enter');
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(onRelease.mock.calls[0][0]).toBeGreaterThan(0.2);
    expect(onCharged).not.toHaveBeenCalled();

    key(button.element, 'keydown', 'Enter');
    button.element.dispatchEvent(new FocusEvent('blur'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(button.element.getAttribute('aria-pressed')).toBe('false');
    button.destroy();
  });

  it('LongPressButton: kısa Space `onTap`, eşiği aşan basış yalnız `onLongPress`', () => {
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const button = new LongPressButton({
      label: 'Bas',
      longPressDurationMs: 500,
      onTap,
      onLongPress,
    });
    document.body.append(button.element);
    key(button.element, 'keydown');
    key(button.element, 'keyup');
    expect(onTap).toHaveBeenCalledTimes(1);

    key(button.element, 'keydown');
    vi.advanceTimersByTime(600);
    key(button.element, 'keyup');
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledTimes(1);
    button.destroy();
  });

  it('DirectionButton: Space basış/bırakış üretir ve aria-pressed izler', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const button = new DirectionButton({ label: 'Sağa', arrow: 'right', onPress, onRelease });
    document.body.append(button.element);
    key(button.element, 'keydown');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.element.getAttribute('aria-pressed')).toBe('true');
    key(button.element, 'keyup');
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(button.element.getAttribute('aria-pressed')).toBe('false');
    button.destroy();
  });

  it('devre dışı denetim klavyeyle basılmaz', () => {
    const onPress = vi.fn();
    const button = new HoldButton({ label: 'Ateş', onPress });
    document.body.append(button.element);
    button.setDisabled(true);
    key(button.element, 'keydown');
    expect(onPress).not.toHaveBeenCalled();
    button.destroy();
  });
});

function pad(a: boolean): PadLike {
  return {
    id: 'test-pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0],
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: a && index === GAMEPAD_BUTTON.primary,
      value: a && index === GAMEPAD_BUTTON.primary ? 1 : 0,
    })),
  };
}

describe('kol eşdeğeri (FocusNavController A)', () => {
  let nav: FocusNavController;

  beforeEach(() => {
    nav = new FocusNavController({ getGamepads: () => [pad(false)], now: () => 0 });
    nav.start();
  });

  afterEach(() => {
    nav.destroy();
  });

  function place(element: HTMLElement): void {
    element.getBoundingClientRect = () => ({ x: 0, y: 0, width: 40, height: 20 }) as DOMRect;
    document.body.append(element);
    element.focus();
  }

  it('A, odaktaki HoldButton için basış ve bırakış üretir (click değil)', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const button = new HoldButton({ label: 'Ateş', onPress, onRelease });
    place(button.element);
    nav.pollPad(pad(true));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled();
    nav.pollPad(pad(true));
    expect(onPress).toHaveBeenCalledTimes(1);
    nav.pollPad(pad(false));
    expect(onRelease).toHaveBeenCalledTimes(1);
    button.destroy();
  });

  it('A basılıyken kol çıkarılırsa ya da denetleyici sökülürse basış bırakılır', () => {
    const onRelease = vi.fn();
    const button = new HoldButton({ label: 'Ateş', onRelease });
    place(button.element);
    nav.pollPad(pad(true));
    nav.pollPad(null);
    expect(onRelease).toHaveBeenCalledTimes(1);

    nav.pollPad(pad(false));
    nav.pollPad(pad(true));
    nav.destroy();
    expect(onRelease).toHaveBeenCalledTimes(2);
    button.destroy();
  });

  it('A, sıradan düğmeyi `click` ile etkinleştirmeye devam eder', () => {
    const onClick = vi.fn();
    const plain = document.createElement('button');
    plain.addEventListener('click', onClick);
    place(plain);
    nav.pollPad(pad(true));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Joystick klavye eşdeğeri', () => {
  it('ok tuşları vektör üretir (çapraz birim uzunluk), son tuş bırakılınca onRelease çağrılır', async () => {
    const { Joystick } = await import('../../src/ui/touch/Joystick');
    const onMove = vi.fn();
    const onRelease = vi.fn();
    const stick = new Joystick({ onMove, onRelease, label: 'Sol çubuk' });
    document.body.append(stick.element);
    const base = stick.element.querySelector<HTMLElement>('.vol-joystick__base')!;
    expect(base.tabIndex).toBe(0);
    expect(base.getAttribute('aria-label')).toBe('Sol çubuk');
    key(base, 'keydown', 'ArrowRight');
    expect(onMove).toHaveBeenLastCalledWith({ x: 1, y: 0 });
    key(base, 'keydown', 'ArrowDown');
    const diagonal = onMove.mock.calls.at(-1)?.[0] as { x: number; y: number };
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 5);
    key(base, 'keyup', 'ArrowRight');
    expect(onMove).toHaveBeenLastCalledWith({ x: 0, y: 1 });
    expect(onRelease).not.toHaveBeenCalled();
    key(base, 'keyup', 'ArrowDown');
    expect(onRelease).toHaveBeenCalledTimes(1);
    key(base, 'keydown', 'ArrowUp');
    base.dispatchEvent(new FocusEvent('blur'));
    expect(onRelease).toHaveBeenCalledTimes(2);
    stick.destroy();
  });
});
