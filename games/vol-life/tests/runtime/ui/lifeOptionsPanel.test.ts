import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n, i18next, setHapticsEnabled } from '@volstudio/core';
import { LifeOptionsPanel, type LifeOptionsPanelOptions } from '@/runtime/ui/LifeOptionsPanel';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';

const panels: LifeOptionsPanel[] = [];
const originalVibrate = navigator.vibrate;

const defaults: LifeOptionsPanelOptions = {
  orientation: { value: 'portrait', interactive: false, onSelect: () => {} },
  language: { value: 'tr', onSelect: () => {} },
  showFps: { value: false, onSelect: () => {} },
  haptics: { value: false, onSelect: () => {} },
};

function mount(options: Partial<LifeOptionsPanelOptions> = {}): LifeOptionsPanel {
  const panel = new LifeOptionsPanel({ ...defaults, ...options });
  document.body.appendChild(panel.element);
  panels.push(panel);
  return panel;
}

function row(key: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-option="${key}"]`)!;
}

beforeAll(async () => {
  i18n.addResources('tr', 'life', tr);
  i18n.addResources('en', 'life', en);
  await i18n.init();
}, 60_000);

afterEach(async () => {
  while (panels.length > 0) panels.pop()?.destroy();
  document.body.innerHTML = '';
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: originalVibrate });
  Reflect.deleteProperty(navigator, 'userAgent');
  setHapticsEnabled(false);
  await i18n.changeLanguage('tr');
  vi.restoreAllMocks();
});

describe('LifeOptionsPanel', () => {
  it('dil için Select, açılır değerler için checkbox kurar', () => {
    mount();

    expect(row('language').querySelector('.vol-select')).not.toBeNull();
    expect(row('fps').querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(row('haptics').hidden).toBe(true);
  });

  it('dil seçimini bildirir ve seçili değeri dışarıdan günceller', () => {
    const onSelect = vi.fn();
    const panel = mount({ language: { value: 'tr', onSelect } });
    const select = row('language').querySelector<HTMLButtonElement>('.vol-select')!;

    select.click();
    document.querySelectorAll<HTMLButtonElement>('.vol-select__option')[1].click();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('en');

    panel.setLanguage('tr');
    expect(select.textContent).toContain(i18next.t('life:options.turkish'));
  });

  it('FPS seçimini bildirir ve dışarıdan sessizce günceller', () => {
    const onSelect = vi.fn();
    const panel = mount({ showFps: { value: false, onSelect } });
    const input = row('fps').querySelector<HTMLInputElement>('input')!;

    input.click();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(true);
    panel.setShowFps(false);
    expect(input.checked).toBe(false);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('titreşim satırını yalnız yetenek varken gösterir ve seçimi bildirir', () => {
    // Masaüstü tarayıcı API'yi tanımlasa da motor yoktur: satır gizli kalır.
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn() });
    mount();
    expect(row('haptics').hidden).toBe(true);
    panels.pop()?.destroy();
    document.body.innerHTML = '';

    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/152.0 Mobile Safari/537.36',
    });
    const onSelect = vi.fn((enabled: boolean) => setHapticsEnabled(enabled));
    const panel = mount({ haptics: { value: false, onSelect } });
    const input = row('haptics').querySelector<HTMLInputElement>('input')!;

    expect(row('haptics').hidden).toBe(false);
    input.click();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(true);

    panel.setHapticsEnabled(false);
    expect(input.checked).toBe(false);
  });

  it('yön ve masaüstü görüntü kipini segmentlerle bildirir', () => {
    const onOrientation = vi.fn();
    const onDisplay = vi.fn();
    const panel = mount({
      orientation: { value: 'portrait', interactive: true, onSelect: onOrientation },
      displayMode: { value: 'windowed', onSelect: onDisplay },
    });

    row('orientation').querySelectorAll<HTMLButtonElement>('button')[1].click();
    row('display').querySelectorAll<HTMLButtonElement>('button')[1].click();
    expect(onOrientation).toHaveBeenCalledExactlyOnceWith('landscape');
    expect(onDisplay).toHaveBeenCalledExactlyOnceWith('fullscreen');

    panel.setOrientation('portrait');
    panel.setDisplayMode('windowed');
    expect(row('orientation').querySelector('[aria-checked="true"]')?.textContent).toBe(
      i18next.t('life:options.portrait'),
    );
  });

  it('dil değişince tüm etiketleri ve seçenekleri canlı yeniler', async () => {
    mount({ displayMode: { value: 'windowed', onSelect: () => {} } });

    await i18n.changeLanguage('en');

    expect(row('language').textContent).toContain(en.options.language);
    expect(row('fps').textContent).toContain(en.options.showFps);
    expect(row('orientation').textContent).toContain(en.options.portrait);
    expect(row('display').textContent).toContain(en.options.windowed);
  });

  it('destroy dil ve yetenek aboneliklerini bırakıp DOM`dan kalkar', () => {
    const off = vi.spyOn(i18next, 'off');
    const panel = mount();
    panels.pop();

    panel.destroy();

    expect(off).toHaveBeenCalledWith('languageChanged', expect.any(Function));
    expect(document.querySelector('.vol-life-options')).toBeNull();
  });
});
