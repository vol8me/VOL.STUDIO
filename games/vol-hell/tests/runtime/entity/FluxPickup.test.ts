import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRandom, Vector2 } from '@volstudio/core';
import { FluxPickupManager } from '@/runtime/entity/FluxPickupManager';
import { economyConfig } from '@/config/economy';
import { playerConfig } from '@/config/player';
import { RENDER_DEPTH } from '@/config/layers';
import type { Border } from '@/runtime/entity/Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';

interface FakeCircle {
  x: number;
  y: number;
  scale: number;
  depth: number;
  visible: boolean;
  destroyed: boolean;
  setStrokeStyle: () => FakeCircle;
  setScale: (s: number) => FakeCircle;
  setDepth: (d: number) => FakeCircle;
  setVisible: (v: boolean) => FakeCircle;
  destroy: () => void;
}

function makeScene(): { scene: never; circles: FakeCircle[] } {
  const circles: FakeCircle[] = [];
  const scene = {
    add: {
      circle: (x: number, y: number) => {
        const circle: FakeCircle = {
          x,
          y,
          scale: 1,
          depth: 0,
          visible: true,
          destroyed: false,
          setStrokeStyle: () => circle,
          setScale(s: number) {
            this.scale = s;
            return this;
          },
          setDepth(d: number) {
            this.depth = d;
            return this;
          },
          setVisible(v: boolean) {
            this.visible = v;
            return this;
          },
          destroy() {
            this.destroyed = true;
          },
        };
        circles.push(circle);
        return circle;
      },
    },
  };
  return { scene: scene as never, circles };
}

function makeBorder(): Border {
  return {
    clampX: (x: number) => Math.max(0, Math.min(800, x)),
    clampY: (y: number) => Math.max(0, Math.min(600, y)),
  } as unknown as Border;
}

const DROP_MS = economyConfig.flux.drop.durationMs;

