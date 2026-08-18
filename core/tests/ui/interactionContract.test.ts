import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TouchButton } from '../../src/ui/controls/TouchButton';
import { MultiTouchZone } from '../../src/ui/controls/MultiTouchZone';
import { SwipeGestureZone, type SwipeGestureEvent } from '../../src/ui/controls/SwipeGestureZone';
import { Button } from '../../src/ui/primitives/Button';
import { IconButton } from '../../src/ui/primitives/IconButton';

/**
 * Evrensel etkileşim sözleşmesi — bir bileşenin hangi girdi cihazıyla
 * kullanıldığına göre farklı garanti vermemesini kilitler.
 */

function key(type: 'keydown' | 'keyup', k: string, repeat = false): KeyboardEvent {
  return new KeyboardEvent(type, { key: k, repeat, bubbles: true, cancelable: true });
}

function pointer(type: string, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { pointerId: 1, bubbles: true, cancelable: true, ...init });
}

describe('TouchButton — press/hold semantiği girdi cihazından bağımsız', () => {
  it('Space basılı tutmak onPress, bırakmak onRelease üretir', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const button = new TouchButton({ label: 'Ateş', onPress, onRelease });

    button.element.dispatchEvent(key('keydown', ' '));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.isPressed()).toBe(true);

    button.element.dispatchEvent(key('keyup', ' '));
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(button.isPressed()).toBe(false);

    button.destroy();
  });

  it('Enter de aktivasyon tuşudur', () => {
    const onPress = vi.fn();
    const button = new TouchButton({ label: 'Ateş', onPress });

    button.element.dispatchEvent(key('keydown', 'Enter'));
    expect(onPress).toHaveBeenCalledTimes(1);

    button.destroy();
  });

  it('klavye tekrarı (auto-repeat) yeni bir onPress SAYILMAZ', () => {
    // Tarayıcı basılı tutmada keydown'ı tekrarlar; her tekrar bir "basıldı"
    // sayılsaydı çağıran saniyede onlarca sahte olay görürdü.
    const onPress = vi.fn();
    const button = new TouchButton({ label: 'Ateş', onPress });

    button.element.dispatchEvent(key('keydown', ' '));
    button.element.dispatchEvent(key('keydown', ' ', true));
    button.element.dispatchEvent(key('keydown', ' ', true));

    expect(onPress).toHaveBeenCalledTimes(1);
    button.destroy();
  });

  it('native click yutulur — Space tek bir press/release çifti üretir', () => {
    const onPress = vi.fn();
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const button = new TouchButton({ label: 'Ateş', onPress });

    button.element.dispatchEvent(clickEvent);
    expect(onPress).not.toHaveBeenCalled();
    expect(clickEvent.defaultPrevented).toBe(true);

    button.destroy();
  });

  it('devre dışıyken klavye basımı yok sayılır', () => {
    const onPress = vi.fn();
    const button = new TouchButton({ label: 'Ateş', onPress });
    button.setDisabled(true);

    button.element.dispatchEvent(key('keydown', ' '));
    expect(onPress).not.toHaveBeenCalled();

    button.destroy();
  });

  it('klavyeyle basılıyken pointerleave basımı İPTAL ETMEZ', () => {
    // Fare imleci butonun üstünden geçip çıkarsa klavye basımı bozulmamalı.
    const onRelease = vi.fn();
    const button = new TouchButton({ label: 'Ateş', onRelease });

    button.element.dispatchEvent(key('keydown', ' '));
    button.element.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));

    expect(onRelease).not.toHaveBeenCalled();
    expect(button.isPressed()).toBe(true);

    button.destroy();
  });

  it('BASILIYKEN destroy edilirse onRelease gelir (mandallı durum bırakmaz)', () => {
    // Regresyon: oyuncu ateş tuşunu basılı tutarken sahne kapanınca çağıranın
    // "basılı" durumu asılı kalıyordu — ateş hiç durmuyordu.
    const onRelease = vi.fn();
    const button = new TouchButton({ label: 'Ateş', onRelease });

    button.element.dispatchEvent(pointer('pointerdown'));
    expect(button.isPressed()).toBe(true);

    button.destroy();
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(button.isPressed()).toBe(false);
  });
});

describe('Pointer capture lifecycle', () => {
  it('MultiTouchZone: aktif parmaklarla destroy her parmak için onTouchEnd üretir', () => {
    const onTouchEnd = vi.fn();
    const zone = new MultiTouchZone({ onTouchEnd });
    document.body.appendChild(zone.element);

    zone.element.dispatchEvent(pointer('pointerdown', { pointerId: 1 }));
    zone.element.dispatchEvent(pointer('pointerdown', { pointerId: 2 }));
    expect(zone.getActivePointerIds()).toEqual([1, 2]);

    zone.destroy();

    expect(onTouchEnd).toHaveBeenCalledTimes(2);
    expect(onTouchEnd).toHaveBeenCalledWith(1);
    expect(onTouchEnd).toHaveBeenCalledWith(2);
    expect(zone.getActivePointerIds()).toEqual([]);
  });

  it('SwipeGestureZone: sürükleme ortasında destroy sonrası eski pointer olayları jest üretmez', () => {
    const onSwipe = vi.fn();
    const zone = new SwipeGestureZone({ onSwipe });
    document.body.appendChild(zone.element);

    zone.element.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }));
    zone.destroy();
    zone.element.dispatchEvent(pointer('pointerup', { clientX: 300, clientY: 0 }));

    expect(onSwipe).not.toHaveBeenCalled();
  });
});

