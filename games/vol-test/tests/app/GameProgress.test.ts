import { describe, expect, it, vi } from 'vitest';
import { LocalStorageAdapter, ScopedSaveManager } from '@volstudio/core';
import { GameProgress } from '@/app/GameProgress';

describe('GameProgress', () => {
  it('mesafe ve atışı ilerleme kapsamına yazar, yeniden açılışta okur', async () => {
    localStorage.clear();
    const store = new ScopedSaveManager({
      device: new LocalStorageAdapter(),
      synced: new LocalStorageAdapter(),
    });
    const progress = new GameProgress(store);
    await progress.load();
    progress.travel(5);
    progress.travel(7);
    progress.fired();
    await progress.flush();
    progress.dispose();
    const next = new GameProgress(store);
    await next.load();
    expect(next.get()).toEqual({ distance: 12, shots: 1 });
    expect(localStorage.getItem('device.voltest.progress')).toBeNull();
    next.dispose();
  });
  it('bozuk kayıt ve sonlu olmayan artışlar ilerlemeyi zehirlemez', async () => {
    localStorage.clear();
    const store = new ScopedSaveManager({
      device: new LocalStorageAdapter(),
      synced: new LocalStorageAdapter(),
    });
    await store.save('synced.voltest.progress', { distance: -8, shots: '2' });
    const progress = new GameProgress(store);
    await progress.load();
    progress.travel(NaN);
    progress.travel(-1);
    expect(progress.get()).toEqual({ distance: 0, shots: 0 });
    progress.dispose();
  });
});

function deferredLoad() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function delayedStore(loads: ReturnType<typeof deferredLoad>[]) {
  let index = 0;
  return new ScopedSaveManager({
    device: new LocalStorageAdapter(),
    synced: {
      get: async <T>() => (await loads[index++].promise) as T,
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    },
  });
}

describe('GameProgress yükleme ömrü', () => {
  it('dispose sonrası geç yükleme state ve timer kurmaz', async () => {
    vi.useFakeTimers();
    const pending = deferredLoad();
    const progress = new GameProgress(delayedStore([pending]));
    const loading = progress.load();
    progress.dispose();
    progress.dispose();
    pending.resolve({ distance: 8, shots: 3 });
    await loading;
    expect(progress.get()).toEqual({ distance: 0, shots: 0 });
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('ters sırada dönen yüklemeler yalnız en yeni state ve tek timer bırakır', async () => {
    vi.useFakeTimers();
    const first = deferredLoad();
    const second = deferredLoad();
    const progress = new GameProgress(delayedStore([first, second]));
    const older = progress.load();
    const newer = progress.load();
    second.resolve({ distance: 12, shots: 2 });
    await newer;
    first.resolve({ distance: 4, shots: 1 });
    await older;
    expect(progress.get()).toEqual({ distance: 12, shots: 2 });
    expect(vi.getTimerCount()).toBe(1);
    progress.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('tekrarlı yükleme eski coordinator kaynaklarını kapatır', async () => {
    vi.useFakeTimers();
    const loads = [deferredLoad(), deferredLoad()];
    const progress = new GameProgress(delayedStore(loads));
    for (const pending of loads) {
      const loading = progress.load();
      pending.resolve({ distance: 5, shots: 1 });
      await loading;
    }
    expect(vi.getTimerCount()).toBe(1);
    progress.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});

it('dispose sonrası yeni yükleme depoya erişmeden reddedilir', async () => {
  const pending = deferredLoad();
  const progress = new GameProgress(delayedStore([pending]));
  progress.dispose();
  pending.resolve({ distance: 8, shots: 3 });
  await expect(progress.load()).rejects.toThrow(Error);
});

it('geç reddedilen yükleme dispose sonrası kaynağı yeniden kurmaz', async () => {
  vi.useFakeTimers();
  const pending = deferredLoad();
  const progress = new GameProgress(delayedStore([pending]));
  const failure = new Error('yükleme');
  const loading = expect(progress.load()).rejects.toBe(failure);
  progress.dispose();
  pending.reject(failure);
  await loading;
  expect(progress.get()).toEqual({ distance: 0, shots: 0 });
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it('yeni yükleme reddedilince eski geç başarı state ve kaynak kurmaz', async () => {
  vi.useFakeTimers();
  const first = deferredLoad();
  const second = deferredLoad();
  const progress = new GameProgress(delayedStore([first, second]));
  const older = progress.load();
  const failure = new Error('yeni yükleme');
  const newer = expect(progress.load()).rejects.toBe(failure);
  second.reject(failure);
  await newer;
  first.resolve({ distance: 99, shots: 8 });
  await older;
  expect(progress.get()).toEqual({ distance: 0, shots: 0 });
  expect(vi.getTimerCount()).toBe(0);
  progress.dispose();
  vi.useRealTimers();
});