describe('FluxPickupManager', () => {
  let scene: never;
  let circles: FakeCircle[];
  let effects: EffectManager;
  let onCollected: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const made = makeScene();
    scene = made.scene;
    circles = made.circles;
    effects = { play: vi.fn() } as unknown as EffectManager;
    onCollected = vi.fn();
  });

  function makeManager(seed = 5): FluxPickupManager {
    return new FluxPickupManager(scene, makeBorder(), effects, createRandom(seed), {
      onCollected,
    });
  }

  /** Düşme animasyonunu tamamlar — oyuncu uzakta, mıknatıs devreye girmez. */
  function land(manager: FluxPickupManager): void {
    manager.update(DROP_MS, new Vector2(9999, 9999));
  }

  it('düşman ölünce sahneye pickup düşer — otomatik sayaç değil', () => {
    const manager = makeManager();
    manager.drop(400, 300, 3);

    expect(manager.getActiveCount()).toBeGreaterThan(0);
    expect(circles.length).toBeGreaterThan(0);
    // Düşme anında hiçbir şey toplanmaz; oyuncunun gitmesi gerekir.
    expect(onCollected).not.toHaveBeenCalled();
  });

  it('miktar sıfır veya negatifse pickup düşmez', () => {
    const manager = makeManager();
    manager.drop(400, 300, 0);
    manager.drop(400, 300, -5);
    expect(manager.getActiveCount()).toBe(0);
  });

  it('pickup düşman katmanının altına çizilir', () => {
    const manager = makeManager();
    manager.drop(400, 300, 1);
    expect(circles[0].depth).toBe(RENDER_DEPTH.fluxPickup);
    expect(RENDER_DEPTH.fluxPickup).toBeLessThan(RENDER_DEPTH.enemy);
  });

  it('parça ölüm noktasında doğar ve yayla iniş noktasına gider', () => {
    const manager = makeManager();
    manager.drop(400, 300, 1);
    const pickup = circles[0];

    // İlk kare: tam ölüm noktasında, büyümüş halde.
    expect(pickup.x).toBe(400);
    expect(pickup.y).toBe(300);
    expect(pickup.scale).toBe(economyConfig.flux.drop.popScale);

    // Yolun ortasında yay yüzünden ölüm noktasının ÜSTÜNDE olur.
    manager.update(DROP_MS / 2, new Vector2(9999, 9999));
    expect(pickup.y).toBeLessThan(300);
    expect(pickup.scale).toBeGreaterThan(1);

    // İniş tamamlanınca ölçek normale döner ve konum sabitlenir.
    manager.update(DROP_MS / 2, new Vector2(9999, 9999));
    expect(pickup.scale).toBe(1);
    const landedX = pickup.x;
    const landedY = pickup.y;
    expect(Math.hypot(landedX - 400, landedY - 300)).toBeLessThanOrEqual(
      economyConfig.flux.scatterRadius,
    );
  });

  it('iniş bitmeden toplanmaz — üstünde duran oyuncu bile bekler', () => {
    const manager = makeManager();
    manager.drop(400, 300, 1);

    manager.update(DROP_MS / 4, new Vector2(400, 300));
    expect(onCollected).not.toHaveBeenCalled();

    manager.update(DROP_MS, new Vector2(400, 300));
    expect(onCollected).toHaveBeenCalledWith(1);
  });

  it('oyuncu uzaktayken yatayda yerinde kalır (yalnızca süzülme)', () => {
    const manager = makeManager();
    manager.drop(100, 100, 1);
    land(manager);
    const restX = circles[0].x;

    manager.update(16, new Vector2(700, 500));

    expect(onCollected).not.toHaveBeenCalled();
    expect(circles[0].x).toBe(restX);
  });

  it('süzülme (bob) parçayı iniş noktasının etrafında salındırır', () => {
    const manager = makeManager();
    manager.drop(100, 100, 1);
    land(manager);
    const restY = circles[0].y;

    const { periodMs, amplitudePx, enabled } = economyConfig.flux.bob;
    expect(enabled).toBe(true);

    manager.update(periodMs / 4, new Vector2(700, 500));
    const peak = circles[0].y;
    expect(Math.abs(peak - restY)).toBeGreaterThan(0);
    expect(Math.abs(peak - restY)).toBeLessThanOrEqual(amplitudePx + 0.001);

    // Tam periyot sonunda başlangıç yüksekliğine döner.
    manager.update((periodMs * 3) / 4, new Vector2(700, 500));
    expect(circles[0].y).toBeCloseTo(restY, 6);
  });

  it('mıknatıs menzilinde pickup oyuncuya doğru çekilir', () => {
    const manager = makeManager();
    manager.drop(400, 300, 1);
    land(manager);
    const pickup = circles[0];
    // Menzil içinde ama toplama mesafesinin dışında bir oyuncu.
    const playerX = pickup.x + economyConfig.flux.magnetRadius - 5;
    const distanceBefore = Math.abs(playerX - pickup.x);

    manager.update(16, new Vector2(playerX, pickup.y));

    expect(Math.abs(playerX - pickup.x)).toBeLessThan(distanceBefore);
    expect(onCollected).not.toHaveBeenCalled();
  });

  it('temas edilince toplanır, efekt oynar ve sahneden kalkar', () => {
    const manager = makeManager();
    manager.drop(400, 300, 1);
    land(manager);

    manager.update(16, new Vector2(circles[0].x, circles[0].y));

    expect(onCollected).toHaveBeenCalledWith(1);
    expect(effects.play).toHaveBeenCalledWith('fluxPickup', expect.any(Number), expect.any(Number));
    expect(manager.getActiveCount()).toBe(0);
    expect(circles[0].destroyed).toBe(true);
  });

  it('toplama menzili oyuncu hitbox’ına göre hesaplanır', () => {
    const manager = makeManager();
    manager.drop(400, 300, 1);
    land(manager);
    const pickup = circles[0];
    // Tam menzilin biraz dışında: mıknatıs çeker ama bu frame'de toplanmaz.
    const justOutside =
      playerConfig.hitboxRadius +
      economyConfig.flux.radius +
      economyConfig.flux.collectDistance +
      1;

    manager.update(1, new Vector2(pickup.x + justOutside, pickup.y));
    expect(onCollected).not.toHaveBeenCalled();
  });

  it('parça toplanana kadar sahnede kalır — ömrü yoktur', () => {
    const manager = makeManager();
    manager.drop(100, 100, 1);
    land(manager);

    // Uzun süre kimse almazsa bile kaybolmaz.
    for (let i = 0; i < 600; i++) {
      manager.update(100, new Vector2(700, 500));
    }

    expect(manager.getActiveCount()).toBe(1);
    expect(circles[0].destroyed).toBe(false);
    expect(circles[0].visible).toBe(true);
  });

  it('parça sayısı sınırlıdır ama toplam miktar korunur', () => {
    const manager = makeManager();
    const amount = economyConfig.flux.maxDropsPerDeath * 3 + 1;
    manager.drop(400, 300, amount);

    expect(manager.getActiveCount()).toBeLessThanOrEqual(economyConfig.flux.maxDropsPerDeath);

    land(manager);
    // Oyuncu düşme noktasına gelince tüm miktar toplanır.
    for (let i = 0; i < 5; i++) {
      manager.update(16, new Vector2(400, 300));
    }
    const total = onCollected.mock.calls.reduce((sum, [value]) => sum + (value as number), 0);
    expect(total).toBe(amount);
    expect(manager.getActiveCount()).toBe(0);
  });

  it('sahne tavanı dolunca yeni miktar mevcut parçaya eklenir — Flux kaybolmaz', () => {
    const manager = makeManager();
    const { maxActive, maxDropsPerDeath } = economyConfig.flux;

    let dropped = 0;
    while (manager.getActiveCount() < maxActive) {
      manager.drop(100, 100, maxDropsPerDeath);
      dropped += maxDropsPerDeath;
    }
    // Tavan doluyken düşen miktar yeni obje yaratmaz.
    manager.drop(100, 100, 3);
    dropped += 3;

    expect(manager.getActiveCount()).toBe(maxActive);

    land(manager);
    for (let i = 0; i < 5; i++) {
      manager.update(16, new Vector2(100, 100));
    }
    const total = onCollected.mock.calls.reduce((sum, [value]) => sum + (value as number), 0);
    expect(total).toBe(dropped);
  });

  it('destroy tüm pickupları temizler', () => {
    const manager = makeManager();
    manager.drop(100, 100, 4);
    manager.destroy();

    expect(manager.getActiveCount()).toBe(0);
    expect(circles.every((c) => c.destroyed)).toBe(true);
  });

  it('aynı seed aynı saçılmayı verir — determinizm korunur', () => {
    const positions = (): number[] => {
      const made = makeScene();
      const manager = new FluxPickupManager(
        made.scene,
        makeBorder(),
        effects,
        createRandom(77),
        {},
      );
      manager.drop(400, 300, 4);
      manager.update(DROP_MS, new Vector2(9999, 9999));
      return made.circles.map((c) => Math.round(c.x * 1000) + Math.round(c.y * 1000));
    };

    expect(positions()).toEqual(positions());
  });
});
