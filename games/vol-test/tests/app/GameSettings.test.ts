import { describe, expect, it } from 'vitest';
import { LocalStorageAdapter, ScopedSaveManager } from '@volstudio/core';
import { GameSettings } from '@/app/GameSettings';
import { BACKDROP } from '@/config/backdrop';

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
      grid: true,
      display: 'windowed',
      scenario: 'empty',
      seed: 731,
      chaos: 1,
      playerName: '',
      vehicle: 'striker',
      faction: -1,
      language: 'auto',
    });
    await settings.update({
      chaos: 2.5,
      quality: 'high',
      volume: 0.3,
      haptics: false,
      display: 'fullscreen',
      playerName: '  Kaptan   Ada ',
      vehicle: 'bulwark',
      faction: 1,
      language: 'en',
    });
    await settings.flush();
    settings.dispose();
    const next = new GameSettings(store(), 'Android');
    await next.load();
    expect(next.get()).toEqual({
      quality: 'high',
      volume: 0.3,
      haptics: false,
      grid: true,
      display: 'fullscreen',
      scenario: 'empty',
      seed: 731,
      chaos: 2.5,
      playerName: 'Kaptan Ada',
      vehicle: 'bulwark',
      faction: 1,
      language: 'en',
      season: 'auto',
      weather: 'auto',
      backdrop: false,
      backdropDensity: BACKDROP.density.default,
    });
    expect(localStorage.getItem('synced.voltest.preferences')).toBeNull();
    next.dispose();
  });
  it('mevsim, hava, arka plan ve yoğunluk seçimleri kaydedilir; geçersiz değer eskisini korur', async () => {
    localStorage.clear();
    const settings = new GameSettings(store(), 'Linux');
    await settings.load();
    expect(settings.get()).toMatchObject({ backdrop: true, season: 'auto', weather: 'auto' });
    await settings.update({
      season: 'winter',
      weather: 'snow',
      backdrop: false,
      backdropDensity: 7,
    });
    expect(settings.get()).toMatchObject({
      season: 'winter',
      weather: 'snow',
      backdrop: false,
      backdropDensity: 7,
    });
    await settings.update({
      season: 'monsoon' as never,
      weather: 'fog' as never,
      backdrop: 'yes' as never,
      backdropDensity: 99,
    });
    expect(settings.get()).toMatchObject({
      season: 'winter',
      weather: 'snow',
      backdrop: false,
      backdropDensity: 7,
    });
    await settings.update({ season: 'auto', weather: 'auto', backdropDensity: 2 });
    expect(settings.get()).toMatchObject({ season: 'auto', weather: 'auto', backdropDensity: 2 });
    settings.dispose();
  });

  it('düşük kalite varsayılanı canlı menü arka planını kapalı açar', async () => {
    localStorage.clear();
    const settings = new GameSettings(store(), 'Mozilla/5.0 (Linux; Android 16)');
    await settings.load();
    expect(settings.get().backdrop).toBe(false);
    settings.dispose();
  });

  it('bozuk kaydı doğrular ve eksik alanların cihaz varsayılanını kullanır', async () => {
    localStorage.clear();
    const saves = store();
    await saves.save('device.voltest.preferences', {
      quality: 'ultra',
      volume: 8,
      haptics: 'true',
      display: 'minimized',
      playerName: 42,
      vehicle: 'hovercraft',
      faction: 7,
      language: 'de',
    });
    const settings = new GameSettings(saves, 'Linux');
    await settings.load();
    expect(settings.get()).toEqual({
      quality: 'high',
      volume: 1,
      haptics: true,
      grid: true,
      display: 'windowed',
      scenario: 'empty',
      seed: 731,
      chaos: 1,
      playerName: '',
      vehicle: 'striker',
      faction: -1,
      language: 'auto',
      season: 'auto',
      weather: 'auto',
      backdrop: true,
      backdropDensity: BACKDROP.density.default,
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
