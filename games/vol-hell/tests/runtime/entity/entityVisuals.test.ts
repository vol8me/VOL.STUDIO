import { describe, expect, it, vi } from 'vitest';
import { Vector2 } from '@volstudio/core';
import { Bullet } from '@/runtime/entity/Bullet';
import { Enemy } from '@/runtime/entity/Enemy';
import { FULL_ENTITY_VISUALS, resolveEntityVisuals } from '@/runtime/entity/entityVisuals';
import { ENEMY_CATALOG } from '@/config/enemies/catalog';
import { createEnemyStats } from '@/runtime/entity/enemyStats';
import type { EffectManager } from '@/runtime/systems/EffectManager';

/** Çizim çağrılarını sayan sahte Phaser sahnesi. */
function makeScene() {
  const strokes: unknown[][] = [];
  const shape = {
    x: 0,
    y: 0,
    setStrokeStyle: (...args: unknown[]) => {
      strokes.push(args);
      return shape;
    },
    setOrigin: () => shape,
    setSize: () => shape,
    setDisplaySize: () => shape,
    setTint: () => shape,
    setActive: () => shape,
    setDepth: () => shape,
    setVisible: () => shape,
    setScale: () => shape,
    setAlpha: () => shape,
    setFillStyle: () => shape,
    setRotation: () => shape,
    setPosition: () => shape,
    clear: () => shape,
    lineStyle: () => shape,
    strokeRect: () => shape,
    destroy: () => {},
  };
  const scene = {
    add: {
      circle: () => ({ ...shape }),
      rectangle: () => ({ ...shape }),
      graphics: () => ({ ...shape }),
      arc: () => ({ ...shape }),
    },
    time: { now: 0 },
    strokes,
  };
  return scene;
}

function makeEffects(): EffectManager {
  return { play: vi.fn() } as unknown as EffectManager;
}

describe('varlık görsel kalitesi', () => {
  it('sağlayıcı verilmezse TAM kalite varsayılır', () => {
    // Entity'ler uygulama singleton'ına uzanmaz; test ve simülasyon
    // varsayılanla çalışabilmeli.
    expect(resolveEntityVisuals(undefined)).toEqual(FULL_ENTITY_VISUALS);
    expect(FULL_ENTITY_VISUALS).toEqual({ entityStrokes: true, bulletTrails: true });
  });

  it('kenar çizgileri açıkken mermi kenar çizgisi kurar', () => {
    const scene = makeScene();
    const arcs: { setStrokeStyle: ReturnType<typeof vi.fn> }[] = [];
    scene.add.circle = () => {
      const arc = { ...makeScene().add.circle(), setStrokeStyle: vi.fn() };
      arcs.push(arc as never);
      return arc as never;
    };

    new Bullet(scene as never, 0, 0, new Vector2(1, 0), makeEffects(), 10, () => ({
      entityStrokes: true,
      bulletTrails: true,
    }));

    expect(arcs[0]?.setStrokeStyle).toHaveBeenCalled();
  });

  it('kenar çizgileri kapalıyken mermi HİÇ kenar çizgisi kurmaz', () => {
    const scene = makeScene();
    const arcs: { setStrokeStyle: ReturnType<typeof vi.fn> }[] = [];
    scene.add.circle = () => {
      const arc = { ...makeScene().add.circle(), setStrokeStyle: vi.fn() };
      arcs.push(arc as never);
      return arc as never;
    };

    new Bullet(scene as never, 0, 0, new Vector2(1, 0), makeEffects(), 10, () => ({
      entityStrokes: false,
      bulletTrails: false,
    }));

    expect(arcs[0]?.setStrokeStyle).not.toHaveBeenCalled();
  });

  it('iz kapalıyken mermi güncellemesi iz partikülü ÜRETMEZ', () => {
    const effects = makeEffects();
    const border = {
      bounds: { left: -1000, right: 1000, top: -1000, bottom: 1000 },
      clampX: (v: number) => v,
      clampY: (v: number) => v,
    };

    const bullet = new Bullet(makeScene() as never, 0, 0, new Vector2(1, 0), effects, 10, () => ({
      entityStrokes: false,
      bulletTrails: false,
    }));
    // İz frekansı ~25 ms; 200 ms'te açıkken defalarca üretirdi.
    for (let i = 0; i < 10; i++) bullet.update(20, border as never);

    const trailCalls = vi.mocked(effects.play).mock.calls.filter(([id]) => id === 'bulletTrail');
    expect(trailCalls).toHaveLength(0);
  });

  it('iz açıkken mermi güncellemesi iz partikülü üretir', () => {
    const effects = makeEffects();
    const border = {
      bounds: { left: -1000, right: 1000, top: -1000, bottom: 1000 },
      clampX: (v: number) => v,
      clampY: (v: number) => v,
    };

    const bullet = new Bullet(makeScene() as never, 0, 0, new Vector2(1, 0), effects, 10);
    for (let i = 0; i < 10; i++) bullet.update(20, border as never);

    const trailCalls = vi.mocked(effects.play).mock.calls.filter(([id]) => id === 'bulletTrail');
    expect(trailCalls.length).toBeGreaterThan(0);
  });

  it('düşman kenar çizgisi de aynı kapıdan geçer', () => {
    const arcs: { setStrokeStyle: ReturnType<typeof vi.fn> }[] = [];
    const scene = makeScene();
    scene.add.circle = () => {
      const arc = { ...makeScene().add.circle(), setStrokeStyle: vi.fn() };
      arcs.push(arc as never);
      return arc as never;
    };
    const definition = ENEMY_CATALOG.grunt;

    new Enemy(scene as never, 0, 0, makeEffects(), {
      definition,
      stats: createEnemyStats(definition),
      scoreValue: 10,
      spawnIndex: 0,
      visualsProvider: () => ({ entityStrokes: false, bulletTrails: false }),
    });

    expect(arcs[0]?.setStrokeStyle).not.toHaveBeenCalled();
  });
});
