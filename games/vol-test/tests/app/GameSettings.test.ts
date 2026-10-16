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
      backdropDensity: BACKDROP.density.default,
    });
    expect(localStorage.getItem('synced.voltest.preferences')).toBeNull();
    next.dispose();
  });
  it('mevsim, hava ve arka plan yoğunluğu seçimleri kaydedilir; geçersiz değer eskisini korur', async () => {
    localStorage.clear();
    const settings = new GameSettings(store(), 'Linux');
    await settings.load();
    expect(settings.get()).toMatchObject({ season: 'auto', weather: 'auto' });
    await settings.update({ season: 'winter', weather: 'snow', backdropDensity: 7 });
    expect(settings.get()).toMatchObject({
      season: 'winter',
      weather: 'snow',
      backdropDensity: 7,
    });
    await settings.update({
      season: 'monsoon' as never,
      weather: 'fog' as never,
      backdropDensity: 99,
    });
    expect(settings.get()).toMatchObject({
      season: 'winter',
      weather: 'snow',
      backdropDensity: 7,
    });
    await settings.update({ season: 'auto', weather: 'auto', backdropDensity: 2 });
    expect(settings.get()).toMatchObject({ season: 'auto', weather: 'auto', backdropDensity: 2 });
    settings.dispose();
  });

  it('menü arka planı artık bir ayar değildir; yoğunluk her cihazda aynı varsayılanla açılır', async () => {
    for (const agent of ['Mozilla/5.0 (Linux; Android 16)', 'Linux']) {
      localStorage.clear();
      const settings = new GameSettings(store(), agent);
      await settings.load();
      expect(settings.get()).not.toHaveProperty('backdrop');
      expect(settings.get().backdropDensity).toBe(BACKDROP.density.default);
      settings.dispose();
    }
  });

  it('eski kayıttaki `backdrop` alanı yok sayılır ve tercihe sızmaz', async () => {
    localStorage.clear();
    const saves = store();
    await saves.save('device.voltest.preferences', { backdrop: false, backdropDensity: 4 });
    const settings = new GameSettings(saves, 'Linux');
    await settings.load();
    expect(settings.get()).not.toHaveProperty('backdrop');
    expect(settings.get().backdropDensity).toBe(4);
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
