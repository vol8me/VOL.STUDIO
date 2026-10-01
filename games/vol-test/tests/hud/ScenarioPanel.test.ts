import { describe, expect, it } from 'vitest';
import { LocalStorageAdapter, ScopedSaveManager } from '@volstudio/core';
import { GameSettings } from '@/app/GameSettings';
import { ScenarioPanel } from '@/hud/ScenarioPanel';

describe('ScenarioPanel', () => {
  it('CORE seçim/tohum girdisi tercihleri kaydeder, bozuk tohumu önceki değere döndürür', async () => {
    localStorage.clear();
    const settings = new GameSettings(
      new ScopedSaveManager({
        synced: new LocalStorageAdapter(),
        device: new LocalStorageAdapter(),
      }),
      'Linux',
    );
    await settings.load();
    const panel = new ScenarioPanel(settings);
    document.body.append(...panel.elements);
    const picker = document.querySelector<HTMLButtonElement>('[data-testid=pause-scenario]')!;
    const seed = document.querySelector<HTMLInputElement>('[data-testid=pause-seed]')!;
    picker.click();
    document.querySelector<HTMLButtonElement>('[data-value=targets]')?.click();
    await settings.update({ scenario: 'targets' });
    expect(picker.textContent).toContain('Hedef atış');
    seed.value = '17';
    seed.dispatchEvent(new Event('change'));
    expect(settings.get().seed).toBe(17);
    seed.value = '-1';
    seed.dispatchEvent(new Event('change'));
    expect(settings.get().seed).toBe(17);
    expect(seed.value).toBe('17');
    await settings.update({ scenario: 'empty', seed: 123 });
    expect(seed.value).toBe('123');
    expect(picker.textContent).toContain('Boş dünya');
    panel.destroy();
    settings.dispose();
    expect(document.querySelector('[data-testid=pause-scenario]')).toBeNull();
  });
});
