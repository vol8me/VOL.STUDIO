import { describe, it, expect, vi } from 'vitest';
import { Scheduler } from '../../src/time/Scheduler';

describe('Scheduler', () => {
  it('after() süre dolunca BİR KEZ çalışır', () => {
    const scheduler = new Scheduler();
    const fn = vi.fn();
    scheduler.after(100, fn);

    scheduler.update(99);
    expect(fn).not.toHaveBeenCalled();

    scheduler.update(1);
    expect(fn).toHaveBeenCalledTimes(1);

    scheduler.update(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('every() periyodik çalışır', () => {
    const scheduler = new Scheduler();
    const fn = vi.fn();
    scheduler.every(50, fn);

    scheduler.update(50);
    scheduler.update(50);
    scheduler.update(50);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uzun bir kare birikmiş tetiklenmeleri YEMEZ', () => {
    // Kare düşmesinde iş sessizce atlanırsa oyun mantığı gerçek zamandan
    // geri kalır; 200ms'lik bir karede 50ms'lik iş dört kez çalışmalı.
    const scheduler = new Scheduler();
    const fn = vi.fn();
    scheduler.every(50, fn);

    scheduler.update(200);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('iptal edilen iş bir daha çalışmaz', () => {
    const scheduler = new Scheduler();
    const fn = vi.fn();
    const cancel = scheduler.every(10, fn);

    scheduler.update(10);
    cancel();
    scheduler.update(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('iptal iki kez çağrılabilir (no-op)', () => {
    const scheduler = new Scheduler();
    const cancel = scheduler.after(10, vi.fn());
    cancel();
    expect(() => cancel()).not.toThrow();
  });

  it('callback içinde eklenen iş AYNI turda çalışmaz (sonsuz döngü koruması)', () => {
    // Kendini yeniden kaydeden bir callback, aynı update() içinde işlenirse
    // döngü asla bitmez.
    const scheduler = new Scheduler();
    const inner = vi.fn();
    scheduler.after(10, () => {
      scheduler.after(0, inner);
    });

    scheduler.update(10);
    expect(inner).not.toHaveBeenCalled();

    scheduler.update(1);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('callback içinde iptal edilen tekrarlı iş o turda tekrar çalışmaz', () => {
    const scheduler = new Scheduler();
    let calls = 0;
    const cancel = scheduler.every(10, () => {
      calls++;
      cancel();
    });

    scheduler.update(100);
    expect(calls).toBe(1);
  });

  it('sıfır/negatif periyot reddedilir — tek update içinde sonsuz döngü olurdu', () => {
    const scheduler = new Scheduler();
    const fn = vi.fn();
    scheduler.every(0, fn);
    scheduler.update(100);

    expect(fn).not.toHaveBeenCalled();
    expect(scheduler.size).toBe(0);
  });

  it('negatif periyot da reddedilir', () => {
    const scheduler = new Scheduler();
    const fn = vi.fn();
    scheduler.every(-5, fn);
    scheduler.update(100);

    expect(fn).not.toHaveBeenCalled();
    expect(scheduler.size).toBe(0);
  });

  it('sıfır/negatif delta zamanı ilerletmez', () => {
    const scheduler = new Scheduler();
    const fn = vi.fn();
    scheduler.after(10, fn);

    scheduler.update(0);
    scheduler.update(-50);
    expect(fn).not.toHaveBeenCalled();
  });

  it('clear() tüm işleri iptal eder', () => {
    const scheduler = new Scheduler();
    scheduler.after(10, vi.fn());
    scheduler.every(10, vi.fn());
    expect(scheduler.size).toBe(2);

    scheduler.clear();
    expect(scheduler.size).toBe(0);
  });

  it('tek seferlik iş çalıştıktan sonra listeden düşer', () => {
    const scheduler = new Scheduler();
    scheduler.after(10, vi.fn());
    scheduler.update(10);
    expect(scheduler.size).toBe(0);
  });

  it('deterministik: aynı delta dizisi aynı sırayı üretir', () => {
    const run = (): string[] => {
      const scheduler = new Scheduler();
      const order: string[] = [];
      scheduler.after(30, () => order.push('a'));
      scheduler.every(20, () => order.push('b'));
      for (const dt of [10, 15, 20, 25]) scheduler.update(dt);
      return order;
    };

    expect(run()).toEqual(run());
  });

  describe('runaway telafi koruması', () => {
    it('tek update içindeki tekrar sayısı SINIRLIDIR', () => {
      // Donmuş bir sekmeden dönüşte tek dev delta, kısa periyotlu bir işi
      // yüz binlerce kez çağırıp kareyi kilitlerdi.
      const scheduler = new Scheduler({ maxCatchUp: 5 });
      const fn = vi.fn();
      scheduler.every(1, fn);

      scheduler.update(600_000); // 10 dakikalık donma
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('sınıra takılan iş borcunu DÜŞER — sonraki karede tekrar takılmaz', () => {
      // Borç düşülmezse her karede aynı sınıra çarpar ve iş asla normale dönmez.
      const scheduler = new Scheduler({ maxCatchUp: 3 });
      const fn = vi.fn();
      scheduler.every(10, fn);

      scheduler.update(100_000);
      fn.mockClear();

      scheduler.update(10);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('atlanan tetiklenme sayısı bildirilir (sessizce kaybolmaz)', () => {
      const onCatchUpLimit = vi.fn();
      const scheduler = new Scheduler({ maxCatchUp: 2, onCatchUpLimit });
      scheduler.every(10, vi.fn());

      scheduler.update(1000);
      expect(onCatchUpLimit).toHaveBeenCalledTimes(1);
      expect(onCatchUpLimit.mock.calls[0][0]).toBeGreaterThan(0);
    });

    it('normal karede sınır devreye girmez', () => {
      const onCatchUpLimit = vi.fn();
      const scheduler = new Scheduler({ maxCatchUp: 32, onCatchUpLimit });
      const fn = vi.fn();
      scheduler.every(16, fn);

      scheduler.update(16);
      scheduler.update(16);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(onCatchUpLimit).not.toHaveBeenCalled();
    });

    it('geçersiz maxCatchUp varsayılana düşer', () => {
      const scheduler = new Scheduler({ maxCatchUp: 0 });
      const fn = vi.fn();
      scheduler.every(1, fn);

      scheduler.update(10_000);
      expect(fn).toHaveBeenCalledTimes(32);
    });

    it('tek seferlik iş sınırdan etkilenmez', () => {
      const scheduler = new Scheduler({ maxCatchUp: 1 });
      const fn = vi.fn();
      scheduler.after(10, fn);

      scheduler.update(10_000);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
