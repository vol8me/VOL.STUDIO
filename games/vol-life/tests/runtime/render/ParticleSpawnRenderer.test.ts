import { describe, expect, it, vi } from 'vitest';
import { ParticleSpawnRenderer } from '@/runtime/render/ParticleSpawnRenderer';
import type { ParticleSpawnEvent, TransientPresentationEvent } from '@/runtime/sim/WorldEvents';

function harness(reducedMotion = false, durationMs = 100) {
  const graphics = {
    clear: vi.fn(),
    fillStyle: vi.fn(),
    fillCircle: vi.fn(),
    lineStyle: vi.fn(),
    strokeCircle: vi.fn(),
    setDepth: vi.fn(),
    destroy: vi.fn(),
  };
  graphics.setDepth.mockReturnValue(graphics);
  const scene = { add: { graphics: vi.fn(() => graphics) } };
  const renderer = new ParticleSpawnRenderer(
    scene as never,
    { durationMs, maxSpawns: 4, radiusUnits: 3.2, ringExpansionRatio: 3.2 },
    () => reducedMotion,
  );
  return { renderer, graphics };
}

function spawnEvent(x = 100, y = 200, type = 0): ParticleSpawnEvent {
  return {
    kind: 'particle-spawn',
    tick: 1,
    stableId: 10,
    x,
    y,
    vx: 1,
    vy: 0,
    type,
  };
}

describe('ParticleSpawnRenderer', () => {
  it('geçersiz yapılandırmayı kurulumda reddeder', () => {
    const scene = { add: { graphics: vi.fn(() => ({ setDepth: vi.fn(), destroy: vi.fn() })) } };
    expect(
      () =>
        new ParticleSpawnRenderer(scene as never, {
          durationMs: 0,
          maxSpawns: 4,
          radiusUnits: 3.2,
          ringExpansionRatio: 3.2,
        }),
    ).toThrow(RangeError);
  });

  it('yalnız particle-spawn olaylarını alır, void-death olaylarını eler', () => {
    const { renderer } = harness();
    const mixed: TransientPresentationEvent[] = [
      spawnEvent(50, 60, 1),
      {
        kind: 'void-death',
        tick: 1,
        stableId: 2,
        x: 10,
        y: 20,
        vx: 0,
        vy: 0,
        type: 0,
        normalX: 1,
        normalY: 0,
      },
    ];

    renderer.push(mixed, 1000);
    expect(renderer.activeSpawnCount).toBe(1);
  });

  it('animasyon süresi dolduğunda tamamlanan doğuşları temizler', () => {
    const { renderer, graphics } = harness(false, 200);
    renderer.push([spawnEvent()], 1000);
    expect(renderer.activeSpawnCount).toBe(1);

    // Süre içinde render (1100ms: %50 ilerleme)
    renderer.render(1100);
    expect(graphics.clear).toHaveBeenCalled();
    expect(graphics.strokeCircle).toHaveBeenCalled();
    expect(renderer.activeSpawnCount).toBe(1);

    // Süre bitti (1250ms: %100+ ilerleme)
    renderer.render(1250);
    expect(renderer.activeSpawnCount).toBe(0);
  });

  it('tavan aşıldığında en eski doğuşları siler (LOD overflow)', () => {
    const { renderer } = harness(false, 1000);
    // maxSpawns = 4
    renderer.push(
      [
        spawnEvent(1, 1),
        spawnEvent(2, 2),
        spawnEvent(3, 3),
        spawnEvent(4, 4),
        spawnEvent(5, 5),
        spawnEvent(6, 6),
      ],
      1000,
    );
    expect(renderer.activeSpawnCount).toBe(4);
  });

  it('prefers-reduced-motion modunda halka yerine statik daire çizer', () => {
    const { renderer, graphics } = harness(true, 300);
    renderer.push([spawnEvent(100, 150, 2)], 1000);

    renderer.render(1150);
    expect(graphics.strokeCircle).not.toHaveBeenCalled();
    expect(graphics.fillCircle).toHaveBeenCalledWith(100, 150, expect.any(Number));
  });

  it('destroy çağrıldığında kaynakları kapatır', () => {
    const { renderer, graphics } = harness();
    renderer.push([spawnEvent()], 1000);
    renderer.destroy();

    expect(graphics.destroy).toHaveBeenCalled();
    expect(renderer.activeSpawnCount).toBe(0);

    // İkinci çağrıda hata vermez
    renderer.destroy();
    renderer.render(1050);
  });
});
