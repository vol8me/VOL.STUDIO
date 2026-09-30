import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@volstudio/core';
import { triggerBack } from '@volstudio/core';
import { PauseController } from '@/scenes/world/PauseController';

const haptics = vi.hoisted(() => ({
  cancelled: 0,
  visibility: null as ((state: 'foreground' | 'background') => void) | null,
}));

vi.mock('@volstudio/core', async (importOriginal) => ({
  ...(await importOriginal<typeof CoreModule>()),
  cancelHaptics: () => haptics.cancelled++,
  // jsdom odak taşımaz; gözlemcinin geri çağrısı doğrudan sürülür.
  observeAppVisibility: (listener: (state: 'foreground' | 'background') => void) => {
    haptics.visibility = listener;
    return () => {
      haptics.visibility = null;
    };
  },
}));

let active: PauseController | null = null;

function build() {
  const surface = { showPause: vi.fn(), hidePause: vi.fn() };
  const releaseInput = vi.fn();
  const suppressPauseInput = vi.fn();
  const controller = new PauseController({ surface, releaseInput, suppressPauseInput });
  active = controller;
  return { controller, surface, releaseInput, suppressPauseInput };
}

afterEach(() => {
  active?.destroy();
  active = null;
  haptics.cancelled = 0;
});

describe('PauseController', () => {
  it('ses geçişini her durum değişiminde bir kez bildirir', () => {
    const changes: boolean[] = [];
    active = new PauseController({
      surface: { showPause: () => undefined, hidePause: () => undefined },
      releaseInput: () => undefined,
      suppressPauseInput: () => undefined,
      onChange: (paused) => changes.push(paused),
    });
    active.pause();
    active.pause();
    active.resume();
    active.resume();
    expect(changes).toEqual([true, false]);
  });
  it('duraklatınca katmanı açar, girdiyi bırakır, titreşimi keser; tekrar duraklatmaz', () => {
    const { controller, surface, releaseInput } = build();
    controller.pause();
    controller.pause();
    expect(controller.paused).toBe(true);
    expect(surface.showPause).toHaveBeenCalledTimes(1);
    expect(releaseInput).toHaveBeenCalledTimes(1);
    expect(haptics.cancelled).toBe(1);
  });

  it('oyun içinden geçiş katmanı kapatır ve sürdürme basışını bastırır', () => {
    const { controller, surface, suppressPauseInput } = build();
    controller.toggle();
    controller.toggle();
    expect(controller.paused).toBe(false);
    expect(surface.hidePause).toHaveBeenCalledTimes(1);
    expect(suppressPauseInput).toHaveBeenCalledTimes(1);
  });

  it('katmanın kendi kapanışı yalnız durumu sürdürür', () => {
    const { controller, surface } = build();
    controller.pause();
    controller.resume();
    controller.resume();
    expect(controller.paused).toBe(false);
    expect(surface.hidePause).not.toHaveBeenCalled();
  });

  it('Android geri hareketi geçiş yapar; yok edilince dinlemez', () => {
    const { controller } = build();
    triggerBack();
    expect(controller.paused).toBe(true);
    triggerBack();
    expect(controller.paused).toBe(false);
    controller.destroy();
    active = null;
    triggerBack();
    expect(controller.paused).toBe(false);
  });

  it('uygulama arka plana geçince duraklar', () => {
    const { controller } = build();
    haptics.visibility?.('foreground');
    expect(controller.paused).toBe(false);
    haptics.visibility?.('background');
    expect(controller.paused).toBe(true);
    controller.destroy();
    active = null;
    expect(haptics.visibility).toBeNull();
  });
});
