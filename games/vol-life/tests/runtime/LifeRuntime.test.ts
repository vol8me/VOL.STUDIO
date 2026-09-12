import { describe, expect, it, vi } from 'vitest';
import { LifeRuntime } from '@/runtime/LifeRuntime';

function harness(fieldUpdates: boolean[] = [true]) {
  const world = {
    fields: {},
    particles: {},
    step: vi.fn(() => fieldUpdates.shift() ?? false),
  };
  const renderer = { render: vi.fn(), destroy: vi.fn() };
  const particleRenderer = {
    render: vi.fn(),
    updateCamera: vi.fn(),
    destroy: vi.fn(),
  };
  const camera = { update: vi.fn(), refreshViewport: vi.fn(), destroy: vi.fn() };
  const runtime = new LifeRuntime(
    { game: { canvas: document.createElement('canvas') }, cameras: { main: {} } } as never,
    {
      config: { fixedStepMs: 10, maxStepsPerFrame: 2 } as never,
      world: world as never,
      renderer: renderer as never,
      particleRenderer: particleRenderer as never,
      cameraController: camera as never,
    },
  );
  return { runtime, world, renderer, particleRenderer, camera };
}

describe('LifeRuntime', () => {
  it('açılışta ilk alan görünümünü üretir', () => {
    const { renderer, particleRenderer } = harness();

    expect(renderer.render).toHaveBeenCalledOnce();
    expect(particleRenderer.render).toHaveBeenCalledOnce();
  });

  it('render deltasını yalnız tam deterministik adımlara dönüştürür', () => {
    const { runtime, world, renderer, particleRenderer, camera } = harness();

    runtime.update(9);
    runtime.update(1);

    expect(world.step).toHaveBeenCalledOnce();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(particleRenderer.render).toHaveBeenCalledTimes(2);
    expect(camera.update).toHaveBeenNthCalledWith(1, 9);
    expect(camera.update).toHaveBeenNthCalledWith(2, 1);
  });

  it('alan değişmeyen simülasyon adımında GPU dokusunu yeniden yüklemez', () => {
    const { runtime, renderer } = harness([false, true]);

    runtime.update(10);
    runtime.update(10);

    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it('kare başına adım tavanını uygular ve birikmiş fazlalığı atar', () => {
    const { runtime, world } = harness();

    const frame = runtime.update(55);

    expect(world.step).toHaveBeenCalledTimes(2);
    expect(frame).toEqual({ fixedSteps: 2, partialStepMs: 0, droppedMs: 30 });
  });

  it('viewport yenilenmesini kamera denetleyicisine iletir', () => {
    const { runtime, camera } = harness();

    runtime.refreshViewport();

    expect(camera.refreshViewport).toHaveBeenCalledOnce();
  });

  it('GPU ve giriş sahiplerini bir kez kapatır', () => {
    const { runtime, renderer, particleRenderer, camera } = harness();

    runtime.destroy();
    runtime.destroy();

    expect(renderer.destroy).toHaveBeenCalledOnce();
    expect(particleRenderer.destroy).toHaveBeenCalledOnce();
    expect(camera.destroy).toHaveBeenCalledOnce();
  });
});
