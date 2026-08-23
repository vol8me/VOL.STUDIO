import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { i18next } from '@volstudio/core';

vi.mock('phaser', () => {
  const SHUTDOWN = 'shutdown';
  const READY = 'ready';

  class FakeGame {
    events = { on: vi.fn(), off: vi.fn(), once: vi.fn() };
    constructor(_config: unknown) {}
  }

  class FakeScene {
    events = { once: vi.fn() };
    key: string;

    constructor(config: { key?: string } = {}) {
      this.key = config.key ?? '';
    }
  }

  class FakeSprite {
    constructor(_scene: unknown, _x?: number, _y?: number, _texture?: string) {}
  }

  class FakeContainer {
    constructor(_scene: unknown, _x?: number, _y?: number) {}
    add = vi.fn();
  }

  class FakeGraphics {
    constructor(_scene: unknown) {}
    fillStyle = vi.fn().mockReturnThis();
    fillCircle = vi.fn().mockReturnThis();
    lineStyle = vi.fn().mockReturnThis();
    strokeCircle = vi.fn().mockReturnThis();
    beginPath = vi.fn().mockReturnThis();
    arc = vi.fn().mockReturnThis();
    strokePath = vi.fn().mockReturnThis();
    fillPath = vi.fn().mockReturnThis();
    clear = vi.fn().mockReturnThis();
  }

  return {
    default: {
      Game: FakeGame,
      Scene: FakeScene,
      Scenes: {
        Events: {
          SHUTDOWN,
        },
      },
      GameObjects: {
        Sprite: FakeSprite,
        Container: FakeContainer,
        Graphics: FakeGraphics,
      },
      Display: {
        Color: {
          HexStringToColor: (hex: string) => ({
            color: parseInt(hex.replace('#', ''), 16) || 0,
          }),
        },
      },
      Scale: { RESIZE: 'resize', NONE: 'none' },
      Core: {
        Events: { READY },
      },
    },
  };
});

describe('ShowcaseScene', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructor sahne anahtarını ayarlar', async () => {
    const { ShowcaseScene } = await import('../../src/scenes/ShowcaseScene');
    const scene = new ShowcaseScene() as unknown as { key: string };
    expect(scene.key).toBe('Showcase');
  });

  it('create root, tabs ve langButton oluşturur', async () => {
    const { ShowcaseScene } = await import('../../src/scenes/ShowcaseScene');
    const scene = new ShowcaseScene() as unknown as {
      create: () => void;
      root: HTMLDivElement;
      tabs: { element: HTMLElement; destroy: () => void };
    };

    scene.create();

    expect(scene.root).toBeInstanceOf(HTMLDivElement);
    expect(scene.root.classList.contains('vol-showcase-root')).toBe(true);
    expect(scene.tabs.element).toBeInstanceOf(HTMLElement);

    const langButton = scene.root.querySelector('.vol-showcase-lang-button');
    expect(langButton).toBeInstanceOf(HTMLButtonElement);
    expect(langButton?.textContent).toBe(i18next.language?.toUpperCase() ?? 'TR');
  });

  it('langButton tıklayınca dil değiştirir ve arayüzü yeniden kurar', async () => {
    const { ShowcaseScene } = await import('../../src/scenes/ShowcaseScene');
    const scene = new ShowcaseScene() as unknown as {
      create: () => void;
      root: HTMLDivElement;
      tabs: { element: HTMLElement; destroy: () => void };
    };

    scene.create();

    const langButton = scene.root.querySelector<HTMLButtonElement>('.vol-showcase-lang-button');
    expect(langButton).not.toBeNull();

    const oldTabs = scene.tabs;
    const oldTabsDestroy = vi.spyOn(oldTabs, 'destroy');

    langButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(oldTabsDestroy).toHaveBeenCalled();
    expect(scene.tabs).not.toBe(oldTabs);
    expect(scene.tabs.element).toBeInstanceOf(HTMLElement);
    expect(scene.tabs.element.parentElement).toBe(scene.root);
  });

  it('shutdown listener i18n ve UI temizler', async () => {
    const { ShowcaseScene } = await import('../../src/scenes/ShowcaseScene');
    const scene = new ShowcaseScene() as unknown as {
      create: () => void;
      root: HTMLDivElement;
      tabs: { element: HTMLElement; destroy: () => void };
      onShutdown: () => void;
    };

    scene.create();

    const offSpy = vi.spyOn(i18next, 'off');
    const tabsDestroy = vi.spyOn(scene.tabs, 'destroy');

    scene.onShutdown();

    expect(offSpy).toHaveBeenCalledWith('languageChanged', expect.any(Function));
    expect(tabsDestroy).toHaveBeenCalled();
    expect(scene.root.parentElement).toBeNull();
  });
});
