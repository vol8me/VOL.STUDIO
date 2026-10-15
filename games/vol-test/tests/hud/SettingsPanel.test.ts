import { describe, expect, it } from 'vitest';
import { LocalStorageAdapter, ScopedSaveManager } from '@volstudio/core';
import { GameSettings } from '@/app/GameSettings';
import { SettingsPanel } from '@/hud/SettingsPanel';

async function mount(display: boolean) {
  localStorage.clear();
  const settings = new GameSettings(
    new ScopedSaveManager({ device: new LocalStorageAdapter(), synced: new LocalStorageAdapter() }),
    'Linux',
  );
  await settings.load();
  const panel = new SettingsPanel(settings, display);
  const parent = document.createElement('div');
  parent.append(...panel.elements);
  document.body.append(parent);
  return { settings, panel, parent };
}
describe('SettingsPanel', () => {
  it('ses, titreşim ve ekran seçimini gerçek kayda bağlar, dış değişimi ekrana taşır', async () => {
    const { settings, panel, parent } = await mount(true);
    parent.querySelector<HTMLElement>('[data-testid="settings-haptics"]')!.click();
    const range = parent.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '0.4';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    parent
      .querySelectorAll<HTMLButtonElement>('[data-testid="settings-display"] button')[1]
      .click();
    await settings.flush();
    expect(settings.get()).toMatchObject({ volume: 0.4, haptics: false, display: 'fullscreen' });
    await settings.update({ volume: 0.8, haptics: true, display: 'windowed' });
    expect(range.value).toBe('0.8');
    expect(parent.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(true);
    panel.refreshLabels();
    expect(parent.textContent).toContain('Titreşim');
    panel.destroy();
    settings.dispose();
    parent.remove();
  });
  it('pencere yeteneği olmayan oturumda ekran kipi sunmaz', async () => {
    const { settings, panel, parent } = await mount(false);
    expect(parent.querySelector('[data-testid="settings-display"]')).toBeNull();
    panel.refreshLabels();
    panel.destroy();
    settings.dispose();
    parent.remove();
  });

  it('zemin ızgarası satırı ayarı çevirir ve dış değişimi ekrana taşır', async () => {
    const { settings, panel, parent } = await mount(false);
    const grid = parent.querySelector<HTMLElement>('[data-testid="settings-grid"]')!;
    expect(settings.get().grid).toBe(true);
    grid.click();
    await settings.flush();
    expect(settings.get().grid).toBe(false);
    await settings.update({ grid: true });
    expect(
      parent.querySelector<HTMLInputElement>('[data-testid="settings-grid"] input')?.checked,
    ).toBe(true);
    panel.destroy();
    settings.dispose();
    parent.remove();
  });

  it('titreşim satırı titreşim üretemeyen cihazda gizlidir, kol takılınca görünür', async () => {
    const { settings, panel, parent } = await mount(false);
    const row = parent
      .querySelector('[data-testid="settings-haptics"]')!
      .closest('.vol-settings-row');
    // jsdom'da ne `navigator.vibrate` ne de kol vardır: masaüstü tarayıcı gibi.
    expect((row as HTMLElement).hidden).toBe(true);
    const pad = {
      connected: true,
      vibrationActuator: { playEffect: () => Promise.resolve('complete') },
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    window.dispatchEvent(new Event('gamepadconnected'));
    expect((row as HTMLElement).hidden).toBe(false);
    Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true });
    window.dispatchEvent(new Event('gamepaddisconnected'));
    expect((row as HTMLElement).hidden).toBe(true);
    panel.destroy();
    settings.dispose();
    parent.remove();
  });
});
