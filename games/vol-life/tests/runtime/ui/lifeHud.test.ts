import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n, i18next, pushBackHandler } from '@volstudio/core';
import { LifeHud, type LifeHudOptions } from '@/runtime/ui/LifeHud';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';

const huds: LifeHud[] = [];

function mount(options: Partial<LifeHudOptions> = {}) {
  const content = document.createElement('div');
  content.className = 'test-options-content';
  content.appendChild(document.createElement('button'));
  const hud = new LifeHud(undefined, {
    optionsContent: { element: content },
    showFps: false,
    ...options,
  });
  huds.push(hud);
  return { hud, content };
}

function optionsButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('.vol-life-hud__options')!;
}

beforeAll(async () => {
  i18n.addResources('tr', 'life', tr);
  i18n.addResources('en', 'life', en);
  await i18n.init();
}, 60_000);

afterEach(async () => {
  while (huds.length > 0) huds.pop()?.destroy();
  document.body.innerHTML = '';
  await i18n.changeLanguage('tr');
  vi.restoreAllMocks();
});

describe('LifeHud', () => {
  it('marka şeridini ve sağ üst seçenek kümesini kurar', () => {
    mount();
    expect(document.querySelector('.vol-life-hud__title')?.textContent).toBe('VOL.LIFE');
    expect(optionsButton()).not.toBeNull();
    expect(optionsButton().classList.contains('vol-icon-button--sm')).toBe(false);
    expect(document.querySelector('.vol-life-hud__fullscreen')).toBeNull();
  });

  it('FPS kapalıyken ölçer kurmaz; ayar açılıp kapanınca yaşam döngüsünü izler', () => {
    const { hud } = mount();
    expect(document.querySelector('.vol-fps-meter')).toBeNull();

    hud.setFpsVisible(true);
    expect(document.querySelector<HTMLElement>('.vol-fps-meter')?.dataset.position).toBe(
      'bottom-right',
    );
    expect(document.querySelector('.vol-fps-meter')?.parentElement).toBe(
      document.querySelector('.vol-ui-root'),
    );

    hud.setFpsVisible(false);
    expect(document.querySelector('.vol-fps-meter')).toBeNull();
  });

  it('web tam ekran düğmesini seçeneklerin soluna ekler ve durumu izler', () => {
    const onToggle = vi.fn();
    const { hud } = mount({ fullscreen: { initialActive: true, onToggle } });
    const actions = [...document.querySelectorAll('.vol-life-hud__actions > button')];
    const button = document.querySelector<HTMLButtonElement>('.vol-life-hud__fullscreen')!;

    expect(actions).toEqual([button, optionsButton()]);
    expect(button.classList.contains('vol-icon-button--sm')).toBe(false);
    expect(button.getAttribute('aria-label')).toBe(i18next.t('life:hud.fullscreenExit'));
    button.click();
    expect(onToggle).toHaveBeenCalledOnce();
    hud.setFullscreenActive(false);
    expect(button.getAttribute('aria-label')).toBe(i18next.t('life:hud.fullscreenEnter'));
  });

  it('seçenekleri UI kökünde Sheet olarak açar, kapatır ve odağı geri verir', () => {
    const { hud, content } = mount();
    const button = optionsButton();
    button.focus();

    button.click();
    const sheet = document.querySelector('.vol-life-options-sheet')!;
    expect(hud.isOptionsOpen()).toBe(true);
    expect(sheet.contains(content)).toBe(true);
    expect(sheet.closest('.vol-ui-root')).not.toBeNull();
    expect(sheet.querySelector('.vol-sheet__title')?.textContent).toBe(tr.options.title);

    sheet.querySelector<HTMLButtonElement>('.vol-sheet__close')?.click();
    expect(hud.isOptionsOpen()).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('Sheet Android geri hareketini tüketir, alttaki işleyiciye sızdırmaz', () => {
    const lower = vi.fn(() => true);
    const stopLower = pushBackHandler(lower);
    const { hud } = mount();
    optionsButton().click();

    window.dispatchEvent(new Event('vol:androidback'));

    expect(hud.isOptionsOpen()).toBe(false);
    expect(lower).not.toHaveBeenCalled();
    stopLower();
  });

  it('dil değişince HUD ve Sheet etiketlerini canlı yeniler', async () => {
    mount({ fullscreen: { initialActive: false, onToggle: () => {} } });
    optionsButton().click();

    await i18n.changeLanguage('en');

    expect(document.querySelector('.vol-life-hud')?.getAttribute('aria-label')).toBe(
      en.hud.ariaLabel,
    );
    expect(optionsButton().getAttribute('aria-label')).toBe(en.hud.options);
    expect(document.querySelector('.vol-sheet__title')?.textContent).toBe(en.options.title);
    expect(document.querySelector('.vol-sheet__close')?.getAttribute('aria-label')).toBe(
      en.options.close,
    );
  });

  it('destroy abonelik, Sheet ve FPS kaynaklarını temizler', () => {
    const off = vi.spyOn(i18next, 'off');
    const { hud } = mount({ showFps: true });
    huds.pop();
    optionsButton().click();

    hud.destroy();

    expect(off).toHaveBeenCalledWith('languageChanged', expect.any(Function));
    expect(document.querySelector('.vol-life-hud')).toBeNull();
    expect(document.querySelector('.vol-fps-meter')).toBeNull();
    expect(document.querySelector('.vol-life-options-sheet')).toBeNull();
  });
});
