import { describe, it, expect, vi, afterEach } from 'vitest';
import { LongPressButton } from '../../src/ui/controls/LongPressButton';
import { SwipeGestureZone, type SwipeGestureEvent } from '../../src/ui/controls/SwipeGestureZone';
import { MultiTouchZone } from '../../src/ui/controls/MultiTouchZone';
import { SquareJoystick } from '../../src/ui/controls/SquareJoystick';

const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}
afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function pointerEvent(
  type: string,
  init: Partial<PointerEventInit> & { pointerId: number; clientX: number; clientY: number },
): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
}

describe('LongPressButton', () => {
  it('eşik dolmadan bırakılırsa onTap tetiklenir, onLongPress tetiklenmez', () => {
    vi.useFakeTimers();
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const button = track(
      new LongPressButton({ label: 'Eşya', longPressDurationMs: 500, onTap, onLongPress }),
    );

    button.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    vi.advanceTimersByTime(200);
    button.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 0, clientY: 0 }),
    );

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('eşik dolunca onLongPress tetiklenir (parmak hâlâ basılıyken), sonra bırakınca onTap TETİKLENMEZ', () => {
    vi.useFakeTimers();
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const button = track(
      new LongPressButton({ label: 'Eşya', longPressDurationMs: 500, onTap, onLongPress }),
    );

    button.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(button.element.classList.contains('vol-long-press-button--long-pressed')).toBe(true);

    button.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    expect(onTap).not.toHaveBeenCalled(); // iki eylem birbirini dışlar
  });

  it('pointerleave (parmak dışarı kayarsa) basışı iptal eder — ne onTap ne onLongPress tetiklenir', () => {
    vi.useFakeTimers();
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const onRelease = vi.fn();
    const button = track(
      new LongPressButton({
        label: 'Eşya',
        longPressDurationMs: 500,
        onTap,
        onLongPress,
        onRelease,
      }),
    );

    button.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    button.element.dispatchEvent(
      new PointerEvent('pointerleave', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    vi.advanceTimersByTime(600);

    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('setDisabled(true) basılı durumu ve bekleyen zamanlayıcıyı iptal eder', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const button = track(
      new LongPressButton({ label: 'Eşya', longPressDurationMs: 500, onLongPress }),
    );

    button.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    button.setDisabled(true);
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
    expect(button.isPressed()).toBe(false);
  });

  it('destroy bekleyen long-press zamanlayıcısını temizler', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const button = new LongPressButton({ label: 'Eşya', longPressDurationMs: 500, onLongPress });
    button.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );

    button.destroy();
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});

describe('SwipeGestureZone', () => {
  it('eşik mesafeyi aşan yatay sürükleme doğru yönü ve mesafeyi raporlar', () => {
    const onSwipe = vi.fn();
    const zone = track(new SwipeGestureZone({ threshold: 40, onSwipe }));

    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 10 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 10 }),
    );

    expect(onSwipe).toHaveBeenCalledTimes(1);
    const event = onSwipe.mock.calls[0][0] as SwipeGestureEvent;
    expect(event.direction).toBe('right');
    expect(event.distance).toBeCloseTo(100);
  });

  it('baskın eksen dikeyse (dy > dx) yön up/down olarak raporlanır', () => {
    const onSwipe = vi.fn();
    const zone = track(new SwipeGestureZone({ threshold: 40, onSwipe }));

    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 10, clientY: -80 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: -80 }),
    );

    expect((onSwipe.mock.calls[0][0] as SwipeGestureEvent).direction).toBe('up');
  });

  it('mesafe eşiğin altında ama hız (flick) eşiğini geçerse yine swipe sayılır', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const onSwipe = vi.fn();
    // threshold çok yüksek (200px) ama velocityThreshold düşük (0.1px/ms) —
    // kısa (20px) ama hızlı (10ms'de) bir flick mesafe eşiğini aşmaz, hız eşiğini aşar.
    const zone = track(new SwipeGestureZone({ threshold: 200, velocityThreshold: 0.1, onSwipe }));

    now = 0;
    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    now = 10;
    zone.element.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 20, clientY: 0 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 20, clientY: 0 }),
    );

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect((onSwipe.mock.calls[0][0] as SwipeGestureEvent).velocity).toBeCloseTo(2); // 20px/10ms
  });

  it('hem mesafe hem hız eşiğinin altındaysa swipe tetiklenmez', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const onSwipe = vi.fn();
    // threshold=100 (20px mesafe altında kalır), velocityThreshold=5
    // (20px/100ms=0.2px/ms hız eşiğinin de altında kalır) — YAVAŞ ve KISA
    // bir sürükleme, gerçek bir "yanlışlıkla dokunma" senaryosu.
    const zone = track(new SwipeGestureZone({ threshold: 100, velocityThreshold: 5, onSwipe }));

    now = 0;
    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    now = 100;
    zone.element.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 20, clientY: 0 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 20, clientY: 0 }),
    );

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('onSwipeMove sürükleme SIRASINDA (bırakılmadan) her harekette çağrılır', () => {
    const onSwipeMove = vi.fn();
    const zone = track(new SwipeGestureZone({ onSwipeMove }));

    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 20, clientY: 5 }),
    );

    expect(onSwipeMove).toHaveBeenCalledWith(20, 5);
  });

  it("aynı anda ikinci bir parmak zone'un jestini çalmaz (tek jest takip edilir)", () => {
    const onSwipe = vi.fn();
    const zone = track(new SwipeGestureZone({ threshold: 40, onSwipe }));

    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 2, clientX: 50, clientY: 50 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 2, clientX: 200, clientY: 50 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 2, clientX: 200, clientY: 50 }),
    );

    expect(onSwipe).not.toHaveBeenCalled(); // ikinci parmak yok sayıldı
  });

  it('destroy pointer listenerlarını temizler', () => {
    const zone = new SwipeGestureZone();
    const removeListener = vi.spyOn(zone.element, 'removeEventListener');
    zone.destroy();
    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});

