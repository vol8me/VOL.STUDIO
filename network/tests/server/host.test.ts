import { EventEmitter } from 'node:events';
import { Room, defineRoom } from '@colyseus/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectRoom } from '../../src/client';
import {
  createHost,
  DEFAULT_MAX_PAYLOAD_BYTES,
  installShutdown,
  Logger,
  startHost,
  type StartedHost,
} from '../../src/server';

class PingRoom extends Room {
  override onCreate(): void {
    this.onMessage('input', (client, message: unknown) => client.send('echo', message));
  }
}

const rooms = { ping: defineRoom(PingRoom) };
const started: StartedHost<typeof rooms>[] = [];

async function start(logger?: Logger): Promise<StartedHost<typeof rooms>> {
  const host = await startHost(rooms, { port: 0, host: '127.0.0.1' }, { logger });
  started.push(host);
  return host;
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((host) => host.stop()));
});

describe('createHost', () => {
  it('dinlemeden kurar ve oda tanımlarını taşır', () => {
    const host = createHost(rooms);
    expect(host.http.listening).toBe(false);
    expect(host.server).toBeDefined();
  });

  it('varsayılan ileti sınırı 1 KiB’dir', () => {
    expect(DEFAULT_MAX_PAYLOAD_BYTES).toBe(1024);
  });
});

describe('startHost', () => {
  it('rastgele portta dinler, adresi döner ve gerçek istemci odaya katılır', async () => {
    const logger = Logger.create({ src: 'test' });
    const host = await start(logger);
    expect(host.port).toBeGreaterThan(0);
    expect(host.endpoint).toBe(`http://127.0.0.1:${host.port}`);
    const room = await connectRoom(host.endpoint, 'ping');
    expect(room.sessionId).toBeTruthy();
    await room.dispose();
    const event = logger.since().records.find((record) => record.ev === 'listening');
    expect(event?.src).toBe('host');
    expect(event?.data).toMatchObject({ endpoint: host.endpoint, rooms: ['ping'] });
  });

  it('stop tekrar çağrılabilir ve kapanışı tek kez günlüğe yazar', async () => {
    const logger = Logger.create({ src: 'test' });
    const host = await start(logger);
    await Promise.all([host.stop(), host.stop()]);
    await host.stop();
    expect(logger.since().records.filter((record) => record.ev === 'stopped')).toHaveLength(1);
  });

  it('kullanımdaki porta bağlanamazsa hata verir', async () => {
    const first = await start();
    const logger = Logger.create({ src: 'test' });
    await expect(
      startHost(rooms, { port: first.port, host: '127.0.0.1' }, { logger }),
    ).rejects.toThrow(/EADDRINUSE/);
    const failed = logger.since().records.find((record) => record.ev === 'listen.failed');
    expect(failed?.data).toMatchObject({ port: first.port, host: '127.0.0.1' });
  });
});

describe('installShutdown', () => {
  const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  function setup(stop: () => Promise<void>, graceMs?: number) {
    const target = new EventEmitter();
    const exit = vi.fn();
    const logger = Logger.create({ src: 'test' });
    const remove = installShutdown(stop, { logger, exit, graceMs, target });
    return { target, exit, logger, remove };
  }

  it('sinyalde stop çalışır, günlük kapanır, bitince 0 koduyla çıkılır', async () => {
    const stop = vi.fn(() => Promise.resolve());
    const { target, exit, logger } = setup(stop);
    const close = vi.spyOn(logger, 'close');
    target.emit('SIGTERM');
    expect(stop).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    await tick();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(close).toHaveBeenCalled();
    expect(logger.since().records[0]).toMatchObject({
      ev: 'host.signal',
      lvl: 'info',
      data: { signal: 'SIGTERM' },
    });
  });

  it('kapanış sürerken gelen ikinci olay beklemeyi bırakıp 1 ile çıkar; stop tek kez çalışır', () => {
    const stop = vi.fn(() => new Promise<void>(() => undefined));
    const { target, exit } = setup(stop);
    target.emit('SIGINT');
    target.emit('SIGINT');
    expect(stop).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('kapanış hata verirse hatayı günlüğe yazar ve 1 ile çıkar', async () => {
    const { target, exit, logger } = setup(() => Promise.reject(new Error('kapanmadı')));
    target.emit('SIGTERM');
    await tick();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(
      logger.since().records.find((record) => record.ev === 'host.stop.failed')?.data,
    ).toMatchObject({
      message: 'kapanmadı',
    });
  });

  it('eşzamanlı fırlatan stop da hata sayılır', async () => {
    const { target, exit } = setup(() => {
      throw new Error('hemen');
    });
    target.emit('SIGTERM');
    await tick();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('yakalanmamış hata ve reddedilmiş söz önce düzgün kapanır, sonra 1 ile çıkar', async () => {
    for (const event of ['uncaughtException', 'unhandledRejection']) {
      const stop = vi.fn(() => Promise.resolve());
      const { target, exit, logger } = setup(stop);
      target.emit(event, new Error('patladı'));
      await tick();
      expect(stop).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledExactlyOnceWith(1);
      const crash = logger.since().records[0];
      expect(crash).toMatchObject({
        ev: 'host.crash',
        lvl: 'error',
        data: { event, message: 'patladı' },
      });
    }
  });

  it('kapanış graceMs içinde bitmezse zorla 1 ile çıkar', async () => {
    const { target, exit, logger } = setup(() => new Promise<void>(() => undefined), 20);
    target.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(logger.since().records.some((record) => record.ev === 'host.stop.timeout')).toBe(true);
  });

  it('kayıt kaldırılınca olaylar artık işlenmez', () => {
    const stop = vi.fn(() => Promise.resolve());
    const { target, remove } = setup(stop);
    remove();
    expect(target.eventNames()).toEqual([]);
    target.emit('SIGTERM');
    expect(stop).not.toHaveBeenCalled();
  });

  it('varsayılan hedef gerçek süreçtir ve kaldırma dinleyicileri geri alır', () => {
    const before = process.listenerCount('SIGTERM');
    const remove = installShutdown(() => Promise.resolve(), { exit: vi.fn() });
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
    remove();
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });
});

describe('süreç dinleyicileri', () => {
  it('sunucu kurmak process e Colyseus sinyal ve çökme dinleyicisi eklemez', async () => {
    const events = ['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection'] as const;
    const before = events.map((event) => process.listenerCount(event));
    const host = await start();
    expect(events.map((event) => process.listenerCount(event))).toEqual(before);
    await host.stop();
  });
});
