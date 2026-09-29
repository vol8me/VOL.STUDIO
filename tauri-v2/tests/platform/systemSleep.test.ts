import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(() => Promise.resolve()),
  handlers: new Map<string, () => void>(),
  listen: vi.fn((event: string, handler: () => void) => {
    fakes.handlers.set(event, handler);
    return Promise.resolve(() => undefined);
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: fakes.isTauri, invoke: fakes.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: fakes.listen }));
import { onSystemResume, registerSuspendFlush } from '../../src/platform/systemSleep';
import type { SystemSleepProbe } from '../../src/platform/systemSleep';

function fakeProbe(tauri = true) {
  const handlers = new Map<string, () => void>();
  const unlisten = vi.fn();
  const invoke = vi.fn(() => Promise.resolve());
  const probe: SystemSleepProbe = {
    isTauri: () => tauri,
    listen: (event, handler) => {
      handlers.set(event, handler);
      return unlisten;
    },
    invoke,
  };
  const emit = (event: string) => handlers.get(event)?.();
  return { probe, emit, invoke, unlisten };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('systemSleep', () => {
  it('her uyku turunda bütün kancalar bitince tek onay gönderir', async () => {
    const { probe, emit, invoke } = fakeProbe();
    let release!: () => void;
    const slow = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const fast = vi.fn();
    registerSuspendFlush(slow, probe);
    registerSuspendFlush(fast, probe);

    emit('vol:suspending');
    await settle();
    expect(invoke).not.toHaveBeenCalled();
    release();
    await settle();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('vol_suspend_ready');

    emit('vol:suspending');
    await settle();
    expect(slow).toHaveBeenCalledTimes(2);
  });

  it('kanca fırlatsa da onay gider; uyanış dinleyicilere ulaşır', async () => {
    const { probe, emit, invoke } = fakeProbe();
    registerSuspendFlush(() => {
      throw new Error('disk');
    }, probe);
    const resumed = vi.fn();
    onSystemResume(resumed, probe);
    emit('vol:suspending');
    await settle();
    expect(invoke).toHaveBeenCalledWith('vol_suspend_ready');
    emit('vol:resumed');
    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it('son kayıt silinince dinleme kapanır; tarayıcıda hiçbir şey kurulmaz', async () => {
    const { probe, unlisten } = fakeProbe();
    const stopSuspend = registerSuspendFlush(() => undefined, probe);
    const stopResume = onSystemResume(() => undefined, probe);
    await settle();
    stopSuspend();
    expect(unlisten).not.toHaveBeenCalled();
    stopResume();
    expect(unlisten).toHaveBeenCalledTimes(2);

    const web = fakeProbe(false);
    registerSuspendFlush(() => undefined, web.probe)();
    onSystemResume(() => undefined, web.probe)();
    expect(web.invoke).not.toHaveBeenCalled();
  });

  it('varsayılan prob Tauri olay ve komut API’sini kullanır', async () => {
    const stop = registerSuspendFlush(() => undefined);
    await settle();
    fakes.handlers.get('vol:suspending')?.();
    await settle();
    expect(fakes.invoke).toHaveBeenCalledWith('vol_suspend_ready');
    stop();
  });

  it('kayıt silindikten sonra çözülen abonelik hemen bırakılır', async () => {
    let resolveListen!: (unlisten: () => void) => void;
    const unlisten = vi.fn();
    const probe: SystemSleepProbe = {
      isTauri: () => true,
      listen: () => new Promise((resolve) => (resolveListen = resolve)),
      invoke: () => Promise.resolve(),
    };
    const stop = registerSuspendFlush(() => undefined, probe);
    stop();
    resolveListen(unlisten);
    await settle();
    expect(unlisten).toHaveBeenCalled();
  });

  it('onay komutu reddedilirse işlenmemiş ret kalmaz', async () => {
    const { probe, emit } = fakeProbe();
    registerSuspendFlush(() => undefined, {
      ...probe,
      invoke: () => Promise.reject(new Error('kabuk yok')),
    });
    emit('vol:suspending');
    await settle();
  });

  it('dinleme kurulamazsa kayıt yine çalışır, hata yutulur', async () => {
    const stop = registerSuspendFlush(() => undefined, {
      isTauri: () => true,
      listen: () => Promise.reject(new Error('olay yok')),
      invoke: () => Promise.resolve(),
    });
    await settle();
    stop();
  });
});
