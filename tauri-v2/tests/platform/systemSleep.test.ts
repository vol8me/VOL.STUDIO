import { describe, expect, it, vi } from 'vitest';
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
    expect(web.invoke).not.toHaveBeenCalled();
  });
});
