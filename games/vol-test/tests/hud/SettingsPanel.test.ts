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
    parent.querySelector<HTMLElement>('[data-testid="pause-haptics"]')!.click();
    const range = parent.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '0.4';
    range.dispatchEvent(new Event('change', { bubbles: true }));
    parent.querySelectorAll<HTMLButtonElement>('[data-testid="pause-display"] button')[1].click();
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
    expect(parent.querySelector('[data-testid="pause-display"]')).toBeNull();
    panel.refreshLabels();
    panel.destroy();
    settings.dispose();
    parent.remove();
  });
});
