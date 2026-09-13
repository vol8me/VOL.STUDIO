import { describe, expect, it, vi } from 'vitest';
import { WorldBoundaryRenderer } from '@/runtime/render/WorldBoundaryRenderer';

function harness() {
  const graphics = {
    setDepth: vi.fn(),
    lineStyle: vi.fn(),
    strokeRoundedRect: vi.fn(),
    destroy: vi.fn(),
  };
  graphics.setDepth.mockReturnValue(graphics);
  const scene = { add: { graphics: vi.fn(() => graphics) } };
  const renderer = new WorldBoundaryRenderer(
    scene as never,
    { x: 20, y: 30, width: 1000, height: 800 },
    { thicknessUnits: 6, color: 0x495865 },
  );
  return { renderer, scene, graphics };
}

describe('WorldBoundaryRenderer', () => {
  it('opak duvar bandını dünya içine alır ve parçacık katmanının arkasında çizer', () => {
    const { scene, graphics } = harness();

    expect(scene.add.graphics).toHaveBeenCalledOnce();
    expect(graphics.setDepth).toHaveBeenCalledWith(-950);
    expect(graphics.lineStyle).toHaveBeenCalledWith(6, 0x495865, 1);
    expect(graphics.strokeRoundedRect).toHaveBeenCalledWith(23, 33, 994, 794, 3);
  });

  it('duvar kaynağını idempotent kapatır', () => {
    const { renderer, graphics } = harness();

    renderer.destroy();
    renderer.destroy();

    expect(graphics.destroy).toHaveBeenCalledOnce();
  });
});
