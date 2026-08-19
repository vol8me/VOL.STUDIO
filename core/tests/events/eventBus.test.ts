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

  it('once yalnızca bir kez çalışır', () => {
    const bus = new EventBus<Events>();
    const handler = vi.fn();
    bus.once('changed', handler);

    bus.emit('changed', { total: 1 });
    bus.emit('changed', { total: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('changed')).toBe(0);
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
