import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArrowKeyHold } from '../../../src/ui/touch/arrowKeys';
import { Joystick } from '../../../src/ui/touch/Joystick';
import { SquareJoystick } from '../../../src/ui/touch/SquareJoystick';

/**
 * Çubukların klavye eşdeğeri (UI-10.1): Joystick ve SquareJoystick aynı `ArrowKeyHold` semantiğini paylaşır; fare/dokunma
 * tek yol olamaz. Daire birim uzunluğa normalize eder, kare ham ekseni verir. İşaretçi basılıyken tuşlar yok sayılır.
 */
const key = (
  element: Element,
  type: 'keydown' | 'keyup',
  k: string,
  repeat = false,
): KeyboardEvent => {
  const event = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, repeat });
  element.dispatchEvent(event);
  return event;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('ArrowKeyHold', () => {
  const setup = (blocked = false) => {
    const handlers = { onChange: vi.fn(), onRelease: vi.fn(), isBlocked: vi.fn(() => blocked) };
    const hold = new ArrowKeyHold(handlers);
    return { hold, handlers };
  };

  it('yalnız ok tuşlarını işler; tuşu yutar, yineleme (repeat) yeni değişim üretmez', () => {
    const { hold, handlers } = setup();
    const letter = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    hold.keydown(letter);
    expect(letter.defaultPrevented).toBe(false);
    expect(handlers.onChange).not.toHaveBeenCalled();

    const first = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
    hold.keydown(first);
    expect(first.defaultPrevented).toBe(true);
    expect(handlers.onChange).toHaveBeenLastCalledWith(0, -1);

    const repeated = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      repeat: true,
      cancelable: true,
    });
    hold.keydown(repeated);
    expect(repeated.defaultPrevented).toBe(true);
    expect(handlers.onChange).toHaveBeenCalledTimes(1);
  });

  it('karşıt tuşlar birbirini sıfırlar; son tuş bırakılınca onRelease bir kez çağrılır', () => {
    const { hold, handlers } = setup();
    hold.keydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    hold.keydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(handlers.onChange).toHaveBeenLastCalledWith(0, 0);
    hold.keyup(new KeyboardEvent('keyup', { key: 'ArrowLeft' }));
    expect(handlers.onChange).toHaveBeenLastCalledWith(1, 0);
    hold.keyup(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    expect(handlers.onRelease).toHaveBeenCalledTimes(1);
    // Hiç basılmamış tuşun bırakılışı ya da ikinci release sessizdir.
    hold.keyup(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    hold.release();
    expect(handlers.onRelease).toHaveBeenCalledTimes(1);
  });

  it('işaretçi basılıyken (isBlocked) tuşlar yok sayılır, tuş yutulmaz', () => {
    const { hold, handlers } = setup(true);
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    hold.keydown(event);
    expect(event.defaultPrevented).toBe(false);
    expect(handlers.onChange).not.toHaveBeenCalled();
    hold.release();
    expect(handlers.onRelease).not.toHaveBeenCalled();
  });
});

describe('SquareJoystick klavye eşdeğeri', () => {
  const build = (options: ConstructorParameters<typeof SquareJoystick>[0] = {}) => {
    const onMove = vi.fn();
    const onRelease = vi.fn();
    const stick = new SquareJoystick({ onMove, onRelease, ...options });
    document.body.append(stick.element);
    const base = stick.element.querySelector<HTMLElement>('.vol-square-joystick__base')!;
    const thumb = stick.element.querySelector<HTMLElement>('.vol-square-joystick__thumb')!;
    return { stick, base, thumb, onMove, onRelease };
  };

  it('odaklanabilir, adlıdır ve kısayollarını bildirir', () => {
    const { stick, base } = build({ label: 'Sağ çubuk' });
    expect(base.tabIndex).toBe(0);
    expect(base.getAttribute('role')).toBe('group');
    expect(base.getAttribute('aria-label')).toBe('Sağ çubuk');
    expect(base.getAttribute('aria-keyshortcuts')).toBe('ArrowUp ArrowDown ArrowLeft ArrowRight');
    stick.destroy();
  });

  it('ad verilmezse çevrilmiş varsayılan ad kullanılır', () => {
    const { stick, base } = build();
    expect(base.getAttribute('aria-label')).toBeTruthy();
    stick.destroy();
  });

  it('ok tuşları kare geometride ham eksen verir (çapraz √2, normalize değil); başparmak kenara gider', () => {
    const { stick, base, thumb, onMove, onRelease } = build({ size: 40 });
    key(base, 'keydown', 'ArrowRight');
    expect(onMove).toHaveBeenLastCalledWith({ x: 1, y: 0 });
    expect(thumb.style.transform).toContain('40px');
    expect(base.classList.contains('vol-square-joystick__base--active')).toBe(true);

    key(base, 'keydown', 'ArrowDown');
    expect(onMove).toHaveBeenLastCalledWith({ x: 1, y: 1 });
    key(base, 'keyup', 'ArrowRight');
    expect(onMove).toHaveBeenLastCalledWith({ x: 0, y: 1 });
    expect(onRelease).not.toHaveBeenCalled();

    key(base, 'keyup', 'ArrowDown');
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(thumb.style.transform).toBe('translate(-50%, -50%)');
    expect(base.classList.contains('vol-square-joystick__base--active')).toBe(false);
    stick.destroy();
  });

  it('odak kaybı basılı tuşu bırakır; odak kaybında tuş yokken onRelease çağrılmaz', () => {
    const { stick, base, onRelease } = build();
    base.dispatchEvent(new FocusEvent('blur'));
    expect(onRelease).not.toHaveBeenCalled();
    key(base, 'keydown', 'ArrowUp');
    base.dispatchEvent(new FocusEvent('blur'));
    expect(onRelease).toHaveBeenCalledTimes(1);
    stick.destroy();
  });

  it('işaretçi basılıyken ok tuşları çubuğu sürmez', () => {
    const { stick, base, onMove } = build();
    vi.spyOn(base, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 80,
      bottom: 80,
      width: 80,
      height: 80,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    base.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 60, clientY: 40, bubbles: true }),
    );
    onMove.mockClear();
    const event = key(base, 'keydown', 'ArrowLeft');
    expect(event.defaultPrevented).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    stick.destroy();
  });

  it('yok edilince dinleyici kalmaz', () => {
    const { stick, base, onMove } = build();
    stick.destroy();
    key(base, 'keydown', 'ArrowUp');
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe('Joystick: ortak ArrowKeyHold sonrası semantik aynı', () => {
  it('daire çaprazı birim uzunluğa normalize eder, bırakınca merkeze döner', () => {
    const onMove = vi.fn();
    const onRelease = vi.fn();
    const stick = new Joystick({ onMove, onRelease });
    document.body.append(stick.element);
    const base = stick.element.querySelector<HTMLElement>('.vol-joystick__base')!;
    key(base, 'keydown', 'ArrowRight');
    key(base, 'keydown', 'ArrowDown');
    const vector = onMove.mock.calls.at(-1)?.[0] as { x: number; y: number };
    expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(1, 5);
    key(base, 'keyup', 'ArrowRight');
    key(base, 'keyup', 'ArrowDown');
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(stick.element.querySelector<HTMLElement>('.vol-joystick__thumb')!.style.transform).toBe(
      'translate(-50%, -50%)',
    );
    stick.destroy();
  });
});