describe('MultiTouchZone', () => {
  it("birden fazla parmak bağımsız olarak takip edilir, her biri kendi pointerId'siyle raporlanır", () => {
    const onTouchStart = vi.fn();
    const zone = track(new MultiTouchZone({ onTouchStart }));
    vi.spyOn(zone.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 20 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 2, clientX: 30, clientY: 40 }),
    );

    expect(onTouchStart).toHaveBeenCalledTimes(2);
    expect(onTouchStart).toHaveBeenCalledWith({ pointerId: 1, x: 10, y: 20 });
    expect(onTouchStart).toHaveBeenCalledWith({ pointerId: 2, x: 30, y: 40 });
    expect(zone.getActivePointerIds().sort()).toEqual([1, 2]);
  });

  it('maxTouches aşıldığında yeni dokunuşlar sessizce yok sayılır, mevcutlar etkilenmez', () => {
    const onTouchStart = vi.fn();
    const zone = track(new MultiTouchZone({ maxTouches: 1, onTouchStart }));

    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 2, clientX: 10, clientY: 10 }),
    );

    expect(onTouchStart).toHaveBeenCalledTimes(1);
    expect(zone.getActivePointerIds()).toEqual([1]);
  });

  it('bir parmak kaldırılınca onTouchEnd çağrılır ve takip listesinden çıkar', () => {
    const onTouchEnd = vi.fn();
    const zone = track(new MultiTouchZone({ onTouchEnd }));

    zone.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    zone.element.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 0, clientY: 0 }));

    expect(onTouchEnd).toHaveBeenCalledWith(1);
    expect(zone.getActivePointerIds()).toEqual([]);
  });

  it("takip edilmeyen bir pointerId'nin hareketi/kaldırılması yok sayılır", () => {
    const onTouchMove = vi.fn();
    const onTouchEnd = vi.fn();
    const zone = track(new MultiTouchZone({ onTouchMove, onTouchEnd }));

    zone.element.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 99, clientX: 0, clientY: 0 }),
    );
    zone.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 99, clientX: 0, clientY: 0 }),
    );

    expect(onTouchMove).not.toHaveBeenCalled();
    expect(onTouchEnd).not.toHaveBeenCalled();
  });

  it('destroy pointer listenerlarını temizler', () => {
    const zone = new MultiTouchZone();
    const removeListener = vi.spyOn(zone.element, 'removeEventListener');
    zone.destroy();
    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});

