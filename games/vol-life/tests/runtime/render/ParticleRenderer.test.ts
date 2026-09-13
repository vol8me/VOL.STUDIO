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
  const renderer = new ParticleRenderer(scene as never, 4.5);
  return { renderer, scene, graphics };
}

describe('ParticleRenderer', () => {
  it('tek sabit Phaser üyesiyle tür paletini dünya biriminde çizer', () => {
    const { renderer, scene, graphics } = harness();
    const particles = new ParticleStore(2);
    particles.x.set([10, 20]);
    particles.y.set([30, 40]);
    particles.type.set([0, 5]);

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
    particles.previousX[0] = 5;
    particles.previousY[0] = 10;
    particles.x[0] = 15;
    particles.y[0] = 30;

    renderer.render(particles, 0.5);

    expect(graphics.fillCircle).toHaveBeenCalledWith(10, 20, 4.5);
  });

  it('yalnız kanonik koordinatı kullanır ve idempotent kapanır', () => {
    const { renderer, graphics } = harness();
    const particles = new ParticleStore(1);
    particles.x[0] = 5;
    particles.y[0] = 10;

    renderer.render(particles, 1);
    renderer.destroy();
    renderer.destroy();

    expect(graphics.fillCircle).toHaveBeenCalledWith(5, 10, 4.5);
    expect(graphics.destroy).toHaveBeenCalledOnce();
  });
});
