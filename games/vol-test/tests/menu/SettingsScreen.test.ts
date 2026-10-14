import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '@volstudio/core/i18n';
import { LocalStorageAdapter, ScopedSaveManager } from '@volstudio/core';
import { GameSettings } from '@/app/GameSettings';
import { SettingsScreen } from '@/menu/SettingsScreen';

const cleanups: Array<() => void> = [];

async function mount() {
  localStorage.clear();
  const settings = new GameSettings(
    new ScopedSaveManager({ synced: new LocalStorageAdapter(), device: new LocalStorageAdapter() }),
    'Linux',
  );
  await settings.load();
  const onBack = vi.fn();
  const screen = new SettingsScreen({ settings, displayAvailable: true, onBack });
  document.body.append(screen.element);
  cleanups.push(() => {
    screen.destroy();
    settings.dispose();
  });
  const find = <T extends HTMLElement = HTMLElement>(id: string): T =>
    screen.element.querySelector<T>(`[data-testid="${id}"]`)!;
  const choice = (id: string, label: string): HTMLButtonElement =>
    [...find(id).querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (button) => button.textContent === label,
    )!;
  return { screen, settings, onBack, find, choice };
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  await i18next.changeLanguage('tr');
});

describe('SettingsScreen', () => {
  it('dil seçimi tercihi kaydeder ve çalışan dili değiştirir', async () => {
    const { settings, choice, find } = await mount();
    expect(settings.get().language).toBe('auto');
    choice('settings-language', 'English').click();
    await vi.waitFor(() => expect(i18next.language).toBe('en'));
    expect(settings.get().language).toBe('en');
    expect(find('settings-back').getAttribute('aria-label')).toBe('Back');
    expect(choice('settings-language', 'Automatic')).toBeDefined();
  });

  it('kalite seçimi tercihe yazılır', async () => {
    const { settings, choice } = await mount();
    choice('settings-quality', i18next.t('voltest:pause.qualityLevel.low')).click();
    await vi.waitFor(() => expect(settings.get().quality).toBe('low'));
  });

  it('duraklatma menüsüyle ortak satırları taşır ve tercihten tazelenir', async () => {
    const { settings, screen } = await mount();
    expect(screen.element.querySelector('[data-testid="pause-volume"]')).not.toBeNull();
    expect(screen.element.querySelector('[data-testid="pause-haptics"]')).not.toBeNull();
    expect(screen.element.querySelector('[data-testid="pause-display"]')).not.toBeNull();
    await settings.update({ quality: 'low', language: 'en' });
    const active = screen.element.querySelector(
      '[data-testid="settings-quality"] [role="radio"][aria-checked="true"]',
    );
    expect(active?.textContent).toBe(i18next.t('voltest:pause.qualityLevel.low'));
  });

  it('geri niyetini bildirir', async () => {
    const { find, onBack } = await mount();
    find('settings-back').click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
