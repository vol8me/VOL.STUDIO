import { describe, expect, it } from 'vitest';
import { LocalStorageAdapter, ScopedSaveManager } from '@volstudio/core';
import { GameSettings } from '@/app/GameSettings';

function store(): ScopedSaveManager {
  return new ScopedSaveManager({
    synced: new LocalStorageAdapter(),
    device: new LocalStorageAdapter(),
  });
}

describe('cihaz tercihleri', () => {
  it('ilk açılışı seçer, kalite/ses/titreşim/pencereyi sonraki açılışta korur', async () => {
    localStorage.clear();
    const settings = new GameSettings(store(), 'Android');
    await settings.load();
    expect(settings.get()).toMatchObject({
      quality: 'low',
      volume: 1,
      haptics: true,
      display: 'windowed',
      scenario: 'empty',
      seed: 731,
    });
    await settings.update({ quality: 'high', volume: 0.3, haptics: false, display: 'fullscreen' });
    await settings.flush();
    settings.dispose();
    const next = new GameSettings(store(), 'Android');
    await next.load();
    expect(next.get()).toEqual({
      quality: 'high',
      volume: 0.3,
      haptics: false,
      display: 'fullscreen',
      scenario: 'empty',
      seed: 731,
    });
    expect(localStorage.getItem('synced.voltest.preferences')).toBeNull();
    next.dispose();
  });
  it('bozuk kaydı doğrular ve eksik alanların cihaz varsayılanını kullanır', async () => {
    localStorage.clear();
    const saves = store();
    await saves.save('device.voltest.preferences', {
      quality: 'ultra',
      volume: 8,
      haptics: 'true',
      display: 'minimized',
    });
    const settings = new GameSettings(saves, 'Linux');
    await settings.load();
    expect(settings.get()).toEqual({
      quality: 'high',
      volume: 1,
      haptics: true,
      display: 'windowed',
      scenario: 'empty',
      seed: 731,
    });
    const changes: unknown[] = [];
    const off = settings.subscribe((value) => changes.push(value));
    await settings.update({ volume: 0, haptics: false });
    expect(changes).toHaveLength(1);
    off();
    await settings.flush();
    settings.dispose();
  });
});
