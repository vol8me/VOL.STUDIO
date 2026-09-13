import { describe, expect, it, vi } from 'vitest';
import { WorldBoundaryRenderer } from '@/runtime/render/WorldBoundaryRenderer';

function harness() {
  const graphics = {
    setDepth: vi.fn(),
    clear: vi.fn(),
    lineStyle: vi.fn(),
    strokeRect: vi.fn(),
    destroy: vi.fn(),
  };
  graphics.setDepth.mockReturnValue(graphics);
  const scene = { add: { graphics: vi.fn(() => graphics) } };
  const renderer = new WorldBoundaryRenderer(
    scene as never,
    { x: 20, y: 30, width: 1000, height: 800 },
    {
      collisionInsetUnits: 6,
      preferredThicknessUnits: 6,
      minScreenPixels: 3,
      maxScreenPixels: 8,
      color: 0x495865,
    },
    { zoom: 1 },
  );
  return { renderer, scene, graphics };
}

describe('WorldBoundaryRenderer', () => {
  it('opak duvar bandını dünya içine alır ve parçacık katmanının arkasında çizer', () => {
    const { scene, graphics } = harness();

    expect(scene.add.graphics).toHaveBeenCalledOnce();
    expect(graphics.setDepth).toHaveBeenCalledWith(-950);
    expect(graphics.lineStyle).toHaveBeenCalledWith(6, 0x495865, 1);
    expect(graphics.strokeRect).toHaveBeenCalledWith(23, 33, 994, 794);
  });

  it('zoom arttığında kalınlığı ekran pikseli üst sınırında tutar ve iç yüzeyi değiştirmez', () => {
    const target = harness();
    const camera = { zoom: 4 };
    const renderer = new WorldBoundaryRenderer(
      target.scene as never,
      { x: 20, y: 30, width: 1000, height: 800 },
      {
        collisionInsetUnits: 6,
        preferredThicknessUnits: 6,
        minScreenPixels: 3,
        maxScreenPixels: 8,
        color: 0x495865,
      },
      camera,
    );

    expect(target.graphics.lineStyle).toHaveBeenLastCalledWith(2, 0x495865, 1);
    expect(target.graphics.strokeRect).toHaveBeenLastCalledWith(25, 35, 990, 790);
    renderer.destroy();
  });

  it('duvar kaynağını idempotent kapatır', () => {
    const { renderer, graphics } = harness();

    renderer.destroy();
    renderer.destroy();

    expect(graphics.destroy).toHaveBeenCalledOnce();
  });

  it('geçersiz zoom veya değişmeyen zoom durumunda yeniden çizmez', () => {
    const { renderer, graphics } = harness();
    graphics.clear.mockClear();
    renderer.update();
    expect(graphics.clear).not.toHaveBeenCalled();

    const badRenderer = new WorldBoundaryRenderer(
      { add: { graphics: () => graphics } } as never,
      { x: 0, y: 0, width: 100, height: 100 },
      {
        collisionInsetUnits: 6,
        preferredThicknessUnits: 6,
        minScreenPixels: 3,
        maxScreenPixels: 8,
        color: 0,
      },
      { zoom: 0 },
    );
    expect(graphics.clear).not.toHaveBeenCalled();
    badRenderer.destroy();
  });
});
