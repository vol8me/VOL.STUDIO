import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '@volstudio/core/i18n';
import { LocalStorageAdapter, ScopedSaveManager } from '@volstudio/core';
import { GameSettings } from '@/app/GameSettings';
import { BACKDROP } from '@/config/backdrop';
import { VEHICLE_IDS } from '@/config/vehicles';
import { DevScreen } from '@/menu/DevScreen';

const cleanups: Array<() => void> = [];

async function mount() {
  localStorage.clear();
  const settings = new GameSettings(
    new ScopedSaveManager({ synced: new LocalStorageAdapter(), device: new LocalStorageAdapter() }),
    'Linux',
  );
  await settings.load();
  const onBack = vi.fn();
  const screen = new DevScreen({ settings, onBack });
  document.body.append(screen.element);
  cleanups.push(() => {
    screen.destroy();
    settings.dispose();
  });
  const find = <T extends HTMLElement = HTMLElement>(id: string): T =>
    document.body.querySelector<T>(`[data-testid="${id}"]`)!;
  /** Açılır listeyi açar ve etiketi verilen seçeneğe basar. */
  const pick = (id: string, label: string): void => {
    find(id).click();
    const option = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (candidate) => candidate.textContent === label,
    );
    expect(option, `${label} seçeneği`).toBeDefined();
    option!.click();
  };
  return { screen, settings, onBack, find, pick };
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
  await i18next.changeLanguage('tr');
});

describe('DevScreen', () => {
  it('dünya ve alıştırma bölümlerini sırayla taşır', async () => {
    const { screen, find } = await mount();
    const headings = [...screen.element.querySelectorAll('h2')].map((node) => node.textContent);
    expect(headings).toEqual([i18next.t('voltest:dev.world'), i18next.t('voltest:dev.practice')]);
    for (const id of [
      'dev-season',
      'dev-weather',
      'dev-vehicle',
      'dev-density',
      'dev-scenario',
      'dev-seed',
      'dev-chaos',
    ])
      expect(find(id), id).not.toBeNull();
    expect(screen.element.dataset.testid).toBe('dev');
  });

  it('mevsim ve hava seçimi tercihe anında yazılır', async () => {
    const { settings, pick } = await mount();
    pick('dev-season', i18next.t('voltest:dev.seasonOption.winter'));
    await vi.waitFor(() => expect(settings.get().season).toBe('winter'));
    pick('dev-weather', i18next.t('voltest:dev.weatherOption.rain'));
    await vi.waitFor(() => expect(settings.get().weather).toBe('rain'));
    pick('dev-season', i18next.t('voltest:dev.seasonOption.auto'));
    await vi.waitFor(() => expect(settings.get().season).toBe('auto'));
  });

  it('her araç seçilebilir; seçim tercihe yazılır', async () => {
    const { settings, pick, find } = await mount();
    find('dev-vehicle').click();
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(VEHICLE_IDS.length);
    document.body.click();
    pick('dev-vehicle', i18next.t('voltest:garage.vehicles.rhino.name'));
    await vi.waitFor(() => expect(settings.get().vehicle).toBe('rhino'));
  });

  it('savaş yoğunluğu kaydırıcısı aralıkta kalır ve tercihten tazelenir', async () => {
    const { settings, find } = await mount();
    const range = find('dev-density').querySelector<HTMLInputElement>('input')!;
    expect(Number(range.min)).toBe(BACKDROP.density.min);
    expect(Number(range.max)).toBe(BACKDROP.density.max);
    await settings.update({ backdropDensity: 7 });
    await vi.waitFor(() => expect(range.value).toBe('7'));
  });

  it('dil değişince etiketler yenilenir; geri düğmesi niyeti dışarı verir', async () => {
    const { screen, onBack, find } = await mount();
    await i18next.changeLanguage('en');
    const headings = [...screen.element.querySelectorAll('h2')].map((node) => node.textContent);
    expect(headings).toEqual(['World', 'Practice']);
    find('dev-back').click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
