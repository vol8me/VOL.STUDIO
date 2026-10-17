import { describe, expect, it, vi } from 'vitest';
import { i18next } from '@volstudio/core/i18n';
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

  function pick(parent: HTMLElement, id: string, label: string): void {
    parent.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click();
    const option = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (candidate) => candidate.textContent === label,
    );
    expect(option, `${label} seçeneği`).toBeDefined();
    option!.click();
  }

  it('çizim çözünürlüğü her oturumda sunulur: otomatik ve sabit basamaklar tercihe yazılır', async () => {
    const { settings, panel, parent } = await mount(false);
    expect(settings.get().resolution).toBe('auto');
    pick(
      parent,
      'settings-resolution',
      i18next.t('voltest:pause.resolutionOption.scale', { percent: 70 }),
    );
    await vi.waitFor(() => expect(settings.get().resolution).toBe(0.7));
    pick(parent, 'settings-resolution', i18next.t('voltest:pause.resolutionOption.auto'));
    await vi.waitFor(() => expect(settings.get().resolution).toBe('auto'));
    // Dış değişim seçimi taşır.
    await settings.update({ resolution: 0.5 });
    expect(parent.querySelector('[data-testid="settings-resolution"]')?.textContent).toContain(
      '50',
    );
    expect(parent.querySelector('[data-testid="settings-window-size"]')).toBeNull();
    panel.destroy();
    settings.dispose();
    parent.remove();
  });

  it('pencere boyutu yalnız native pencerede sunulur, ekrana sığanları listeler ve tam ekranda gizlenir', async () => {
    vi.stubGlobal('screen', { availWidth: 1920, availHeight: 1040 });
    try {
      const { settings, panel, parent } = await mount(true);
      const row = parent
        .querySelector('[data-testid="settings-window-size"]')!
        .closest('.vol-settings-row') as HTMLElement;
      expect(row.hidden).toBe(false);
      parent.querySelector<HTMLElement>('[data-testid="settings-window-size"]')!.click();
      const labels = [...document.body.querySelectorAll('[role="option"]')].map(
        (o) => o.textContent,
      );
      // 1920×1080 bu ekrana (1040 yüksek) sığmaz.
      expect(labels).toEqual([
        i18next.t('voltest:pause.windowSizeOption.auto'),
        '1280 × 720',
        '1600 × 900',
      ]);
      document.body.click();
      pick(parent, 'settings-window-size', '1600 × 900');
      await vi.waitFor(() => expect(settings.get().windowSize).toBe('1600x900'));
      await settings.update({ display: 'fullscreen' });
      expect(row.hidden).toBe(true);
      await settings.update({ display: 'windowed' });
      expect(row.hidden).toBe(false);
      panel.destroy();
      settings.dispose();
      parent.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
