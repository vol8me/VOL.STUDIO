import { describe, expect, it, vi } from 'vitest';
import { LifeRuntime } from '@/runtime/LifeRuntime';

function harness(fieldUpdates: boolean[] = [true], initialSnapshot: unknown = null) {
  const snapshot = { tick: 12 } as never;
  const domain = {
    bbox: { x: 0, y: 0, width: 1024, height: 1024 },
    sampleDistanceAndNormal: () => ({ distance: 200, normalX: 1, normalY: 0 }),
    contour: () => new Float32Array(64),
    digest: 'abcdef0123456789',
    storage: { x: 0, y: 0, width: 1024, height: 1024 },
  };
  const world = {
    domain,
    fields: {},
    particles: {},
    step: vi.fn(() => fieldUpdates.shift() ?? false),
    snapshot: vi.fn(() => snapshot),
    restore: vi.fn(),
    drainTransientPresentationEvents: vi.fn(() => []),
  };
  const fieldRenderer = { render: vi.fn(), destroy: vi.fn() };
  const habitatRenderer = { update: vi.fn(), destroy: vi.fn() };
  const deathRenderer = { push: vi.fn(), render: vi.fn(), destroy: vi.fn() };
  const spawnRenderer = { push: vi.fn(), render: vi.fn(), destroy: vi.fn() };
  const particleRenderer = {
    render: vi.fn(),
    destroy: vi.fn(),
  };
  const camera = {
    update: vi.fn(),
    refreshViewport: vi.fn(),
    destroy: vi.fn(),
  };
  const backdrop = { setBackgroundColor: vi.fn() };
  const graphics = { setDepth: vi.fn(() => graphics), destroy: vi.fn() };
  const runtime = new LifeRuntime(
    {
      game: { canvas: document.createElement('canvas') },
      cameras: { main: { width: 1200, height: 800 } },
      add: { graphics: vi.fn(() => graphics) },
    } as never,
    {
      config: {
        world: { fixedStepMs: 10, maxStepsPerFrame: 2 },
        particles: { referenceHz: 60 },
        genome: { dynamics: { maxSpeedUnitsPerReferenceTick: 2 } },
        candidate: { physics: { cutoffUnits: 96 }, void: { widthUnits: 24 } },
        habitat: {},
      } as never,
      world: world as never,
      fieldRenderer: fieldRenderer as never,
      habitatRenderer: habitatRenderer as never,
      deathRenderer: deathRenderer as never,
      spawnRenderer: spawnRenderer as never,
      particleRenderer: particleRenderer as never,
      cameraController: camera as never,
      backdrop: backdrop as never,
      initialSnapshot: initialSnapshot as never,
    },
  );
  return {
    runtime,
    world,
    fieldRenderer,
    habitatRenderer,
    deathRenderer,
    spawnRenderer,
    particleRenderer,
    camera,
    snapshot,
  };
}

describe('LifeRuntime', () => {
  it('açılışta ilk alan görünümünü üretir', () => {
    const { fieldRenderer, particleRenderer } = harness();

    expect(fieldRenderer.render).toHaveBeenCalledOnce();
    expect(particleRenderer.render).toHaveBeenCalledOnce();
  });

  it('render deltasını yalnız tam deterministik adımlara dönüştürür', () => {
    const { runtime, world, fieldRenderer, particleRenderer, camera } = harness();

    runtime.update(9);
    runtime.update(1);

    expect(world.step).toHaveBeenCalledOnce();
    expect(fieldRenderer.render).toHaveBeenCalledTimes(2);
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
    const { runtime, fieldRenderer } = harness([false, true]);

    runtime.update(10);
    runtime.update(10);

    expect(fieldRenderer.render).toHaveBeenCalledTimes(2);
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
    const { runtime, fieldRenderer, habitatRenderer, deathRenderer, particleRenderer, camera } =
      harness();

    runtime.destroy();
    runtime.destroy();

    expect(fieldRenderer.destroy).toHaveBeenCalledOnce();
    expect(habitatRenderer.destroy).toHaveBeenCalledOnce();
    expect(deathRenderer.destroy).toHaveBeenCalledOnce();
    expect(particleRenderer.destroy).toHaveBeenCalledOnce();
    expect(camera.destroy).toHaveBeenCalledOnce();
  });

  it('kurulum yarıda kesilirse o ana kadar alınan kaynakları geri bırakır', () => {
    const fieldRenderer = { render: vi.fn(), destroy: vi.fn() };
    const habitatRenderer = { update: vi.fn(), destroy: vi.fn() };
    const deathRenderer = { push: vi.fn(), render: vi.fn(), destroy: vi.fn() };
    const spawnRenderer = { push: vi.fn(), render: vi.fn(), destroy: vi.fn() };
    const particleRenderer = { render: vi.fn(), destroy: vi.fn() };
    const dependencies = {
      config: {
        world: { fixedStepMs: 10, maxStepsPerFrame: 2 },
        particles: { referenceHz: 60 },
        genome: { dynamics: { maxSpeedUnitsPerReferenceTick: 2 } },
        habitat: {},
      } as never,
      world: {
        domain: {},
        fields: {},
        particles: {},
        restore: vi.fn(),
        drainTransientPresentationEvents: vi.fn(() => []),
      } as never,
      fieldRenderer: fieldRenderer as never,
      habitatRenderer: habitatRenderer as never,
      deathRenderer: deathRenderer as never,
      spawnRenderer: spawnRenderer as never,
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
    expect(fieldRenderer.destroy).toHaveBeenCalledOnce();
    expect(habitatRenderer.destroy).toHaveBeenCalledOnce();
    expect(deathRenderer.destroy).toHaveBeenCalledOnce();
    expect(spawnRenderer.destroy).toHaveBeenCalledOnce();
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
      setBackgroundColor: vi.fn(),
    };
    const texture = {
      context: {
        createImageData: vi.fn(
          (width: number, height: number) =>
            ({ data: new Uint8ClampedArray(width * height * 4), width, height }) as ImageData,
        ),
      },
      putData: vi.fn(),
      refresh: vi.fn(),
      setFilter: vi.fn(),
      getSourceImage: vi.fn(() => ({})),
      destroy: vi.fn(),
    };
    const textures = { createCanvas: vi.fn(() => texture), remove: vi.fn() };
    const graphics = {
      setDepth: vi.fn(() => graphics),
      lineStyle: vi.fn(),
      strokePoints: vi.fn(),
      strokeRect: vi.fn(),
      strokeRoundedRect: vi.fn(),
      clear: vi.fn(),
      fillStyle: vi.fn(),
      fillCircle: vi.fn(),
      fillEllipse: vi.fn(),
      save: vi.fn(),
      translateCanvas: vi.fn(),
      rotateCanvas: vi.fn(),
      restore: vi.fn(),
      setAlpha: vi.fn(),
      destroy: vi.fn(),
    };
    const image = {
      setOrigin: vi.fn(() => image),
      setDisplaySize: vi.fn(() => image),
      setDepth: vi.fn(() => image),
      setVisible: vi.fn(() => image),
      setPosition: vi.fn(() => image),
      setAlpha: vi.fn(() => image),
      destroy: vi.fn(),
    };
    const add = {
      graphics: vi.fn(() => graphics),
      image: vi.fn(() => image),
    };
    const scene = { game: { canvas }, cameras: { main: camera }, add, textures } as never;
    const runtime = new LifeRuntime(scene);
    expect(runtime.snapshot().tick).toBe(0);
    runtime.destroy();
  });
});
