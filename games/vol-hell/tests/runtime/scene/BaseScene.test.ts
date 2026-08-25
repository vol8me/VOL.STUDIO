import { beforeEach, describe, expect, it, vi } from 'vitest';

const { FakeUIRoot, i18next, roots } = vi.hoisted(() => {
  const createdRoots: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
  class Root {
    readonly element: HTMLDivElement;
    readonly destroy = vi.fn();

    constructor(parent: HTMLElement) {
      this.element = parent.ownerDocument.createElement('div');
      parent.appendChild(this.element);
      createdRoots.push(this);
    }
  }

  return {
    FakeUIRoot: Root,
    i18next: {
      on: vi.fn(),
      off: vi.fn(),
    },
    roots: createdRoots,
  };
});

vi.mock('@volstudio/core', () => ({ UIRoot: FakeUIRoot, i18next }));

import { BaseScene } from '@/runtime/scene/BaseScene';

class TestScene extends BaseScene {
  shutdownCalls = 0;

  protected createScene(): void {
    this.showOnNextFrame(() => {});
  }

  protected onSceneShutdown(): void {
    this.shutdownCalls += 1;
    throw new Error('alt kaynak temizliği patladı');
  }
}

describe('BaseScene lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    roots.length = 0;
    i18next.on.mockClear();
    i18next.off.mockClear();
  });

  it('alt cleanup hata verse bile listener, rAF ve UIRoot temizlenir', () => {
    let pendingFrame: FrameRequestCallback | undefined;
    const request = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      pendingFrame = callback;
      return 17;
    });
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    let shutdown: (() => void) | undefined;

    const scene = new TestScene();
    Object.defineProperty(scene, 'game', {
      configurable: true,
      value: { canvas: { parentElement: document.body } },
    });
    Object.defineProperty(scene, 'events', {
      configurable: true,
      value: {
        once: vi.fn((_event: string, callback: () => void, context: TestScene) => {
          shutdown = () => callback.call(context);
        }),
      },
    });

    scene.create();

    expect(request).toHaveBeenCalledOnce();
    expect(pendingFrame).toBeDefined();
    expect(() => shutdown?.()).toThrow('alt kaynak temizliği patladı');
    expect(scene.shutdownCalls).toBe(1);
    expect(i18next.off).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith(17);
    expect(roots[0]?.destroy).toHaveBeenCalledOnce();

    // Phaser SHUTDOWN'ı hatalı bir alt callback yüzünden ikinci kez taşısa bile
    // aynı kaynakları tekrar sökmez.
    expect(() => shutdown?.()).not.toThrow();
    expect(scene.shutdownCalls).toBe(1);
    expect(i18next.off).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
