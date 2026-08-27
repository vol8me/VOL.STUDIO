import { describe, it, expect, vi } from 'vitest';
import { DisposableScope } from '../../src/lifecycle/DisposableScope';

describe('DisposableScope', () => {
  it('add ile kaydedilen kaynak dispose() çağrılana kadar kapatılmaz', () => {
    const scope = new DisposableScope();
    const dispose = vi.fn();
    scope.add({ dispose });

    expect(dispose).not.toHaveBeenCalled();
    scope.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('add() verilen kaynağı olduğu gibi geri döner', () => {
    const scope = new DisposableScope();
    const resource = { dispose: vi.fn(), value: 42 };
    expect(scope.add(resource)).toBe(resource);
  });

  it('kaynaklar EKLENİŞ SIRASININ TERSİNDE kapatılır', () => {
    const scope = new DisposableScope();
    const order: string[] = [];
    scope.add({ dispose: () => order.push('a') });
    scope.add({ dispose: () => order.push('b') });
    scope.add({ dispose: () => order.push('c') });

    scope.dispose();
    expect(order).toEqual(['c', 'b', 'a']);
  });

  it('ikinci dispose() çağrısı no-op — kaynaklar tekrar kapatılmaz', () => {
    const scope = new DisposableScope();
    const dispose = vi.fn();
    scope.add({ dispose });

    scope.dispose();
    scope.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('dispose() sonrası eklenen kaynak HEMEN kapatılır, kayıtlı tutulmaz', () => {
    const scope = new DisposableScope();
    scope.dispose();

    const dispose = vi.fn();
    scope.add({ dispose });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('isDisposed() dispose() öncesi false, sonrası true döner', () => {
    const scope = new DisposableScope();
    expect(scope.isDisposed()).toBe(false);
    scope.dispose();
    expect(scope.isDisposed()).toBe(true);
  });

  it('addListener target.addEventListener çağırır ve dispose()ta removeEventListener yapar', () => {
    const target = new EventTarget();
    const addSpy = vi.spyOn(target, 'addEventListener');
    const removeSpy = vi.spyOn(target, 'removeEventListener');
    const handler = vi.fn();

    const scope = new DisposableScope();
    scope.addListener(target, 'custom', handler, { passive: true });

    expect(addSpy).toHaveBeenCalledWith('custom', handler, { passive: true });
    expect(removeSpy).not.toHaveBeenCalled();

    scope.dispose();
    expect(removeSpy).toHaveBeenCalledWith('custom', handler, { passive: true });
  });

  it('addListener options verilmezse add/removeEventListener İKİ argümanla çağrılır', () => {
    // Bazı test spy'ları (ör. vi.spyOn(...).toHaveBeenCalledWith) iki ve üç
    // argümanlı çağrıları (üçüncüsü açık `undefined` olsa bile) FARKLI sayar.
    // Bu test, options'sız kullanımın çağıranın orijinal iki-argümanlı
    // add/removeEventListener çağrısını birebir koruduğunu kilitler.
    const target = new EventTarget();
    const addSpy = vi.spyOn(target, 'addEventListener');
    const removeSpy = vi.spyOn(target, 'removeEventListener');
    const handler = vi.fn();

    const scope = new DisposableScope();
    scope.addListener(target, 'ping', handler);
    expect(addSpy).toHaveBeenCalledWith('ping', handler);

    scope.dispose();
    expect(removeSpy).toHaveBeenCalledWith('ping', handler);
  });

  it('addListener ile kaydedilen dinleyici dispose() sonrası artık tetiklenmez', () => {
    const target = new EventTarget();
    const handler = vi.fn();
    const scope = new DisposableScope();
    scope.addListener(target, 'ping', handler);

    target.dispatchEvent(new Event('ping'));
    expect(handler).toHaveBeenCalledTimes(1);

    scope.dispose();
    target.dispatchEvent(new Event('ping'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('bir kaynağın dispose() hatası diğer kaynakların kapatılmasını engellemez', () => {
    const scope = new DisposableScope();
    const disposeA = vi.fn();
    scope.add({ dispose: disposeA });
    scope.add({
      dispose: () => {
        throw new Error('kaynak kapatma hatası');
      },
    });
    const disposeC = vi.fn();
    scope.add({ dispose: disposeC });

    expect(() => scope.dispose()).not.toThrow();
    // Ters sıra: C önce, sonra hata fırlatan B (yutulur), sonra A — üçü de denenir.
    expect(disposeC).toHaveBeenCalledTimes(1);
    expect(disposeA).toHaveBeenCalledTimes(1);
  });

  it('addSubscription aboneliği scope kapanırken kaldırır ve tek kez çağırır', () => {
    const scope = new DisposableScope();
    const unsubscribe = vi.fn();

    scope.addSubscription(unsubscribe);
    scope.dispose();
    scope.dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('addDestroyable bileşeni ters sırayla kapatır', () => {
    const scope = new DisposableScope();
    const destroy = vi.fn();
    const component = { destroy };

    expect(scope.addDestroyable(component)).toBe(component);
    scope.dispose();

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('addDestroyables bileşenleri ekleniş sırasının tersinde kapatır', () => {
    const scope = new DisposableScope();
    const order: string[] = [];
    scope.addDestroyables({ destroy: () => order.push('a') }, { destroy: () => order.push('b') });

    scope.dispose();

    expect(order).toEqual(['b', 'a']);
  });

  it('timeout çalışınca kendini scope kaydından çıkarır ve cancel tekrar çalışmaz', () => {
    vi.useFakeTimers();
    try {
      const scope = new DisposableScope();
      const callback = vi.fn();
      const timer = scope.addTimeout(callback, 20);

      vi.advanceTimersByTime(20);
      timer.cancel();
      scope.dispose();

      expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('interval scope kapanınca durur', () => {
    vi.useFakeTimers();
    try {
      const scope = new DisposableScope();
      const callback = vi.fn();
      scope.addInterval(callback, 10);

      vi.advanceTimersByTime(25);
      expect(callback).toHaveBeenCalledTimes(2);
      scope.dispose();
      vi.advanceTimersByTime(30);
      expect(callback).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
