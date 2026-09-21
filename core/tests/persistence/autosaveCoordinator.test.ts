import { describe, expect, it, vi } from 'vitest';
import { AutosaveCoordinator } from '../../src/persistence/AutosaveCoordinator';

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('AutosaveCoordinator', () => {
  it('interval ve arka plan sinyalinde güncel değeri kaydeder', async () => {
    vi.useFakeTimers();
    let value = 1;
    let visibilityListener: ((state: 'foreground' | 'background') => void) | undefined;
    const save = vi.fn(() => Promise.resolve());
    const coordinator = new AutosaveCoordinator({
      capture: () => value,
      save,
      intervalMs: 100,
      observeVisibility: (listener) => {
        visibilityListener = listener;
        return vi.fn();
      },
    });

    value = 2;
    await vi.advanceTimersByTimeAsync(100);
    value = 3;
    visibilityListener?.('background');
    await coordinator.flush();

    expect(save).toHaveBeenCalledWith(2);
    expect(save).toHaveBeenLastCalledWith(3);
    coordinator.stop();
    vi.useRealTimers();
  });

  it('eşzamanlı yazıları yarıştırmaz ve bekleyenlerde son değer kazanır', async () => {
    const first = deferred();
    const writes: number[] = [];
    let value = 1;
    const coordinator = new AutosaveCoordinator({
      capture: () => value,
      save: async (snapshot) => {
        writes.push(snapshot);
        if (snapshot === 1) await first.promise;
      },
      observeVisibility: () => () => undefined,
    });

    coordinator.requestSave();
    value = 2;
    coordinator.requestSave();
    value = 3;
    const flushed = coordinator.flush();
    await Promise.resolve();
    expect(writes).toEqual([1]);

    first.resolve();
    await flushed;
    expect(writes).toEqual([1, 3]);
    coordinator.stop();
  });

  it('flushAndDispose son değerin gerçekten yazılmasını bekler ve kaynakları kapatır', async () => {
    const write = deferred();
    const unsubscribe = vi.fn();
    const save = vi.fn(() => write.promise);
    let value = 7;
    const coordinator = new AutosaveCoordinator({
      capture: () => value,
      save,
      observeVisibility: () => unsubscribe,
    });

    value = 9;
    const closing = coordinator.flushAndDispose();
    await Promise.resolve();
    expect(save).toHaveBeenCalledWith(9);
    expect(unsubscribe).toHaveBeenCalledOnce();
    write.resolve();
    await closing;
    await expect(coordinator.flush()).rejects.toThrow(/Durdurulmuş/);
  });

  it('capture ve save hatalarını bildirir; flush hatayı çağırana taşır', async () => {
    const onError = vi.fn();
    const captureError = new Error('capture');
    const brokenCapture = new AutosaveCoordinator<number>({
      capture: () => {
        throw captureError;
      },
      save: vi.fn(),
      onError,
      observeVisibility: () => () => undefined,
    });
    await expect(brokenCapture.flush()).rejects.toThrow(/anlık görüntüsü/);
    expect(onError).toHaveBeenCalledWith(captureError);
    brokenCapture.stop();

    const saveError = new Error('disk');
    const brokenSave = new AutosaveCoordinator({
      capture: () => 1,
      save: () => Promise.reject(saveError),
      onError,
      observeVisibility: () => () => undefined,
    });
    await expect(brokenSave.flush()).rejects.toBe(saveError);
    expect(onError).toHaveBeenCalledWith(saveError);
    brokenSave.stop();
  });

  it('null generic statei geçerli snapshot olarak kaydeder', async () => {
    const save = vi.fn(() => Promise.resolve());
    const coordinator = new AutosaveCoordinator<null>({
      capture: () => null,
      save,
      observeVisibility: () => () => undefined,
    });

    await coordinator.flush();

    expect(save).toHaveBeenCalledWith(null);
    coordinator.stop();
  });

  it('geçersiz interval ve observer kurulum hatasında yarım kaynak bırakmaz', () => {
    expect(
      () =>
        new AutosaveCoordinator({
          capture: () => 1,
          save: () => Promise.resolve(),
          intervalMs: 0,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new AutosaveCoordinator({
          capture: () => 1,
          save: () => Promise.resolve(),
          observeVisibility: () => {
            throw new Error('observer');
          },
        }),
    ).toThrow('observer');
  });
});
