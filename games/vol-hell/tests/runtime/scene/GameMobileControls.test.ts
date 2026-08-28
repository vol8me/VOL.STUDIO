import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, i18next } from '@volstudio/core';
import { GameMobileControls } from '@/runtime/scene/GameMobileControls';
import { backHandlerCount } from '@/app/backNavigation';
import trResources from '@/i18n/tr.json';
import enResources from '@/i18n/en.json';

function setTouchPrimary(enabled: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: enabled ? query === '(pointer: coarse)' : query === '(hover: hover)',
      media: query,
    }),
  });
}

let parent: HTMLElement;
let bridge: GameMobileControls | null = null;

beforeEach(async () => {
  i18n.addResources('tr', 'volhell', trResources);
  i18n.addResources('en', 'volhell', enResources);
  if (!i18next.isInitialized) await i18n.init();
  if (i18next.language !== 'tr') await i18next.changeLanguage('tr');
  setTouchPrimary(true);
  parent = document.createElement('div');
  document.body.appendChild(parent);
});

afterEach(() => {
  bridge?.destroy();
  bridge = null;
  parent.remove();
  setTouchPrimary(false);
});

function mount(
  overrides: {
    isPaused?: () => boolean;
    isCardScreenOpen?: () => boolean;
    isDeathScreenVisible?: () => boolean;
    isRunEnding?: () => boolean;
    onPauseToggle?: () => void;
  } = {},
): GameMobileControls {
  bridge = new GameMobileControls();
  bridge.mount({
    parent,
    onAbility: () => false,
    onPauseToggle: vi.fn(),
    isPaused: () => false,
    isAbilityBlocked: () => false,
    isCardScreenOpen: () => false,
    isDeathScreenVisible: () => false,
    isRunEnding: () => false,
    ...overrides,
  });
  return bridge;
}

describe('GameMobileControls', () => {
  it('dokunmatik birincil cihazda ekran kontrollerini kurar ve birlikte kapatır', () => {
    mount();
    expect(parent.querySelector('.vol-touch-controls')).not.toBeNull();
    expect(parent.classList.contains('vol-touch-active')).toBe(true);

    bridge!.destroy();
    bridge = null;
    expect(parent.querySelector('.vol-touch-controls')).toBeNull();
    expect(parent.classList.contains('vol-touch-active')).toBe(false);
  });

  it('arka plana geçince sanal basımı temizler ve yalnız bir kez duraklatır', () => {
    const onPauseToggle = vi.fn();
    const mounted = mount({ onPauseToggle });
    mounted.actionSource.press('dash');

    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('blur'));

    expect(mounted.actionSource.hasPressed).toBe(false);
    expect(onPauseToggle).toHaveBeenCalledOnce();
  });

  it('geri hareketini kart/ölüm ekranında tüketir, normal koşuda duraklatır', () => {
    let cardOpen = true;
    let deathVisible = false;
    const onPauseToggle = vi.fn();
    mount({
      onPauseToggle,
      isCardScreenOpen: () => cardOpen,
      isDeathScreenVisible: () => deathVisible,
    });

    window.dispatchEvent(new Event('vol:androidback'));
    expect(onPauseToggle).not.toHaveBeenCalled();

    cardOpen = false;
    deathVisible = true;
    window.dispatchEvent(new Event('vol:androidback'));
    expect(onPauseToggle).not.toHaveBeenCalled();

    deathVisible = false;
    window.dispatchEvent(new Event('vol:androidback'));
    expect(onPauseToggle).toHaveBeenCalledOnce();
  });

  it('istatistik gönderimi beklenen koşu sonunda geri hareketi oyunu sürdürmez', () => {
    const onPauseToggle = vi.fn();
    mount({ onPauseToggle, isRunEnding: () => true });

    window.dispatchEvent(new Event('vol:androidback'));

    expect(onPauseToggle).not.toHaveBeenCalled();
  });

  it('mount yarıda hata verirse dokunmatik DOM ve görünürlük listenerlarını bırakır', () => {
    const originalAdd = window.addEventListener.bind(window);
    const remove = vi.spyOn(window, 'removeEventListener');
    const add = vi.spyOn(window, 'addEventListener').mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean,
    ) => {
      if (type === 'vol:androidback') throw new Error('native bridge unavailable');
      originalAdd(type, listener, options);
    }) as typeof window.addEventListener);

    expect(() => mount()).toThrow('native bridge unavailable');
    expect(parent.querySelector('.vol-touch-controls')).toBeNull();
    expect(parent.classList.contains('vol-touch-active')).toBe(false);
    expect(backHandlerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('focus', expect.any(Function));

    add.mockRestore();
    remove.mockRestore();
  });
});
