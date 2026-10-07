import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChargeButton } from '../../src/ui/buttons/ChargeButton';
import { HoldButton } from '../../src/ui/buttons/HoldButton';
import { LongPressButton } from '../../src/ui/buttons/LongPressButton';

/**
 * Basılı tut / uzun bas / şarj sözleşmesi: iptal yolları (pointercancel, yakalama kaybı, sayfa gizlenmesi,
 * devre dışı, söküm) ve ikinci işaretçi. İptal ASLA eylem sayılmaz (dokunma, atış, şarjlı bırakış yok).
 */
const fire = (element: Element, type: string, pointerId = 1): void => {
  element.dispatchEvent(new PointerEvent(type, { pointerId, bubbles: true, cancelable: true }));
};
const down = (element: Element, pointerId = 1): void => fire(element, 'pointerdown', pointerId);
const hideDocument = (): void => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  Reflect.deleteProperty(document, 'visibilityState');
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('HoldButton iptal yolları', () => {
  it('pointercancel ve yakalama kaybı basışı bırakır; ikinci işaretçi ikinci onPress üretmez', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const button = new HoldButton({ label: 'Ateş', onPress, onRelease });
    document.body.append(button.element);
    down(button.element, 1);
    down(button.element, 2);
    expect(onPress).toHaveBeenCalledTimes(1);
    fire(button.element, 'pointercancel', 1);
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(button.isPressed()).toBe(false);

    down(button.element, 3);
    expect(button.isPressed()).toBe(true);
    fire(button.element, 'lostpointercapture', 3);
    expect(onRelease).toHaveBeenCalledTimes(2);
    expect(button.isPressed()).toBe(false);
    button.destroy();
  });

  it('sayfa gizlenince basış bırakılır; devre dışı bırakma ve söküm de bırakır; söküm belge dinleyicisini kaldırır', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const onRelease = vi.fn();
    const button = new HoldButton({ label: 'Ateş', onRelease });
    document.body.append(button.element);
    down(button.element);
    hideDocument();
    expect(onRelease).toHaveBeenCalledTimes(1);

    down(button.element, 2);
    button.setDisabled(true);
    expect(onRelease).toHaveBeenCalledTimes(2);
    button.setDisabled(false);
    down(button.element, 3);
    button.destroy();
    expect(onRelease).toHaveBeenCalledTimes(3);
    expect(removeSpy.mock.calls.some((call) => call[0] === 'visibilitychange')).toBe(true);
  });
});

describe('LongPressButton iptal yolları', () => {
  const make = () => {
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const onRelease = vi.fn();
    const button = new LongPressButton({ label: 'Menü', onTap, onLongPress, onRelease });
    document.body.append(button.element);
    return { button, onTap, onLongPress, onRelease };
  };

  it('pointercancel dokunma sayılmaz ve uzun basış zamanlayıcısını durdurur', () => {
    const { button, onTap, onLongPress, onRelease } = make();
    down(button.element);
    fire(button.element, 'pointercancel');
    vi.advanceTimersByTime(2000);
    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(button.isPressed()).toBe(false);
    button.destroy();
  });

  it('yakalama kaybı ve sayfa gizlenmesi de iptaldir; normal kısa basış hâlâ dokunmadır', () => {
    const { button, onTap, onLongPress, onRelease } = make();
    down(button.element);
    fire(button.element, 'lostpointercapture');
    expect(onRelease).toHaveBeenCalledTimes(1);
    down(button.element, 2);
    hideDocument();
    expect(onRelease).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(2000);
    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();

    down(button.element, 3);
    fire(button.element, 'pointerup', 3);
    expect(onTap).toHaveBeenCalledTimes(1);
    button.destroy();
  });

  it('ikinci işaretçi yok sayılır: tek zamanlayıcı, tek uzun basış', () => {
    const { button, onLongPress } = make();
    down(button.element, 1);
    down(button.element, 2);
    vi.advanceTimersByTime(2000);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    fire(button.element, 'pointerup', 1);
    button.destroy();
  });
});

describe('ChargeButton iptal yolları', () => {
  const make = () => {
    const onCharged = vi.fn();
    const onRelease = vi.fn();
    const onCancel = vi.fn();
    const button = new ChargeButton({
      label: 'Vur',
      chargeDurationMs: 500,
      allowPartialRelease: true,
      onCharged,
      onRelease,
      onCancel,
    });
    document.body.append(button.element);
    return { button, onCharged, onRelease, onCancel };
  };

  it('pointercancel dolumu iptal eder: onRelease/onCharged çağrılmaz, onCancel bir kez, halka sıfırlanır', () => {
    const { button, onCharged, onRelease, onCancel } = make();
    down(button.element);
    vi.advanceTimersByTime(200);
    expect(button.getProgress()).toBeGreaterThan(0);
    fire(button.element, 'pointercancel');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled();
    expect(onCharged).not.toHaveBeenCalled();
    expect(button.getProgress()).toBe(0);
    expect(button.element.classList.contains('vol-charge-button--charging')).toBe(false);
    // Yeniden kullanılabilir: yeni dolum ve normal bırakış onRelease çağırır.
    down(button.element, 2);
    vi.advanceTimersByTime(100);
    fire(button.element, 'pointerup', 2);
    expect(onRelease).toHaveBeenCalledTimes(1);
    button.destroy();
  });

  it('yakalama kaybı ve sayfa gizlenmesi iptaldir; ikinci işaretçi yeni dolum başlatmaz; normal bırakış sonrası kayıp tekrar iptal saymaz', () => {
    const { button, onRelease, onCancel } = make();
    down(button.element, 1);
    down(button.element, 2);
    fire(button.element, 'lostpointercapture', 1);
    expect(onCancel).toHaveBeenCalledTimes(1);

    down(button.element, 3);
    hideDocument();
    expect(onCancel).toHaveBeenCalledTimes(2);

    down(button.element, 4);
    vi.advanceTimersByTime(600);
    fire(button.element, 'pointerup', 4);
    fire(button.element, 'lostpointercapture', 4);
    expect(onRelease).toHaveBeenCalledWith(1);
    expect(onCancel).toHaveBeenCalledTimes(2);
    button.destroy();
  });

  it('söküm belge dinleyicisini kaldırır', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { button } = make();
    button.destroy();
    expect(removeSpy.mock.calls.some((call) => call[0] === 'visibilitychange')).toBe(true);
  });
});
