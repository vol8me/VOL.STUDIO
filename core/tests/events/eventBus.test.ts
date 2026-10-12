import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/events/EventBus';

interface Events {
  changed: { total: number };
  ended: void;
}

describe('EventBus', () => {
  it('abone olan dinleyici yayını alır', () => {
    const bus = new EventBus<Events>();
    const handler = vi.fn();
    bus.on('changed', handler);

    bus.emit('changed', { total: 5 });
    expect(handler).toHaveBeenCalledWith({ total: 5 });
  });

  it('aboneliği iptal eden dinleyici bir daha çağrılmaz', () => {
    const bus = new EventBus<Events>();
    const handler = vi.fn();
    const off = bus.on('changed', handler);

    off();
    bus.emit('changed', { total: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('iptal iki kez çağrılabilir (no-op)', () => {
    const bus = new EventBus<Events>();
    const off = bus.on('changed', vi.fn());
    off();
    expect(() => off()).not.toThrow();
  });

  it('eski iptal yeniden çağrılınca yeni abonelik korunur', () => {
    const bus = new EventBus<Events>();
    const off = bus.on('changed', () => {});
    off();
    const totals: number[] = [];
    bus.on('changed', ({ total }) => totals.push(total));

    off();
    bus.emit('changed', { total: 7 });

    expect(totals).toEqual([7]);
    expect(bus.listenerCount('changed')).toBe(1);
  });

  it.each(['event', 'all'] as const)(
    'clear (%s) öncesindeki iptal yeni aboneliği kaldırmaz',
    (mode) => {
      const bus = new EventBus<Events>();
      const off = bus.on('changed', () => {});
      if (mode === 'event') bus.clear('changed');
      else bus.clear();
      const totals: number[] = [];
      bus.on('changed', ({ total }) => totals.push(total));

      off();
      bus.emit('changed', { total: 8 });

      expect(totals).toEqual([8]);
      expect(bus.listenerCount('changed')).toBe(1);
    },
  );

  it('once yalnızca bir kez çalışır', () => {
    const bus = new EventBus<Events>();
    const handler = vi.fn();
    bus.once('changed', handler);

    bus.emit('changed', { total: 1 });
    bus.emit('changed', { total: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('changed')).toBe(0);
  });

  it('iç içe yayın sırasında once dış snapshotta tekrar çalışmaz', () => {
    const bus = new EventBus<Events>();
    let nested = false;
    bus.on('changed', () => {
      if (nested) return;
      nested = true;
      bus.emit('changed', { total: 2 });
    });
    const totals: number[] = [];
    bus.once('changed', ({ total }) => totals.push(total));

    bus.emit('changed', { total: 1 });

    expect(totals).toEqual([2]);
    expect(bus.listenerCount('changed')).toBe(1);
  });

  it('yayın sırasında abonelikten çıkan dinleyici KALANLARI atlatmaz', () => {
    // Canlı küme üzerinde yürümek, silme sırasında sonraki dinleyiciyi
    // atlayabilir; kopya üzerinde yürünür.
    const bus = new EventBus<Events>();
    const second = vi.fn();
    const off = bus.on('changed', () => off());
    bus.on('changed', second);

    bus.emit('changed', { total: 1 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('yayın sırasında eklenen dinleyici O yayında çağrılmaz', () => {
    const bus = new EventBus<Events>();
    const late = vi.fn();
    bus.on('changed', () => bus.on('changed', late));

    bus.emit('changed', { total: 1 });
    expect(late).not.toHaveBeenCalled();

    bus.emit('changed', { total: 2 });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('bir dinleyicinin hatası KALANLARI durdurmaz', () => {
    const bus = new EventBus<Events>();
    const onHandlerError = vi.fn();
    bus.onHandlerError = onHandlerError;

    const after = vi.fn();
    bus.on('changed', () => {
      throw new Error('bozuk');
    });
    bus.on('changed', after);

    bus.emit('changed', { total: 1 });
    expect(after).toHaveBeenCalledTimes(1);
    expect(onHandlerError).toHaveBeenCalledTimes(1);
  });

  it('hata kancası yoksa konsola yazılır, sessizce yutulmaz', () => {
    const bus = new EventBus<Events>();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('changed', () => {
      throw new Error('bozuk');
    });

    bus.emit('changed', { total: 1 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('hata kancası fırlatınca kalan dinleyiciler yayını alır', () => {
    const bus = new EventBus<Events>();
    const reporterError = new Error('hata kancası');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.onHandlerError = () => {
      throw reporterError;
    };
    bus.on('changed', () => {
      throw new Error('dinleyici');
    });
    const totals: number[] = [];
    bus.on('changed', ({ total }) => totals.push(total));

    try {
      expect(bus.emit('changed', { total: 9 })).toBe(1);
      expect(totals).toEqual([9]);
      expect(spy).toHaveBeenCalledWith(expect.any(String), reporterError);
    } finally {
      spy.mockRestore();
    }
  });

  it('dinleyicisi olmayan olay yayını sorunsuzdur', () => {
    const bus = new EventBus<Events>();
    expect(() => bus.emit('ended', undefined)).not.toThrow();
  });

  it('aynı handler iki kez eklenirse bir kez tutulur (Set semantiği)', () => {
    const bus = new EventBus<Events>();
    const handler = vi.fn();
    bus.on('changed', handler);
    bus.on('changed', handler);

    bus.emit('changed', { total: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('clear tek olayı ya da tümünü siler', () => {
    const bus = new EventBus<Events>();
    bus.on('changed', vi.fn());
    bus.on('ended', vi.fn());

    bus.clear('changed');
    expect(bus.listenerCount('changed')).toBe(0);
    expect(bus.listenerCount('ended')).toBe(1);

    bus.clear();
    expect(bus.listenerCount('ended')).toBe(0);
  });
});
