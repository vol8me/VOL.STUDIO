import { describe, expect, it, vi } from 'vitest';
import {
  onSystemResume,
  registerSuspendFlush,
  type SystemSleepProbe,
} from '../../src/platform/systemSleep';

const fakes = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(() => Promise.resolve()),
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  listen: vi.fn((event: string, handler: (event: { payload: unknown }) => void) => {
    fakes.handlers.set(event, handler);
    return Promise.resolve(() => undefined);
  }),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: fakes.isTauri, invoke: fakes.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: fakes.listen }));

type Request = { requestId: string; reason: 'suspend' };
type Handler = (event: { payload: unknown }) => void;
function fakeProbe(tauri = true) {
  const handlers = new Map<string, Handler>();
  const unlisten = vi.fn();
  const invoke = vi.fn(() => Promise.resolve());
  const onError = vi.fn();
  const probe: SystemSleepProbe = {
    isTauri: () => tauri,
    listen: (event, handler) => {
      handlers.set(event, handler);
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
    emit: (event: string, payload: unknown = undefined) => handlers.get(event)?.({ payload }),
    suspend: (requestId: string) =>
      handlers.get('vol:suspending')?.({
        payload: { requestId, reason: 'suspend' } satisfies Request,
      }),
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
describe('systemSleep', () => {
  it('varsayılan köprü uyku isteğinin packet alanlarını onay komutuna taşır', async () => {
    const stop = registerSuspendFlush(() => undefined);
    fakes.handlers.get('vol:suspending')?.({
      payload: { requestId: 'suspend-1', reason: 'suspend' },
    });
    await settle();
    expect(fakes.invoke).toHaveBeenCalledWith('vol_suspend_ready', {
      requestId: 'suspend-1',
      reason: 'suspend',
      outcome: 'success',
    });
    stop();
  });
  it('hızlı ikinci uyku turu eski kanca sonucunu yeni onaya dönüştürmez ve tekrar olayı birleştirir', async () => {
    const p = fakeProbe();
    const finish: Array<() => void> = [];
    const hook = vi.fn(() => new Promise<void>((resolve) => finish.push(resolve)));
    const stop = registerSuspendFlush(hook, p.probe);
    p.suspend('suspend-1');
    p.suspend('suspend-1');
    await settle();
    expect(hook).toHaveBeenCalledOnce();
    p.emit('vol:resumed');
    p.suspend('suspend-2');
    await settle();
    expect(hook).toHaveBeenCalledTimes(2);
    p.suspend('suspend-1');
    await settle();
    expect(hook).toHaveBeenCalledTimes(2);
    finish[0]();
    await settle();
    expect(p.invoke).not.toHaveBeenCalled();
    finish[1]();
    await settle();
    expect(p.invoke).toHaveBeenCalledExactlyOnceWith('vol_suspend_ready', {
      requestId: 'suspend-2',
      reason: 'suspend',
      outcome: 'success',
    });
    p.suspend('suspend-2');
    await settle();
    expect(hook).toHaveBeenCalledTimes(2);
    stop();
  });
  it('bir kanca fırlatsa da geciken diğer kanca tamamlanmadan onaylamaz', async () => {
    const p = fakeProbe();
    let finish!: () => void;
    const stop = registerSuspendFlush(() => {
      throw new Error('disk');
    }, p.probe);
    const stopLast = registerSuspendFlush(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      p.probe,
    );
    p.suspend('suspend-1');
    await settle();
    expect(p.invoke).not.toHaveBeenCalled();
    finish();
    await settle();
    expect(p.invoke).toHaveBeenCalledExactlyOnceWith('vol_suspend_ready', {
      requestId: 'suspend-1',
      reason: 'suspend',
      outcome: 'failed',
    });
    expect(p.onError).toHaveBeenCalled();
    stop();
    stopLast();
  });
  it('uyanış dinleyici hatası diğer dinleyicileri engellemez', () => {
    const p = fakeProbe();
    const error = new Error('ses');
    const first = onSystemResume(() => {
      throw error;
    }, p.probe);
    const listener = vi.fn();
    const last = onSystemResume(listener, p.probe);
    p.emit('vol:resumed');
    expect(listener).toHaveBeenCalledOnce();
    expect(p.onError).toHaveBeenCalledWith(error);
    first();
    last();
  });
  it('son kayıt kaldırıldıktan sonra çözülen bütün abonelikleri bırakır', async () => {
    const p = fakeProbe();
    const pending: Array<(unlisten: () => void) => void> = [];
    const stop = registerSuspendFlush(() => undefined, {
      ...p.probe,
      listen: () => new Promise((resolve) => pending.push(resolve)),
    });
    stop();
    pending.forEach((resolve) => resolve(p.unlisten));
    await settle();
    expect(p.unlisten).toHaveBeenCalledTimes(3);
  });
  it('dinleme kurulum hatalarını ve native uyku izleyici hatasını görünür kılar', async () => {
    const p = fakeProbe();
    const error = new Error('dinleme');
    const stop = registerSuspendFlush(() => undefined, {
      ...p.probe,
      listen: (event, handler) =>
        event === 'vol:suspending' ? Promise.reject(error) : p.probe.listen(event, handler),
    });
    await settle();
    expect(p.onError).toHaveBeenCalledWith(error);
    p.emit('vol:sleep-error', { operation: 'inhibit', error: 'logind kapalı' });
    expect(p.onError).toHaveBeenCalledWith({ operation: 'inhibit', error: 'logind kapalı' });
    stop();
  });
  it('onay komutunun reddini raporlar', async () => {
    const p = fakeProbe();
    const error = new Error('kabuk yok');
    p.invoke.mockRejectedValue(error);
    const stop = registerSuspendFlush(() => undefined, p.probe);
    p.suspend('suspend-1');
    await settle();
    expect(p.onError).toHaveBeenCalledWith(error);
    stop();
  });
  it('Tauri dışında kayıt kurmaz', () => {
    const p = fakeProbe(false);
    registerSuspendFlush(vi.fn(), p.probe)();
    onSystemResume(vi.fn(), p.probe)();
    expect(p.unlisten).not.toHaveBeenCalled();
  });
});
