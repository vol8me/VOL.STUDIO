import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerShutdownFlush, type ShutdownFlushProbe } from '../../src/platform/shutdownFlush';

type Request = { requestId: string; reason: 'close' | 'signal' };
type Handler = (event: { payload: Request }) => void;
const fakes = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(() => Promise.resolve()),
  listen: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: fakes.isTauri, invoke: fakes.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: fakes.listen }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onCloseRequested: () => Promise.resolve(() => undefined) }),
}));
function fakeProbe(tauri = true) {
  let terminate: Handler | undefined;
  let close: ((event: { preventDefault(): void }) => void) | undefined;
  const unlisten = vi.fn();
  const invoke = vi.fn(() => Promise.resolve());
  const onError = vi.fn();
  const probe: ShutdownFlushProbe = {
    isTauri: () => tauri,
    listen: (_event, handler) => {
      terminate = handler;
      return unlisten;
    },
    onCloseRequested: (handler) => {
      close = handler;
      return unlisten;
    },
    invoke,
    onError,
  };
  return {
    probe,
    invoke,
    onError,
    unlisten,
    terminate: (request: Request = { requestId: 'shutdown-1', reason: 'signal' }) =>
      terminate?.({ payload: request }),
    close: (event: { preventDefault(): void }) => close?.(event),
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => vi.clearAllMocks());
describe('registerShutdownFlush', () => {
  it('kapanış native süre sınırını kancalar başlamadan ister ve yinelenen olayı birleştirir', async () => {
    const p = fakeProbe();
    const hook = vi.fn(() => new Promise<void>(() => undefined));
    const stop = registerShutdownFlush(hook, p.probe);
    const preventDefault = vi.fn();
    p.close({ preventDefault });
    p.close({ preventDefault });
    await settle();
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(p.invoke).toHaveBeenCalledExactlyOnceWith('exit_application');
    expect(hook).not.toHaveBeenCalled();
    p.terminate({ requestId: 'shutdown-1', reason: 'close' });
    p.terminate({ requestId: 'shutdown-1', reason: 'close' });
    await settle();
    expect(hook).toHaveBeenCalledOnce();
    expect(p.invoke).toHaveBeenCalledOnce();
    stop();
  });
  it('bütün kancaları bekler, hata olsa da diğerlerini çalıştırır ve dürüst sonuç onaylar', async () => {
    const p = fakeProbe();
    let finish!: () => void;
    const error = new Error('disk');
    const stopFirst = registerShutdownFlush(() => {
      throw error;
    }, p.probe);
    const stopLast = registerShutdownFlush(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      p.probe,
    );
    p.terminate();
    p.terminate();
    await settle();
    expect(p.invoke).not.toHaveBeenCalled();
    finish();
    await settle();
    expect(p.invoke).toHaveBeenCalledExactlyOnceWith('vol_flush_done', {
      requestId: 'shutdown-1',
      reason: 'signal',
      outcome: 'failed',
    });
    expect(p.onError).toHaveBeenCalled();
    stopFirst();
    stopLast();
    expect(p.unlisten).toHaveBeenCalledTimes(2);
  });
  it('başarılı sonuç requestId ve reason ile aynı turu onaylar', async () => {
    const p = fakeProbe();
    const stop = registerShutdownFlush(() => undefined, p.probe);
    p.terminate();
    await settle();
    expect(p.invoke).toHaveBeenCalledExactlyOnceWith('vol_flush_done', {
      requestId: 'shutdown-1',
      reason: 'signal',
      outcome: 'success',
    });
    stop();
  });
  it('kayıt silindikten sonra çözülen tüm dinleyicileri bırakır', async () => {
    const pending: Array<(unlisten: () => void) => void> = [];
    const unlisten = vi.fn();
    const p = fakeProbe();
    const stop = registerShutdownFlush(() => undefined, {
      ...p.probe,
      listen: () => new Promise((resolve) => pending.push(resolve)),
      onCloseRequested: () => new Promise((resolve) => pending.push(resolve)),
    });
    stop();
    pending.forEach((resolve) => resolve(unlisten));
    await settle();
    expect(unlisten).toHaveBeenCalledTimes(2);
  });
  it('dinleme ve onay reddi görünür hata üretir; pencere dinlemesi kurulmaya devam eder', async () => {
    const p = fakeProbe();
    const error = new Error('olay yok');
    const stop = registerShutdownFlush(() => undefined, {
      ...p.probe,
      listen: () => Promise.reject(error),
    });
    await settle();
    expect(p.onError).toHaveBeenCalledWith(error);
    p.close({ preventDefault: vi.fn() });
    await settle();
    expect(p.invoke).toHaveBeenCalledWith('exit_application');
    stop();
    const q = fakeProbe();
    const ackError = new Error('onay yok');
    q.invoke.mockRejectedValue(ackError);
    const remove = registerShutdownFlush(() => undefined, q.probe);
    q.terminate();
    await settle();
    expect(q.onError).toHaveBeenCalledWith(ackError);
    remove();
  });
  it('native kapanış isteği reddedilirse hatayı raporlar', async () => {
    const p = fakeProbe();
    const error = new Error('çıkış komutu');
    p.invoke.mockRejectedValue(error);
    const stop = registerShutdownFlush(() => undefined, p.probe);
    p.close({ preventDefault: vi.fn() });
    await settle();
    expect(p.onError).toHaveBeenCalledWith(error);
    stop();
  });
  it('Tauri dışında dinleyici kurmaz', () => {
    const p = fakeProbe(false);
    registerShutdownFlush(vi.fn(), p.probe)();
    expect(p.unlisten).not.toHaveBeenCalled();
    expect(p.invoke).not.toHaveBeenCalled();
  });
  it('varsayılan köprü Tauri payload ve komut argümanlarını korur', async () => {
    fakes.isTauri.mockReturnValue(true);
    let handler!: Handler;
    fakes.listen.mockImplementation((_event, callback: Handler) => {
      handler = callback;
      return Promise.resolve(() => undefined);
    });
    const stop = registerShutdownFlush(() => undefined);
    handler({ payload: { requestId: 'shutdown-1', reason: 'signal' } });
    await settle();
    expect(fakes.invoke).toHaveBeenCalledWith('vol_flush_done', {
      requestId: 'shutdown-1',
      reason: 'signal',
      outcome: 'success',
    });
    stop();
  });
});
