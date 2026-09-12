import { describe, expect, it, vi } from 'vitest';
import { particlePalette } from '@/config/particles';
import { ParticleRenderer } from '@/runtime/render/ParticleRenderer';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

function harness() {
  const graphics = {
    clear: vi.fn(),
    fillStyle: vi.fn(),
    fillCircle: vi.fn(),
    setDepth: vi.fn(),
    destroy: vi.fn(),
  };
  graphics.setDepth.mockReturnValue(graphics);
  const scene = { add: { graphics: vi.fn(() => graphics) } };
  const renderer = new ParticleRenderer(scene as never, 1024, 4.5);
  return { renderer, scene, graphics };
}

describe('ParticleRenderer', () => {
  it('tek sabit Phaser üyesiyle tür paletini dünya biriminde çizer', () => {
    const { renderer, scene, graphics } = harness();
    const particles = new ParticleStore(2);
    particles.x.set([10, 20]);
    particles.y.set([30, 40]);
    particles.type.set([0, 5]);

    renderer.render(particles);

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

  it('yakın görünümde parçacığın kameraya en yakın toroidal kopyasını seçer', () => {
    const { renderer, graphics } = harness();
    const particles = new ParticleStore(1);
    particles.x[0] = 5;
    particles.y[0] = 512;
    renderer.updateCamera({
      centerX: 1020,
      centerY: 512,
      zoom: 2,
      minZoom: 0.8,
      overview: false,
    });

    renderer.render(particles);

    expect(graphics.fillCircle).toHaveBeenCalledWith(1029, 512, 4.5);
  });

  it('overviewda yalnız kanonik koordinatı kullanır ve idempotent kapanır', () => {
    const { renderer, graphics } = harness();
    const particles = new ParticleStore(1);
    particles.x[0] = 5;
    particles.y[0] = 10;
    renderer.updateCamera({
      centerX: 500,
      centerY: 500,
      zoom: 0.8,
      minZoom: 0.8,
      overview: true,
    });

    renderer.render(particles);
    renderer.destroy();
    renderer.destroy();

    expect(graphics.fillCircle).toHaveBeenCalledWith(5, 10, 4.5);
    expect(graphics.destroy).toHaveBeenCalledOnce();
  });
});
