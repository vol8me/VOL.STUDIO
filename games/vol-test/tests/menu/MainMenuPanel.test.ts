import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '@volstudio/core/i18n';
import { MainMenuPanel } from '@/menu/MainMenuPanel';

const panels: MainMenuPanel[] = [];

function mount(withExit: boolean) {
  const calls = {
    play: vi.fn(),
    practice: vi.fn(),
    settings: vi.fn(),
    dev: vi.fn(),
    exit: vi.fn(),
  };
  const panel = new MainMenuPanel({
    onPlay: calls.play,
    onPractice: calls.practice,
    onSettings: calls.settings,
    onDev: calls.dev,
    onExit: withExit ? calls.exit : undefined,
  });
  document.body.append(panel.element);
  panels.push(panel);
  const find = (id: string): HTMLButtonElement | null =>
    panel.element.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
  return { panel, calls, find };
}

afterEach(async () => {
  for (const panel of panels.splice(0)) panel.destroy();
  await i18next.changeLanguage('tr');
});

describe('MainMenuPanel', () => {
  it('başlığı ve düğmeleri gösterir; her düğme kendi niyetini bildirir', () => {
    const { panel, calls, find } = mount(true);
    expect(panel.element.querySelector('h1')?.textContent).toBe('VOL.TEST');
    expect(find('menu-play')?.textContent).toBe(i18next.t('voltest:menu.play'));
    find('menu-play')?.click();
    find('menu-practice')?.click();
    find('menu-settings')?.click();
    find('menu-dev')?.click();
    find('menu-exit')?.click();
    expect(calls.play).toHaveBeenCalledTimes(1);
    expect(calls.practice).toHaveBeenCalledTimes(1);
    expect(calls.settings).toHaveBeenCalledTimes(1);
    expect(calls.dev).toHaveBeenCalledTimes(1);
    expect(calls.exit).toHaveBeenCalledTimes(1);
  });

  it('çıkış verilmezse çıkış düğmesi yoktur', () => {
    const { find } = mount(false);
    expect(find('menu-exit')).toBeNull();
  });

  it('odak ana eylemde başlar', () => {
    const { panel, find } = mount(false);
    panel.focus();
    expect(document.activeElement).toBe(find('menu-play'));
  });

  it('dil değişince etiketler yenilenir', async () => {
    const { find } = mount(true);
    await i18next.changeLanguage('en');
    expect(find('menu-play')?.textContent).toBe('Join the war');
    expect(find('menu-practice')?.textContent).toBe('Practice');
    expect(find('menu-exit')?.textContent).toBe('Exit');
  });
});
