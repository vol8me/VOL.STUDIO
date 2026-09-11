import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Phaser mock — Border, scene.add.graphics() ile bir Graphics oluşturur.
vi.mock('phaser', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('phaser');

  class FakeGraphics {
    scene: FakeScene;
    constructor(scene: FakeScene) {
      this.scene = scene;
    }
    clear() {
      return this;
    }
    lineStyle() {
      return this;
    }
    strokeRect() {
      return this;
    }
    setDepth() {
      return this;
    }
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
import { Border, computeArenaBounds } from '@/runtime/entity/Border';
import { borderConfig } from '@/config/border';

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
        depth: 0,
        clear: vi.fn(),
        lineStyle: vi.fn(),
        strokeRect: vi.fn(),
        setDepth: vi.fn(),
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

  it("constructor — scale RESIZE listener'ı ekler", () => {
    const border = new Border(scene as unknown as Phaser.Scene);
    expect(scene.scale.on).toHaveBeenCalledWith('resize', expect.any(Function), border);
  });

  it('saf arena hesabı HUD rezervini boşlukla uygular ve merkezi gerçek alandan türetir', () => {
    const bounds = computeArenaBounds(1000, 700, { top: 120, bottom: 80 });

    expect(bounds.top).toBe(120 + borderConfig.hudGapPx);
    expect(bounds.bottom).toBe(700 - 80 - borderConfig.hudGapPx);
    expect(bounds.centerY).toBe((bounds.top + bounds.bottom) / 2);
    expect(bounds.left).toBe(borderConfig.margin);
  });

  it('HUD rezervi aşırıysa toplamını oranla sınırlar, taban marginini korur', () => {
    const bounds = computeArenaBounds(320, 200, { top: 180, bottom: 180 });
    const reserved = bounds.top + (200 - bounds.bottom);

    expect(reserved).toBeCloseTo(200 * borderConfig.maxReserveRatio);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it('refresh sağlayıcıdaki yeni rezervi okuyup sınırı yeniden çizer', () => {
    let top = 0;
    const border = new Border(scene as unknown as Phaser.Scene, () => ({ top, bottom: 0 }));
    top = 100;

    border.refresh();

    expect(border.bounds.top).toBe(100 + borderConfig.hudGapPx);
    expect((border.graphics.strokeRect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('clamp — pozisyonu sınır içine çeker', () => {
    const border = new Border(scene as unknown as Phaser.Scene);
    const clamped = border.clamp(-100, -100, 14);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
  });

  it("destroy — scale RESIZE listener'ını temizler", () => {
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
