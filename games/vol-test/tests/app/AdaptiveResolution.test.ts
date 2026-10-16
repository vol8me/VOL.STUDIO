import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@volstudio/core';
import type Phaser from 'phaser';

const core = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('@volstudio/core', async (importOriginal) => ({
  ...(await importOriginal<typeof CoreModule>()),
  refreshVolViewport: core.refresh,
}));

import { AdaptiveResolution } from '@/app/AdaptiveResolution';

function fakeGame() {
  const listeners = new Map<string, (...args: number[]) => void>();
  const game = {
    events: {
      on: vi.fn((name: string, listener: (...args: number[]) => void) =>
        listeners.set(name, listener),
      ),
      off: vi.fn((name: string) => listeners.delete(name)),
    },
  } as unknown as Phaser.Game;
  return { game, step: (delta: number) => listeners.get('step')?.(0, delta), listeners };
}

afterEach(() => vi.clearAllMocks());

describe('AdaptiveResolution', () => {
  it('sürekli yavaş karede çarpanı kısar ve canvas yeniden kurulur; hızlı karede dokunmaz', () => {
    const resolution = new AdaptiveResolution();
    const { game, step } = fakeGame();
    const detach = resolution.attach(game);
    for (let frame = 0; frame < 400; frame++) step(8);
    expect(resolution.scale).toBe(1);
    expect(core.refresh).not.toHaveBeenCalled();
    for (let frame = 0; frame < 400; frame++) step(40);
    expect(resolution.scale).toBeLessThan(1);
    expect(resolution.scale).toBeGreaterThanOrEqual(0.5);
    expect(core.refresh).toHaveBeenCalledWith(game);
    detach();
  });

  it('duraklatılmış oyunda ölçmez: donmuş görüntü yeniden kurulmaz, devam edince ölçüm sürer', () => {
    let paused = true;
    const resolution = new AdaptiveResolution(() => paused);
    const { game, step } = fakeGame();
    const detach = resolution.attach(game);
    for (let frame = 0; frame < 600; frame++) step(40);
    expect(resolution.scale).toBe(1);
    expect(core.refresh).not.toHaveBeenCalled();
    paused = false;
    for (let frame = 0; frame < 400; frame++) step(40);
    expect(resolution.scale).toBeLessThan(1);
    detach();
  });

  it('pencere boyutu değişince çarpan 1e döner (tam ekran yeniden ölçülür); ayrılınca dinleyici kalmaz', () => {
    const resolution = new AdaptiveResolution();
    const { game, step, listeners } = fakeGame();
    const detach = resolution.attach(game);
    for (let frame = 0; frame < 400; frame++) step(40);
    expect(resolution.scale).toBeLessThan(1);
    core.refresh.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(resolution.scale).toBe(1);
    expect(core.refresh).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('resize'));
    expect(core.refresh).toHaveBeenCalledTimes(1);
    detach();
    expect(listeners.has('step')).toBe(false);
    for (let frame = 0; frame < 400; frame++) step(40);
    window.dispatchEvent(new Event('resize'));
    expect(core.refresh).toHaveBeenCalledTimes(1);
  });

  it('sabit ölçek seçilince uyarlanır kısma durur, canvas yalnız ölçek değişince yeniden kurulur; auto geri getirir', () => {
    const resolution = new AdaptiveResolution();
    const { game, step } = fakeGame();
    const detach = resolution.attach(game);
    resolution.apply(game, 0.7);
    expect(resolution.scale).toBe(0.7);
    expect(core.refresh).toHaveBeenCalledTimes(1);
    // Yavaş kareler sabit ölçeği kısmaz.
    for (let frame = 0; frame < 600; frame++) step(40);
    expect(resolution.scale).toBe(0.7);
    expect(core.refresh).toHaveBeenCalledTimes(1);
    // Aynı seçim yeniden uygulanınca canvas yeniden kurulmaz.
    resolution.apply(game, 0.7);
    expect(core.refresh).toHaveBeenCalledTimes(1);
    // Auto 1'den başlar ve yavaş karede yeniden kısar.
    resolution.apply(game, 'auto');
    expect(resolution.scale).toBe(1);
    expect(core.refresh).toHaveBeenCalledTimes(2);
    for (let frame = 0; frame < 400; frame++) step(40);
    expect(resolution.scale).toBeLessThan(1);
    detach();
  });

  it('choose değişimi bildirir ve ilk seçim kurulumdan önce canvas istemeden uygulanır', () => {
    const resolution = new AdaptiveResolution();
    expect(resolution.choose(0.5)).toBe(true);
    expect(resolution.choose(0.5)).toBe(false);
    expect(resolution.scale).toBe(0.5);
    expect(core.refresh).not.toHaveBeenCalled();
  });
});
