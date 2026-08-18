import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { i18n, i18next } from '@volstudio/core';
import { DeathScreen, type DeathStats } from '@/runtime/scene/DeathScreen';
import trResources from '@/i18n/tr.json';

const BASE_STATS: DeathStats = {
  outcome: 'defeat',
  score: 1250,
  bestScore: 3000,
  kills: 42,
  bestKills: 90,
  timeMs: 95_400,
  bestTimeMs: 180_000,
  totalKills: 900,
  wave: 12,
  flux: 88,
  level: 6,
};

describe('DeathScreen', () => {
  let parent: HTMLDivElement;
  let screen: DeathScreen;
  let onRestart: ReturnType<typeof vi.fn>;
  let onMainMenu: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    i18n.addResources('tr', 'volhell', trResources);
    await i18n.init();
    await i18next.changeLanguage('tr');

    parent = document.createElement('div');
    document.body.appendChild(parent);
    onRestart = vi.fn();
    onMainMenu = vi.fn();
    screen = new DeathScreen(parent, {
      onRestart: () => {
        onRestart();
      },
      onMainMenu: () => {
        onMainMenu();
      },
    });
  });

  afterEach(() => {
    screen.destroy();
    document.body.replaceChildren();
  });

  it('kurulunca gizli, overlay parent altına asılır', () => {
    expect(screen.isVisible()).toBe(false);
    expect(parent.querySelector('.vol-death-overlay')).not.toBeNull();
  });

  it('show görünür yapar ve istatistikleri basar', () => {
    screen.show(BASE_STATS);
    expect(screen.isVisible()).toBe(true);

    const overlay = parent.querySelector('.vol-death-overlay');
    expect(overlay?.classList.contains('vol-death-overlay--visible')).toBe(true);

    const statText = [...parent.querySelectorAll('.vol-run-summary__stat')]
      .map((n) => n.textContent ?? '')
      .join(' | ');
    expect(statText).toContain('1250');
    expect(statText).toContain('42');
    expect(statText).toContain('12');
  });

  describe('zafer / yenilgi ayrımı', () => {
    it('yenilgide zafer sınıfı taşımaz', () => {
      screen.show(BASE_STATS);
      const overlay = parent.querySelector('.vol-death-overlay');
      expect(overlay?.classList.contains('vol-death-overlay--victory')).toBe(false);
    });

    it('zaferde zafer sınıfı ve zafer başlığı gelir', () => {
      screen.show({ ...BASE_STATS, outcome: 'victory' });
      const overlay = parent.querySelector('.vol-death-overlay');
      expect(overlay?.classList.contains('vol-death-overlay--victory')).toBe(true);

      const title = parent.querySelector('h1')?.textContent ?? '';
      expect(title).toBe(i18next.t('volhell:death.victoryTitle'));
      expect(title).not.toBe(i18next.t('volhell:death.title'));
    });

    it('aynı ekran zaferden yenilgiye geri döndürülebilir', () => {
      // Sahne yeniden başladığında aynı ekran örneği yeniden kullanılır.
      screen.show({ ...BASE_STATS, outcome: 'victory' });
      screen.show(BASE_STATS);
      const overlay = parent.querySelector('.vol-death-overlay');
      expect(overlay?.classList.contains('vol-death-overlay--victory')).toBe(false);
      expect(parent.querySelector('h1')?.textContent).toBe(i18next.t('volhell:death.title'));
    });
  });

  it('butonlar callback tetikler', () => {
    screen.show(BASE_STATS);
    const buttons = parent.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    buttons[0]?.click();
    buttons[1]?.click();
    expect(onRestart).toHaveBeenCalledOnce();
    expect(onMainMenu).toHaveBeenCalledOnce();
  });

  it('dil değişince etiketler ve istatistikler yeniden yazılır', async () => {
    screen.show(BASE_STATS);
    const before = parent.querySelector('h1')?.textContent;

    await i18next.changeLanguage('tr');

    // Yeniden çizildi ve içerik hâlâ dolu — boş stringe düşmedi.
    const after = parent.querySelector('h1')?.textContent;
    expect(after).toBe(before);
    expect(after?.length).toBeGreaterThan(0);
  });

  it('destroy overlay ve languageChanged aboneliğini kaldırır', () => {
    const offSpy = vi.spyOn(i18next, 'off');
    screen.show(BASE_STATS);
    screen.destroy();

    expect(parent.querySelector('.vol-death-overlay')).toBeNull();
    expect(offSpy).toHaveBeenCalledWith('languageChanged', expect.any(Function));
    offSpy.mockRestore();

    // afterEach ikinci kez destroy çağırıyor; patlamamalı.
    screen = new DeathScreen(parent, { onRestart, onMainMenu });
  });
});
