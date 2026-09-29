import { beforeEach, describe, it, expect, vi } from 'vitest';
import { registerShutdownFlush } from '../../src/platform/shutdownFlush';
import type { ShutdownFlushProbe } from '../../src/platform/shutdownFlush';

const fakes = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(() => Promise.resolve()),
  listen: vi.fn((_event: string, handler: () => void) => {
    fakes.handlers.push(handler);
    return Promise.resolve(() => undefined);
  }),
  handlers: [] as Array<() => void>,
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: fakes.isTauri, invoke: fakes.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: fakes.listen }));

function probe(tauri: boolean): ShutdownFlushProbe & { fire: () => Promise<void> } {
  let handler: (() => void) | undefined;
  return {
    isTauri: () => tauri,
    listen: (_event, h) => {
      handler = h;
      return () => undefined;
    },
    invoke: () => Promise.resolve(),
    fire: async () => {
      handler?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('registerShutdownFlush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.invoke.mockReset();
    fakes.invoke.mockResolvedValue(undefined);
    fakes.handlers.length = 0;
    fakes.isTauri.mockReturnValue(false);
  });

  it('bütün kancalar bitmeden vol_flush_done göndermez ve geç kurulan dinleyiciyi temizler', async () => {
    const handlers: Array<() => void> = [];
    let finish: (() => void) | undefined;
    const unlisten = vi.fn();
    const listen = vi.fn((_event: string, callback: () => void) => {
      handlers.push(callback);
      return Promise.resolve(unlisten);
    });
    const p = { isTauri: () => true, listen, invoke: vi.fn(() => Promise.resolve()) };
    const stopFirst = registerShutdownFlush(() => undefined, p);
    const stopLast = registerShutdownFlush(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      p,
    );
    handlers.forEach((handler) => handler());
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(p.invoke).not.toHaveBeenCalled();
    finish?.();
    await vi.waitFor(() => expect(p.invoke).toHaveBeenCalledOnce());
    expect(listen).toHaveBeenCalledOnce();
    stopFirst();
    stopLast();
    expect(unlisten).toHaveBeenCalledOnce();
  });
  it('Tauri dışında dinleme kurulmaz, dönen kayıt silme güvenli no-op olur', () => {
    const p = probe(false);
    const stop = registerShutdownFlush(vi.fn(), p);
    expect(() => stop()).not.toThrow();
    expect(p.listen ?? fakes.listen).toBeDefined();
    expect(fakes.listen).not.toHaveBeenCalled();
  });

  it('varsayılan probla dinler ve kancalar bitince vol_flush_done gönderir', async () => {
    fakes.isTauri.mockReturnValue(true);
    const stop = registerShutdownFlush(() => undefined);
    await vi.waitFor(() => expect(fakes.handlers).toHaveLength(1));
    fakes.handlers[0]();
    await vi.waitFor(() => expect(fakes.invoke).toHaveBeenCalledWith('vol_flush_done'));
    stop();
  });

  it('vol_flush_done reddedilirse kapanış sessizce sürer', async () => {
    fakes.isTauri.mockReturnValue(true);
    fakes.invoke.mockRejectedValue(new Error('izleyici yok'));
    const stop = registerShutdownFlush(() => undefined);
    await vi.waitFor(() => expect(fakes.handlers).toHaveLength(1));
    fakes.handlers[0]();
    await vi.waitFor(() => expect(fakes.invoke).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
  });

  it('dinleyici kurulamazsa kayıt sessizce pas kalır', async () => {
    const listen = vi.fn(() => Promise.reject(new Error('eklenti yok')));
    registerShutdownFlush(vi.fn(), {
      isTauri: () => true,
      listen,
      invoke: vi.fn(() => Promise.resolve()),
    });
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('vol:terminate gelince kancayi calistirip vol_flush_done bildirir', async () => {
    let handler: (() => void) | undefined;
    const p: ShutdownFlushProbe = {
      isTauri: () => true,
      listen: (_e, h) => {
        handler = h;
        return () => undefined;
      },
      invoke: vi.fn(() => Promise.resolve()),
    };
    const hook = vi.fn(() => Promise.resolve());
    registerShutdownFlush(hook, p);
    handler?.();
    await vi.waitFor(() => expect(hook).toHaveBeenCalled());
    await vi.waitFor(() => expect(p.invoke).toHaveBeenCalledWith('vol_flush_done'));
  });

  it('kanca firlatsa bile vol_flush_done yine bildirilir', async () => {
    let handler: (() => void) | undefined;
    const p: ShutdownFlushProbe = {
      isTauri: () => true,
      listen: (_e, h) => {
        handler = h;
        return () => undefined;
      },
      invoke: vi.fn(() => Promise.resolve()),
    };
    registerShutdownFlush(() => Promise.reject(new Error('kayit hatasi')), p);
    handler?.();
    await vi.waitFor(() => expect(p.invoke).toHaveBeenCalledWith('vol_flush_done'));
  });
});
