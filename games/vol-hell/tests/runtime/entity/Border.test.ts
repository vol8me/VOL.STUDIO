import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Phaser mock — Border, scene.add.graphics() ile bir Graphics oluşturur.
vi.mock('phaser', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('phaser');

  class FakeGraphics {
    scene: FakeScene;
    constructor(scene: FakeScene) {
      this.scene = scene;
    }
    clear() { return this; }
    lineStyle() { return this; }
    strokeRect() { return this; }
    destroy() {}
  }

  class FakeScene {
    scale: {
      width: number;
      height: number;
      on: ReturnType<typeof vi.fn>;
      off: ReturnType<typeof vi.fn>;
    };

    add = {
      graphics: vi.fn(() => new FakeGraphics(this as unknown as FakeScene)),
    };

    constructor() {
      this.scale = {
        width: 800,
        height: 600,
        on: vi.fn(),
        off: vi.fn(),
      };
    }
  }

  return {
    ...actual,
    default: {
      ...(actual.default as Record<string, unknown>),
      Scene: FakeScene,
      Math: {
        Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
      },
      Scale: {
        Events: {
          RESIZE: 'resize',
        },
      },
    },
  };
});

import type Phaser from 'phaser';
import { Border } from '@/runtime/entity/Border';

interface FakeScene {
  scale: {
    width: number;
    height: number;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  add: {
    graphics: ReturnType<typeof vi.fn>;
  };
}

function makeScene(): FakeScene {
  return {
    scale: {
      width: 800,
      height: 600,
      on: vi.fn(),
      off: vi.fn(),
    },
    add: {
      graphics: vi.fn(() => ({
        scene: null as unknown,
        clear: vi.fn(),
        lineStyle: vi.fn(),
        strokeRect: vi.fn(),
        destroy: vi.fn(),
      })),
    },
  } as unknown as FakeScene;
}

describe('Border', () => {
  let scene: FakeScene;

  beforeEach(() => {
    scene = makeScene();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructor — scale RESIZE listener\'ı ekler', () => {
    const border = new Border(scene as unknown as Phaser.Scene);
    expect(scene.scale.on).toHaveBeenCalledWith('resize', expect.any(Function), border);
  });

  it('clamp — pozisyonu sınır içine çeker', () => {
    const border = new Border(scene as unknown as Phaser.Scene);
    const clamped = border.clamp(-100, -100, 14);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
  });

  it('destroy — scale RESIZE listener\'ını temizler', () => {
    const border = new Border(scene as unknown as Phaser.Scene);
    border.destroy();
    expect(scene.scale.off).toHaveBeenCalledWith('resize', expect.any(Function), border);
  });

  // === REGRESSION: DisplayList.shutdown() graphics.scene'i undefined yapar ===
  // Border.destroy() bu durumda hata fırlatmamalı — sceneRef kullanır.
  it('REGRESSION: graphics.scene undefined iken destroy hata fırlatmaz', () => {
    const border = new Border(scene as unknown as Phaser.Scene);

    // DisplayList.shutdown() simülasyonu: graphics.scene = undefined
    (border.graphics as unknown as { scene: unknown }).scene = undefined;

    expect(() => border.destroy()).not.toThrow();
    expect(scene.scale.off).toHaveBeenCalledWith('resize', expect.any(Function), border);
  });
});
