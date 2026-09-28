import { describe, it, expect, vi } from 'vitest';
import { registerShutdownFlush } from '../../src/platform/shutdownFlush';
import type { ShutdownFlushProbe } from '../../src/platform/shutdownFlush';

const fakes = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => undefined)),
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
  it('bütün kancalar bitmeden flush_done göndermez ve geç kurulan dinleyiciyi temizler', async () => {
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
  it('Tauri dışında dinleme kurulmaz', () => {
    const p = probe(false);
    registerShutdownFlush(vi.fn(), p);
    expect(p.listen ?? fakes.listen).toBeDefined();
    expect(fakes.listen).not.toHaveBeenCalled();
  });

  it('vol:terminate gelince kancayi calistirip flush_done bildirir', async () => {
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
    await vi.waitFor(() =>
      expect(p.invoke).toHaveBeenCalledWith('plugin:vol-diagnostics|flush_done'),
    );
  });

  it('kanca firlatsa bile flush_done yine bildirilir', async () => {
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
    await vi.waitFor(() =>
      expect(p.invoke).toHaveBeenCalledWith('plugin:vol-diagnostics|flush_done'),
    );
  });
});