describe('SwipeGestureZone — hız BIRAKMA anından ölçülür', () => {
  let now = 0;

  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function drag(zone: SwipeGestureZone, samples: Array<{ x: number; t: number }>): void {
    now = 0;
    zone.element.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }));
    for (const sample of samples) {
      now = sample.t;
      zone.element.dispatchEvent(pointer('pointermove', { clientX: sample.x, clientY: 0 }));
    }
    const last = samples[samples.length - 1];
    zone.element.dispatchEvent(pointer('pointerup', { clientX: last.x, clientY: 0 }));
  }

  it('yavaş sürükleyip son anda savurmak flick sayılır (ortalama hız düşük olsa bile)', () => {
    const onSwipe = vi.fn<(event: SwipeGestureEvent) => void>();
    // Eşiğin ALTINDA mesafe: jest yalnızca hız koşuluyla geçebilir.
    const zone = new SwipeGestureZone({ onSwipe, threshold: 1000, velocityThreshold: 0.5 });

    // 1000 ms boyunca 10 px (ortalama 0.01 px/ms), son 10 ms'te 30 px (3 px/ms).
    drag(zone, [
      { x: 10, t: 1000 },
      { x: 40, t: 1010 },
    ]);

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe.mock.calls[0][0].velocity).toBeCloseTo(3, 5);
  });

  it('hızlı başlayıp DURARAK biten jest flick sayılmaz (ortalama hız yüksek olsa bile)', () => {
    const onSwipe = vi.fn();
    const zone = new SwipeGestureZone({ onSwipe, threshold: 1000, velocityThreshold: 0.5 });

    // İlk 10 ms'te 300 px (ortalama ~0.3 px/ms), son 100 ms'te 1 px (0.01 px/ms).
    drag(zone, [
      { x: 300, t: 10 },
      { x: 301, t: 110 },
    ]);

    expect(onSwipe).not.toHaveBeenCalled();
  });
});

describe('Button / IconButton — aynı tıklama sözleşmesi', () => {
  it('Button thenable (native olmayan söz) döndüren handler’ı BEKLER', async () => {
    // Regresyon: `result instanceof Promise` kontrolü thenable’ı kaçırıyordu;
    // loading anında kalkıyor ve çağıran işin bittiğini sanıyordu.
    let resolveThenable: () => void = () => {};
    const thenable = {
      then(onFulfilled: () => void) {
        resolveThenable = onFulfilled;
      },
    };
    const button = new Button('Kaydet', {
      onClick: () => thenable as unknown as Promise<void>,
    });

    button.element.click();
    await Promise.resolve();

    expect(button.element.disabled).toBe(true);
    expect(button.element.getAttribute('aria-busy')).toBe('true');

    resolveThenable();
    await Promise.resolve();
    await Promise.resolve();

    expect(button.element.disabled).toBe(false);
    expect(button.element.getAttribute('aria-busy')).toBe('false');
    button.destroy();
  });

  it('IconButton da asenkron handler bekler ve aria-busy yazar', async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const button = new IconButton('⚙', { label: 'Ayarlar', onClick: () => pending });

    button.element.click();
    await Promise.resolve();
    expect(button.element.getAttribute('aria-busy')).toBe('true');
    expect(button.element.disabled).toBe(true);

    release();
    await pending;
    await Promise.resolve();

    expect(button.element.getAttribute('aria-busy')).toBe('false');
    expect(button.element.disabled).toBe(false);
    button.destroy();
  });

  it('IconButton handler’ın fırlattığı hata yakalanır ve buton kilitli kalmaz', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const button = new IconButton('⚙', {
      label: 'Ayarlar',
      onClick: () => {
        throw new Error('patladı');
      },
    });

    button.element.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(spy).toHaveBeenCalled();
    expect(button.element.disabled).toBe(false);
    button.destroy();
    spy.mockRestore();
  });

  it('IconButton: işlem sürerken ikinci tıklama handler’ı tekrar çalıştırmaz', async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = vi.fn(() => pending);
    const button = new IconButton('⚙', { label: 'Ayarlar', onClick: handler });

    button.element.click();
    await Promise.resolve();
    button.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(handler).toHaveBeenCalledTimes(1);

    release();
    await pending;
    button.destroy();
  });

  it('IconButton.onClick iki kez çağrılırsa yalnızca SON handler çalışır', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const button = new IconButton('⚙', { label: 'Ayarlar', onClick: first });
    button.onClick(second);

    button.element.click();
    await Promise.resolve();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    button.destroy();
  });
});
