import { describe, expect, it, vi } from 'vitest';
import { LifeRuntime } from '@/runtime/LifeRuntime';

function harness(fieldUpdates: boolean[] = [true], initialSnapshot: unknown = null) {
  const snapshot = { tick: 12 } as never;
  const world = {
    fields: {},
    particles: {},
    step: vi.fn(() => fieldUpdates.shift() ?? false),
    snapshot: vi.fn(() => snapshot),
    restore: vi.fn(),
  };
  const renderer = { render: vi.fn(), destroy: vi.fn() };
  const boundaryRenderer = { destroy: vi.fn() };
  const particleRenderer = {
    render: vi.fn(),
    destroy: vi.fn(),
  };
  const camera = { update: vi.fn(), refreshViewport: vi.fn(), destroy: vi.fn() };
  const runtime = new LifeRuntime(
    { game: { canvas: document.createElement('canvas') }, cameras: { main: {} } } as never,
    {
      config: { fixedStepMs: 10, maxStepsPerFrame: 2 } as never,
      world: world as never,
      renderer: renderer as never,
      boundaryRenderer,
      particleRenderer: particleRenderer as never,
      cameraController: camera as never,
      initialSnapshot: initialSnapshot as never,
    },
  );
  return { runtime, world, renderer, boundaryRenderer, particleRenderer, camera, snapshot };
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
    expect(particleRenderer.render).toHaveBeenCalledTimes(3);
    expect(particleRenderer.render).toHaveBeenLastCalledWith(world.particles, 0);
    expect(camera.update).toHaveBeenNthCalledWith(1, 9);
    expect(camera.update).toHaveBeenNthCalledWith(2, 1);
  });

  it('sabit adım oluşmasa da parçacıkları birikmiş render fazıyla çizer', () => {
    const { runtime, particleRenderer, world } = harness();

    runtime.update(5);

    expect(particleRenderer.render).toHaveBeenLastCalledWith(world.particles, 0.5);
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

  it('ilk snapshotı renderdan önce geri yükler ve güncel snapshotı açar', () => {
    const initial = { tick: 7 };
    const { runtime, world, snapshot } = harness([true], initial);

    expect(world.restore).toHaveBeenCalledExactlyOnceWith(initial);
    expect(runtime.snapshot()).toBe(snapshot);
  });

  it('GPU ve giriş sahiplerini bir kez kapatır', () => {
    const { runtime, renderer, boundaryRenderer, particleRenderer, camera } = harness();

    runtime.destroy();
    runtime.destroy();

    expect(renderer.destroy).toHaveBeenCalledOnce();
    expect(boundaryRenderer.destroy).toHaveBeenCalledOnce();
    expect(particleRenderer.destroy).toHaveBeenCalledOnce();
    expect(camera.destroy).toHaveBeenCalledOnce();
  });

  it('kurulum yarıda kesilirse o ana kadar alınan kaynakları geri bırakır', () => {
    const renderer = { render: vi.fn(), destroy: vi.fn() };
    const boundaryRenderer = { destroy: vi.fn() };
    const particleRenderer = { render: vi.fn(), destroy: vi.fn() };
    const dependencies = {
      config: { fixedStepMs: 10, maxStepsPerFrame: 2 } as never,
      world: { fields: {}, particles: {}, restore: vi.fn() } as never,
      renderer: renderer as never,
      boundaryRenderer,
      particleRenderer: particleRenderer as never,
      get cameraController(): never {
        throw new Error('kamera kurulamadı');
      },
    };

    expect(
      () =>
        new LifeRuntime(
          { game: { canvas: document.createElement('canvas') }, cameras: { main: {} } } as never,
          dependencies,
        ),
    ).toThrow('kamera kurulamadı');
    expect(renderer.destroy).toHaveBeenCalledOnce();
    expect(boundaryRenderer.destroy).toHaveBeenCalledOnce();
    expect(particleRenderer.destroy).toHaveBeenCalledOnce();
  });

  it('bağımlılık verilmediğinde varsayılan adaptörleri kurar ve kapatır', () => {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) as DOMRect;
    const camera = {
      width: 800,
      height: 600,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
      setZoom: vi.fn(),
      centerOn: vi.fn(),
    };
    const imageData = { data: new Uint8ClampedArray(262144), width: 256, height: 256 } as ImageData;
    const texture = {
      context: { createImageData: vi.fn(() => imageData) },
      putData: vi.fn(),
      refresh: vi.fn(),
      setFilter: vi.fn(),
      getSourceImage: vi.fn(() => ({})),
      destroy: vi.fn(),
    };
    const textures = { createCanvas: vi.fn(() => texture), remove: vi.fn() };
    const boundary = {
      setDepth: vi.fn(() => boundary),
      lineStyle: vi.fn(),
      strokeRect: vi.fn(),
      strokeRoundedRect: vi.fn(),
      clear: vi.fn(),
      fillStyle: vi.fn(),
      fillCircle: vi.fn(),
      destroy: vi.fn(),
    };
    const image = {
      setOrigin: vi.fn(() => image),
      setDisplaySize: vi.fn(() => image),
      setDepth: vi.fn(() => image),
      setVisible: vi.fn(() => image),
      setPosition: vi.fn(() => image),
      destroy: vi.fn(),
    };
    const add = {
      graphics: vi.fn(() => boundary),
      image: vi.fn(() => image),
    };
    const scene = { game: { canvas }, cameras: { main: camera }, add, textures } as never;
    const runtime = new LifeRuntime(scene);
    expect(runtime.snapshot().tick).toBe(0);
    runtime.destroy();
  });
});
