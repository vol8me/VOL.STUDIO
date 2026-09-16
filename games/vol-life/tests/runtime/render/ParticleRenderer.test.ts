import { describe, expect, it, vi } from 'vitest';
import { particlePalette } from '@/config/particles';
import { substrateConfig } from '@/config/substrate';
import { ParticleRenderer } from '@/runtime/render/ParticleRenderer';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { HabitatSDF } from '@/runtime/sim/WorldDomain';
import { createHabitatDomain } from '@/runtime/sim/WorldDomain';

function harness(domain?: HabitatSDF) {
  const graphics = {
    clear: vi.fn(),
    fillStyle: vi.fn(),
    fillCircle: vi.fn(),
    fillEllipse: vi.fn(),
    save: vi.fn(),
    translateCanvas: vi.fn(),
    rotateCanvas: vi.fn(),
    restore: vi.fn(),
    setDepth: vi.fn(),
    destroy: vi.fn(),
  };
  graphics.setDepth.mockReturnValue(graphics);
  const scene = { add: { graphics: vi.fn(() => graphics) } };
  const renderer = new ParticleRenderer(
    scene as never,
    {
      radiusUnits: 4.5,
      maxSpeedUnitsPerReferenceTick: 2.4,
      velocityStretchMax: 1.6,
      fringeWidthUnits: 24,
      fringeStretchMax: 1.9,
    },
    domain ?? null,
  );
  return { renderer, scene, graphics };
}

describe('ParticleRenderer', () => {
  it('tek sabit Phaser üyesiyle tür paletini dünya biriminde çizer', () => {
    const { renderer, scene, graphics } = harness();
    const particles = new ParticleStore(2);
    particles.activateSlot(10, 30, 0, 0, 0);
    particles.activateSlot(20, 40, 0, 0, 5);

    renderer.render(particles, 1);

    expect(scene.add.graphics).toHaveBeenCalledOnce();
    expect(graphics.fillStyle.mock.calls).toEqual([
      [particlePalette[0], 1],
      [particlePalette[5], 1],
    ]);
    expect(graphics.fillCircle.mock.calls).toEqual([
      [10, 30, 4.5],
      [20, 40, 4.5],
    ]);
  });

  it('önceki ve güncel fizik durumunu render fazıyla ara değerler', () => {
    const { renderer, graphics } = harness();
    const particles = new ParticleStore(1);
    particles.activateSlot(15, 30, 0, 0, 0);
    particles.previousX[0] = 5;
    particles.previousY[0] = 10;

    renderer.render(particles, 0.5);

    expect(graphics.fillCircle).toHaveBeenCalledWith(10, 20, 4.5);
  });

  it('yalnız kanonik koordinatı kullanır ve idempotent kapanır', () => {
    const { renderer, graphics } = harness();
    const particles = new ParticleStore(1);
    particles.activateSlot(5, 10, 0, 0, 0);

    renderer.render(particles, 1);
    renderer.destroy();
    renderer.destroy();

    expect(graphics.fillCircle).toHaveBeenCalledWith(5, 10, 4.5);
    expect(graphics.destroy).toHaveBeenCalledOnce();
  });

  it('geçersiz yarıçap kurulumda reddeder', () => {
    const scene = { add: { graphics: vi.fn(() => ({ setDepth: vi.fn(), destroy: vi.fn() })) } };
    expect(
      () =>
        new ParticleRenderer(scene as never, {
          radiusUnits: 0,
          maxSpeedUnitsPerReferenceTick: 2.4,
          velocityStretchMax: 1.6,
          fringeWidthUnits: 24,
          fringeStretchMax: 1.9,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new ParticleRenderer(scene as never, {
          radiusUnits: Number.NaN,
          maxSpeedUnitsPerReferenceTick: 2.4,
          velocityStretchMax: 1.6,
          fringeWidthUnits: 24,
          fringeStretchMax: 1.9,
        }),
    ).toThrow(RangeError);
  });

  it('hızlı parçacığı hız yönünde uzatır', () => {
    const { renderer, graphics } = harness();
    const particles = new ParticleStore(1);
    particles.activateSlot(500, 500, 10, 0, 0);

    renderer.render(particles, 1);

    expect(graphics.fillEllipse).toHaveBeenCalledOnce();
    expect(graphics.save).toHaveBeenCalledOnce();
    expect(graphics.restore).toHaveBeenCalledOnce();
    expect(graphics.rotateCanvas).toHaveBeenCalledOnce();
  });

  it('domain verildiğinde fringe içindeki parçacığı normale göre uzatır', () => {
    const sdf = createHabitatDomain(substrateConfig.world.boundsUnits, substrateConfig.habitat, 7);
    const { renderer, graphics } = harness(sdf);
    const particles = new ParticleStore(1);
    const contour = sdf.contour(64);
    const cx = contour[0];
    const cy = contour[1];
    const boundary = sdf.sampleDistanceAndNormal(cx, cy);
    const normal = { x: boundary.normalX, y: boundary.normalY };
    const inside = { x: cx - normal.x * 2, y: cy - normal.y * 2 };
    particles.activateSlot(inside.x, inside.y, 0, 0, 0);
    particles.edgeDistance[0] = 2;

    renderer.render(particles, 1);

    expect(graphics.fillEllipse).toHaveBeenCalledOnce();
  });

  it('domain olmadan fringe distance yoksayılır ve hız esastır', () => {
    const { renderer, graphics } = harness();
    const particles = new ParticleStore(1);
    particles.activateSlot(500, 500, 5, 0, 0);
    particles.edgeDistance[0] = 2;

    renderer.render(particles, 1);

    expect(graphics.fillEllipse).toHaveBeenCalledOnce();
  });

  it('interpolationAlpha 0–1 dışını kenetler', () => {
    const { renderer, graphics } = harness();
    const particles = new ParticleStore(1);
    particles.activateSlot(100, 200, 0, 0, 0);
    particles.previousX[0] = 100;
    particles.previousY[0] = 200;

    renderer.render(particles, -1);
    expect(graphics.fillCircle).toHaveBeenCalledWith(100, 200, 4.5);

    renderer.render(particles, 5);
    expect(graphics.fillCircle).toHaveBeenLastCalledWith(100, 200, 4.5);
  });

  /* Kanonik slot sözleşmesinin görünür karşılığı: hayalet eski konumdan çizilemez. */
  it('yeniden kullanılan slot aynı karede eski parçacığın konumundan çizilmez', () => {
    const { renderer, graphics } = harness();
    const particles = new ParticleStore(1);
    particles.activateSlot(100, 200, 0, 0, 0);
    particles.deactivateSlot(0);
    particles.activateSlot(500, 600, 0, 0, 1);

    renderer.render(particles, 0.5);

    expect(graphics.fillCircle).toHaveBeenCalledExactlyOnceWith(500, 600, 4.5);
  });

  it('aktif olmayan slotları çizmez', () => {
    const { renderer, graphics } = harness();
    const particles = new ParticleStore(2);
    particles.activateSlot(10, 30, 0, 0, 0);
    particles.deactivateSlot(0);

    renderer.render(particles, 1);

    expect(graphics.fillCircle).not.toHaveBeenCalled();
  });
});
