import { describe, expect, it } from 'vitest';
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
