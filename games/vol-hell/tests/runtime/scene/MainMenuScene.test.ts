import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as VolstudioCore from '@volstudio/core';

const fakes = vi.hoisted(() => ({
  showConfirm: vi.fn(),
  vibrate: vi.fn(),
  isTauri: vi.fn(() => false),
  closeWindow: vi.fn(),
  startMenuMusic: vi.fn(),
  stopMenuMusic: vi.fn(),
}));

vi.mock('@volstudio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof VolstudioCore>();
  return {
    ...actual,
    showConfirm: fakes.showConfirm,
    vibrate: fakes.vibrate,
  };
});
vi.mock('@tauri-apps/api/core', () => ({ isTauri: fakes.isTauri }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: fakes.closeWindow }),
}));
vi.mock('@/app/services', () => ({
  gameAudio: { playSfx: vi.fn() },
  gameStats: { getBestScore: vi.fn(() => 0), getBestTimeMs: vi.fn(() => 0) },
}));
vi.mock('@/app/menuMusic', () => ({
  startMenuMusic: fakes.startMenuMusic,
  stopMenuMusic: fakes.stopMenuMusic,
}));

import { MainMenuScene } from '@/runtime/scene/MainMenuScene';

interface MainMenuInternals {
  exitGame(): Promise<void>;
  onSceneShutdown(): void;
  exitPromptAbort: AbortController | null;
  stopBackHandler: (() => void) | null;
  nextScene: string | null;
  loadingTransition: null;
  startButton: { destroy(): void };
  exitButton: { destroy(): void };
  settingsButton: { destroy(): void };
  panel: { destroy(): void };
  ui: { element: HTMLElement };
}

function makeScene(): MainMenuInternals {
  const scene = new MainMenuScene() as unknown as MainMenuInternals;
  scene.ui = { element: document.createElement('div') };
  return scene;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isTauri.mockReturnValue(false);
  fakes.showConfirm.mockImplementation(
    ({ signal }: { signal?: AbortSignal }) =>
      new Promise<boolean>((resolve) => {
        if (signal?.aborted) {
          resolve(false);
          return;
        }
        signal?.addEventListener('abort', () => resolve(false), { once: true });
      }),
  );
});

describe('MainMenuScene çıkış onayı yaşam döngüsü', () => {
  it('bekleyen onay varken yinelenen çıkış isteği ikinci modal açmaz', async () => {
    const scene = makeScene();

    const pending = scene.exitGame();
    await scene.exitGame();

    expect(fakes.showConfirm).toHaveBeenCalledOnce();
    expect(fakes.vibrate).toHaveBeenCalledOnce();
    scene.exitPromptAbort?.abort();
    await pending;
    expect(scene.exitPromptAbort).toBeNull();
  });

  it('sahne kapanırken bekleyen onayı iptal edip sahip olduğu kaynakları bırakır', async () => {
    const scene = makeScene();
    const stopBackHandler = vi.fn();
    const destroyers = Array.from({ length: 4 }, () => ({ destroy: vi.fn() }));
    scene.stopBackHandler = stopBackHandler;
    scene.nextScene = 'Settings';
    scene.loadingTransition = null;
    [scene.startButton, scene.exitButton, scene.settingsButton, scene.panel] = destroyers;

    const pending = scene.exitGame();
    const [confirmOptions] = fakes.showConfirm.mock.calls[0] as [{ signal?: AbortSignal }];
    const signal = confirmOptions.signal!;
    scene.onSceneShutdown();
    await pending;

    expect(signal.aborted).toBe(true);
    expect(scene.exitPromptAbort).toBeNull();
    expect(stopBackHandler).toHaveBeenCalledOnce();
    expect(fakes.stopMenuMusic).not.toHaveBeenCalled();
    for (const destroyer of destroyers) expect(destroyer.destroy).toHaveBeenCalledOnce();
  });
});
