import { describe, expect, it } from 'vitest';
import { LocalStorageAdapter, ScopedSaveManager } from '@volstudio/core';
import { ControlSettings } from '@/app/ControlSettings';

function store() {
  const storage = new LocalStorageAdapter();
  return new ScopedSaveManager({ synced: storage, device: storage });
}

describe('ControlSettings', () => {
  it('varsayılan elle nişandır; otomatik nişan cihaz kapsamında yeniden yüklenir', async () => {
    localStorage.clear();
    const manager = store();
    const settings = new ControlSettings(manager);
    expect(settings.isAutoAimEnabled()).toBe(false);
    await settings.setAutoAimEnabled(true);
    await settings.flush();
    const reloaded = new ControlSettings(manager);
    await reloaded.load();
    expect(reloaded.isAutoAimEnabled()).toBe(true);
    expect(await manager.load('device.vol-hell:control-settings', null)).toEqual({ autoAim: true });
    expect(await manager.load('synced.vol-hell:control-settings', null)).toBeNull();
    settings.dispose();
    reloaded.dispose();
  });

  it('bozuk kayıt otomatik nişanı kendiliğinden açmaz', async () => {
    localStorage.clear();
    const manager = store();
    await manager.save('device.vol-hell:control-settings', { autoAim: 'true' });
    const settings = new ControlSettings(manager);
    await settings.load();
    expect(settings.isAutoAimEnabled()).toBe(false);
    settings.dispose();
  });

  it('değişiklik canlı bildirilir; abonelik bırakılınca bildirim kesilir', async () => {
    localStorage.clear();
    const settings = new ControlSettings(store());
    const observed: boolean[] = [];
    const stop = settings.onChange((data) => observed.push(data.autoAim));
    await settings.setAutoAimEnabled(true);
    stop();
    await settings.setAutoAimEnabled(false);
    expect(observed).toEqual([true]);
    settings.dispose();
  });
});
