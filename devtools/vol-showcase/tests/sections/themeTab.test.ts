import { afterEach, describe, expect, it } from 'vitest';
import { ThemeController } from '@volstudio/core/ui';
import { buildThemeTab } from '../../src/sections/themeTab';

const platform = { platform: 'web', session: 'web', fullscreenControl: 'browser' } as const;

function mount(theme: ThemeController): { element: HTMLElement; destroy: () => void } {
  const tab = buildThemeTab({ theme, platform });
  document.body.appendChild(tab.element);
  return tab;
}

const radios = (group: Element | null): HTMLButtonElement[] => [
  ...(group?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []),
];

const groupByLabel = (root: ParentNode, label: RegExp): HTMLElement => {
  const found = [...root.querySelectorAll<HTMLElement>('[role="radiogroup"]')].find((group) =>
    label.test(group.getAttribute('aria-label') ?? ''),
  );
  if (!found) throw new Error(`radiogroup bulunamadı: ${String(label)}`);
  return found;
};

const scopeOf = (root: ParentNode, kind: 'global' | 'a' | 'b'): HTMLElement => {
  const found = root.querySelector<HTMLElement>(`[data-vol-scope="${kind}"]`);
  if (!found) throw new Error(`kapsam bulunamadı: ${kind}`);
  return found;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('Tema sekmesi', () => {
  it('küresel seçiciler tek ThemeController’ı sürer ve dışarıdan gelen değişimi yansıtır', () => {
    const theme = new ThemeController();
    const tab = mount(theme);
    const skin = groupByLabel(tab.element, /^(Skin|Kaplama)$/);
    const density = tab.element.querySelector<HTMLButtonElement>(
      '.vol-theme-lab__global .vol-select',
    );
    const skinButtons = radios(skin);
    const choose = (value: string): void => {
      density?.click();
      document
        .querySelector<HTMLButtonElement>(`.vol-select__option[data-value="${value}"]`)
        ?.click();
    };

    skinButtons[1].click();
    expect(theme.state.theme).toBe('aurum');
    choose('compact');
    expect(theme.state.density).toBe('compact');

    // Üst çubuk düğmesi gibi başka bir yerden gelen değişim kontrollere ve duruma düşer.
    theme.setTheme('default');
    theme.setDensity('spacious');
    expect(skinButtons[0].getAttribute('aria-checked')).toBe('true');
    expect(density?.textContent).toMatch(/Spacious|Geniş/);
    expect(tab.element.querySelector('.vol-theme-lab__readout')?.textContent).toMatch(
      /Steel|Çelik/,
    );
    tab.destroy();
    theme.dispose();
  });

  it('büyük hedef anahtarı hedef tabanını açıp kapatır', () => {
    const theme = new ThemeController();
    const tab = mount(theme);
    const toggle = tab.element.querySelector<HTMLInputElement>('input[role="switch"]');
    expect(toggle).not.toBeNull();
    toggle?.click();
    expect(theme.state.largeTargets).toBe(true);
    toggle?.click();
    expect(theme.state.largeTargets).toBe(false);
    tab.destroy();
    theme.dispose();
  });

  it('önizleme kapsamları kendi denetleyicisini taşır; küresel değişim onları etkilemez', () => {
    const theme = new ThemeController();
    const tab = mount(theme);
    const global = scopeOf(tab.element, 'global');
    const a = scopeOf(tab.element, 'a');
    const b = scopeOf(tab.element, 'b');

    // Küresel kapsamın niteliği yok (kökü izler); A ve B kendi kaplama/yoğunluğunu yazar.
    expect(global.hasAttribute('data-vol-theme')).toBe(false);
    expect([a.dataset.volTheme, a.dataset.volDensity]).toEqual(['aurum', 'spacious']);
    expect([b.dataset.volTheme, b.dataset.volDensity]).toEqual(['default', 'compact']);

    theme.setTheme('aurum');
    theme.setDensity('compact');
    expect([a.dataset.volTheme, a.dataset.volDensity]).toEqual(['aurum', 'spacious']);
    expect([b.dataset.volTheme, b.dataset.volDensity]).toEqual(['default', 'compact']);

    // Kapsamın kendi seçicisi yalnız o kutuyu değiştirir.
    const scopeSkin = radios(groupByLabel(a, /./));
    scopeSkin[0].click();
    expect(a.dataset.volTheme).toBe('default');
    expect(b.dataset.volTheme).toBe('default');
    expect(theme.state.theme).toBe('aurum');
    tab.destroy();
    theme.dispose();
  });

  it('kapsamlı Select listesi kutuya bağlanır, küresel olan <body>ye', () => {
    const theme = new ThemeController();
    const tab = mount(theme);
    for (const kind of ['a', 'global'] as const) {
      const scope = scopeOf(tab.element, kind);
      const select = scope.querySelector<HTMLButtonElement>('.vol-select');
      select?.click();
      const listbox = document.querySelector<HTMLElement>('.vol-select__listbox');
      expect(listbox).not.toBeNull();
      expect(scope.contains(listbox)).toBe(kind === 'a');
      expect(listbox?.parentElement === document.body).toBe(kind === 'global');
      select?.click();
      listbox?.remove();
    }
    tab.destroy();
    theme.dispose();
  });

  it('destroy kapsam denetleyicilerini söker ve nitelikleri geri yazar', () => {
    const theme = new ThemeController();
    const tab = mount(theme);
    const a = scopeOf(tab.element, 'a');
    expect(a.hasAttribute('data-vol-theme')).toBe(true);
    tab.destroy();
    expect(a.hasAttribute('data-vol-theme')).toBe(false);
    expect(a.hasAttribute('data-vol-density')).toBe(false);
    expect(() => tab.destroy()).not.toThrow();
    theme.dispose();
  });

  it('oturum bilgisi platformu, oturumu ve tam ekran karşılığını söyler', () => {
    const theme = new ThemeController();
    const tab = mount(theme);
    const text = tab.element.querySelector('.vol-theme-lab__session')?.textContent ?? '';
    expect(text).toContain('web');
    expect(text.toLowerCase()).toMatch(/browser|tarayıcı/);
    tab.destroy();
    theme.dispose();
  });
});