describe('SquareJoystick', () => {
  function mockBaseRect(joystick: SquareJoystick, centerX = 100, centerY = 100, size = 112): void {
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-square-joystick__base')!;
    vi.spyOn(base, 'getBoundingClientRect').mockReturnValue({
      left: centerX - size / 2,
      top: centerY - size / 2,
      right: centerX + size / 2,
      bottom: centerY + size / 2,
      width: size,
      height: size,
      x: centerX - size / 2,
      y: centerY - size / 2,
      toJSON: () => ({}),
    });
  }

  it('sürükleme her eksende AYRI AYRI kare sınıra (halfSize) kenetlenir — dairesel clamp uygulanmaz', () => {
    const onMove = vi.fn();
    const joystick = track(new SquareJoystick({ size: 56, deadZone: 0, onMove }));
    mockBaseRect(joystick, 100, 100);
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-square-joystick__base')!;

    // Merkezden (100,100) çapraz olarak (200,200)'e sürükle — dx=dy=100,
    // halfSize=56'yı aşıyor. Dairesel bir joystick'te bu, mesafe (Math.hypot)
    // radius'a kenetlenip x=y=~0.707 (45°) verirdi; kare joystick'te HER
    // eksen kendi başına 56'ya kenetlenir, ikisi de tam 1.0 olmalı.
    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 200,
        clientY: 200,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(onMove).toHaveBeenCalledWith({ x: 1, y: 1 });
  });

  it("yalnızca X ekseninde sürüklemek Y'yi 0'da bırakır (eksenler bağımsızdır)", () => {
    const onMove = vi.fn();
    const joystick = track(new SquareJoystick({ size: 56, deadZone: 0, onMove }));
    mockBaseRect(joystick, 100, 100);
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-square-joystick__base')!;

    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 128,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );

    const vector = onMove.mock.calls.at(-1)![0] as { x: number; y: number };
    expect(vector.x).toBeCloseTo(0.5); // dx=28, halfSize=56 -> 0.5
    expect(vector.y).toBe(0);
  });

  it('deadZone altındaki hareket sıfır vektör döndürür', () => {
    const onMove = vi.fn();
    const joystick = track(new SquareJoystick({ size: 56, deadZone: 0.2, onMove }));
    mockBaseRect(joystick, 100, 100);
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-square-joystick__base')!;

    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 105,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );

    const vector = onMove.mock.calls.at(-1)![0] as { x: number; y: number };
    expect(vector.x).toBe(0);
    expect(vector.y).toBe(0);
  });

  it('bırakınca thumb merkeze döner ve onRelease çağrılır', () => {
    const onRelease = vi.fn();
    const joystick = track(new SquareJoystick({ size: 56, onRelease }));
    mockBaseRect(joystick, 100, 100);
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-square-joystick__base')!;
    const thumb = joystick.element.querySelector<HTMLDivElement>('.vol-square-joystick__thumb')!;

    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 130,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 1, bubbles: true, cancelable: true }),
    );

    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(thumb.style.transform).toBe('translate(-50%, -50%)');
  });

  it('ikinci bir parmak aktif sürüklemeyi çalmaz', () => {
    const onMove = vi.fn();
    const joystick = track(new SquareJoystick({ size: 56, deadZone: 0, onMove }));
    mockBaseRect(joystick, 100, 100);
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-square-joystick__base')!;

    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    onMove.mockClear();
    base.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 2,
        clientX: 130,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(onMove).not.toHaveBeenCalled();
  });

  it('destroy pointer listenerlarını temizler', () => {
    const joystick = new SquareJoystick();
    const base = joystick.element.querySelector<HTMLDivElement>('.vol-square-joystick__base')!;
    const removeBaseListener = vi.spyOn(base, 'removeEventListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');

    joystick.destroy();

    expect(removeBaseListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});
