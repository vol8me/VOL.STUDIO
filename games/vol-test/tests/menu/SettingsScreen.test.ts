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

  it('ses kaydırıcısı bırakılmadan, sürüklerken canlı uygulanır', async () => {
    const { settings, screen } = await mount();
    const range = screen.element.querySelector<HTMLInputElement>(
      '[data-testid="settings-volume"] input',
    )!;
    range.value = '0.4';
    // Yalnız `input` olayı: `change` (bırakma) gelmeden tercih ve ses değişir.
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(settings.get().volume).toBe(0.4));
    range.value = '0.2';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(settings.get().volume).toBe(0.2));
    expect(range.value).toBe('0.2');
  });

  it('canlı menü arka planı onay kutusu tercihe yazılır ve tercihten tazelenir', async () => {
    const { settings, find } = await mount();
    const box = find('settings-backdrop').querySelector<HTMLInputElement>('input')!;
    expect(box.checked).toBe(true);
    box.click();
    await vi.waitFor(() => expect(settings.get().backdrop).toBe(false));
    await settings.update({ backdrop: true });
    await vi.waitFor(() => expect(box.checked).toBe(true));
  });

  it('kalite seçimi tercihe yazılır', async () => {
    const { settings, choice } = await mount();
    choice('settings-quality', i18next.t('voltest:pause.qualityLevel.low')).click();
    await vi.waitFor(() => expect(settings.get().quality).toBe('low'));
  });

  it('duraklatma menüsüyle ortak satırları taşır ve tercihten tazelenir', async () => {
    const { settings, screen } = await mount();
    expect(screen.element.querySelector('[data-testid="settings-volume"]')).not.toBeNull();
    expect(screen.element.querySelector('[data-testid="settings-haptics"]')).not.toBeNull();
    expect(screen.element.querySelector('[data-testid="settings-display"]')).not.toBeNull();
    // Senaryo ve tohum geliştirici ayarıdır: ayarlar ekranında yoktur.
    expect(screen.element.querySelector('[data-testid="dev-scenario"]')).toBeNull();
    expect(screen.element.querySelector('[data-testid="dev-seed"]')).toBeNull();
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
