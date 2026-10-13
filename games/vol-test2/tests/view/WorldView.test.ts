import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import type { FactoryController } from '../../src/app/FactoryController';
import { FactoryController as Controller } from '../../src/app/FactoryController';
import { BELT, ITEM, KIND, UNIT_KIND, WORLD } from '../../src/config/factory';
import { VIEW } from '../../src/config/game';
import { WorldView } from '../../src/view/WorldView';
import { place, smallSim } from '../helpers/world';

function fakeGraphics() {
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string) =>
    vi.fn((...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return graphics;
    });
  const graphics: Record<string, unknown> = {
    calls,
    setDepth: vi.fn(() => graphics),
    destroy: vi.fn(),
  };
  for (const name of [
    'clear',
    'fillStyle',
    'fillRect',
    'fillCircle',
    'lineStyle',
    'lineBetween',
    'strokeRect',
    'fillTriangle',
  ])
    graphics[name] = record(name);
  return graphics as unknown as Phaser.GameObjects.Graphics & {
    calls: Record<string, unknown[][]>;
  };
}

function fakeScene(view: { x: number; y: number; width: number; height: number }, zoom = 1) {
  const textures = new Map<string, { context: unknown; refresh: ReturnType<typeof vi.fn> }>();
  const images: { destroy: ReturnType<typeof vi.fn> }[] = [];
  const graphics: ReturnType<typeof fakeGraphics>[] = [];
  const scene = {
    cameras: { main: { worldView: view, zoom } },
    textures: {
      createCanvas: vi.fn((key: string) => {
        const context = {
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          strokeRect: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          closePath: vi.fn(),
          arc: vi.fn(),
          fill: vi.fn(),
          fillStyle: '',
          strokeStyle: '',
        };
        const texture = { context, refresh: vi.fn(), setFilter: vi.fn() };
        textures.set(key, texture);
        return texture;
      }),
      remove: vi.fn((key: string) => textures.delete(key)),
    },
    add: {
      image: vi.fn(() => {
        const image = {
          destroy: vi.fn(),
          setOrigin: () => image,
          setDepth: () => image,
        };
        images.push(image);
        return image;
      }),
      graphics: vi.fn(() => {
        const g = fakeGraphics();
        graphics.push(g);
        return g;
      }),
    },
  };
  return { scene: scene as unknown as Phaser.Scene, raw: scene, textures, images, graphics };
}

function controllerFor(sim: ReturnType<typeof smallSim>): FactoryController {
  const session = {
    lockstep: { sim, status: 'running', lagTicks: 4, players: 1 },
    status: 'live',
    rttMs: 0,
    submit: vi.fn(),
    advance: vi.fn(),
    resync: vi.fn(),
    nextCommandSeq: 1,
  };
  return new Controller(session as never, () => {});
}

const CHUNK_PX = WORLD.chunk * VIEW.tilePx;

describe('WorldView', () => {
  it('yalnız görünür chunk dokularını kurar ve yalnız bir kez çizer', () => {
    const sim = smallSim();
    const fake = fakeScene({ x: 0, y: 0, width: CHUNK_PX * 2 - 1, height: CHUNK_PX - 1 });
    const view = new WorldView(fake.scene, controllerFor(sim));
    view.update();
    expect(view.textureCount).toBe(2);
    const first = [...fake.textures.values()][0];
    expect(first.refresh).toHaveBeenCalledTimes(1);
    view.update();
    expect(first.refresh).toHaveBeenCalledTimes(1);
  });

  it('chunk sürümü artınca yeniden çizer', () => {
    const sim = smallSim();
    const fake = fakeScene({ x: 0, y: 0, width: CHUNK_PX - 1, height: CHUNK_PX - 1 });
    const view = new WorldView(fake.scene, controllerFor(sim));
    view.update();
    const texture = [...fake.textures.values()][0];
    expect(texture.refresh).toHaveBeenCalledTimes(1);
    place(sim, 2, 2, KIND.wall);
    sim.state.chunkVersion[0]++;
    view.update();
    expect(texture.refresh).toHaveBeenCalledTimes(2);
  });

  it('kare başına yeniden çizim bütçesini aşmaz', () => {
    const sim = smallSim();
    const fake = fakeScene({ x: 0, y: 0, width: CHUNK_PX * 4 - 1, height: CHUNK_PX * 4 - 1 });
    const view = new WorldView(fake.scene, controllerFor(sim));
    view.update();
    const refreshes = [...fake.textures.values()].reduce(
      (sum, texture) => sum + texture.refresh.mock.calls.length,
      0,
    );
    expect(refreshes).toBe(VIEW.chunkRedrawBudget);
    view.update();
    const total = [...fake.textures.values()].reduce(
      (sum, texture) => sum + texture.refresh.mock.calls.length,
      0,
    );
    expect(total).toBe(16);
  });

  it('yeni durum nesnesi gelince bütün dokular yeniden çizilir', () => {
    const first = smallSim();
    const fake = fakeScene({ x: 0, y: 0, width: CHUNK_PX - 1, height: CHUNK_PX - 1 });
    const holder = { sim: first };
    const controller = controllerFor(first);
    Object.defineProperty(controller, 'sim', { get: () => holder.sim });
    const view = new WorldView(fake.scene, controller);
    view.update();
    const texture = [...fake.textures.values()][0];
    expect(texture.refresh).toHaveBeenCalledTimes(1);
    holder.sim = smallSim();
    view.update();
    expect(texture.refresh).toHaveBeenCalledTimes(2);
  });

  it('simülasyon yokken katmanları temizler ve çizmez', () => {
    const sim = smallSim();
    const fake = fakeScene({ x: 0, y: 0, width: 100, height: 100 });
    const controller = controllerFor(sim);
    Object.defineProperty(controller, 'sim', { get: () => null });
    const view = new WorldView(fake.scene, controller);
    view.update();
    expect(fake.textures.size).toBe(0);
    expect(fake.graphics[0].calls.clear).toHaveLength(1);
    expect(fake.graphics[0].calls.fillRect).toBeUndefined();
  });

  it('doku sınırı aşılınca görünmeyen en eski chunk düşer, görünen kalır', () => {
    const sim = smallSim();
    const camera = { x: 0, y: 0, width: CHUNK_PX - 1, height: CHUNK_PX - 1 };
    const fake = fakeScene(camera);
    const view = new WorldView(fake.scene, controllerFor(sim), VIEW.tilePx, 2);
    for (let cx = 0; cx < 4; cx++) {
      camera.x = cx * CHUNK_PX;
      view.update();
    }
    expect(view.textureCount).toBe(2);
    // En eski iki chunk (0 ve 1) düştü; son ikisi ve görünen kaldı.
    expect(fake.raw.textures.remove).toHaveBeenCalledWith('factory-chunk-0');
    expect(fake.raw.textures.remove).toHaveBeenCalledWith('factory-chunk-1');
    expect(fake.textures.has('factory-chunk-3')).toBe(true);
  });

  it('bant eşyalarını yakında çizer, uzaktan çizmez', () => {
    const sim = smallSim();
    place(sim, 5, 5, KIND.conveyor, 0);
    const s = sim.state;
    const tile = s.index(5, 5);
    s.beltCount[tile] = 2;
    s.beltItem[tile * BELT.slots] = ITEM.ore;
    s.beltItem[tile * BELT.slots + 1] = ITEM.plate;
    s.beltPos[tile * BELT.slots] = 800;
    s.beltPos[tile * BELT.slots + 1] = 300;
    s.rebuildLists();
    const near = fakeScene({ x: 0, y: 0, width: CHUNK_PX, height: CHUNK_PX }, 1);
    new WorldView(near.scene, controllerFor(sim)).update();
    const nearRects = near.graphics[0].calls.fillRect ?? [];
    expect(nearRects).toHaveLength(2);

    const far = fakeScene(
      { x: 0, y: 0, width: CHUNK_PX, height: CHUNK_PX },
      VIEW.detailMinZoom - 0.01,
    );
    new WorldView(far.scene, controllerFor(sim)).update();
    expect(far.graphics[0].calls.fillRect ?? []).toHaveLength(0);
  });

  it('listeler kirliyken (anlık görüntüden hemen sonra) eşya çizmez', () => {
    const sim = smallSim();
    place(sim, 5, 5, KIND.conveyor, 0);
    const s = sim.state;
    s.beltCount[s.index(5, 5)] = 1;
    s.listsDirty = true;
    const fake = fakeScene({ x: 0, y: 0, width: CHUNK_PX, height: CHUNK_PX });
    new WorldView(fake.scene, controllerFor(sim)).update();
    expect(fake.graphics[0].calls.fillRect ?? []).toHaveLength(0);
  });

  it('yaşayan birimleri çizer; hasarlıysa can çubuğu da ekler', () => {
    const sim = smallSim();
    const s = sim.state;
    s.allocateUnit(UNIT_KIND.crawler, 3, 3, 40);
    s.allocateUnit(UNIT_KIND.brute, 5, 5, 20);
    s.allocateUnit(UNIT_KIND.crawler, 50, 50, 40);
    const fake = fakeScene({ x: 0, y: 0, width: CHUNK_PX, height: CHUNK_PX });
    new WorldView(fake.scene, controllerFor(sim)).update();
    const dynamic = fake.graphics[0].calls;
    expect(dynamic.fillCircle).toHaveLength(2);
    // Yalnız hasar gören domuz için arka plan + can şeridi.
    expect(dynamic.fillRect).toHaveLength(2);
  });

  it('atışları çizgiyle gösterir', () => {
    const sim = smallSim();
    const controller = controllerFor(sim);
    vi.spyOn(controller, 'activeShots').mockReturnValue([
      { tile: sim.state.index(2, 2), targetX: 4, targetY: 4, until: Infinity },
    ]);
    const fake = fakeScene({ x: 0, y: 0, width: CHUNK_PX, height: CHUNK_PX });
    new WorldView(fake.scene, controller).update();
    expect(fake.graphics[0].calls.lineBetween).toEqual([
      [2.5 * VIEW.tilePx, 2.5 * VIEW.tilePx, 4 * VIEW.tilePx, 4 * VIEW.tilePx],
    ]);
  });

  it('imleç önizlemesini ve bekleyen komut hayaletini bindirme katmanına çizer', () => {
    const sim = smallSim();
    const controller = controllerFor(sim);
    controller.select('conveyor');
    vi.spyOn(controller, 'activeGhosts').mockReturnValue([
      { x: 6, y: 6, kind: KIND.wall, rot: 0, seq: 1, until: Infinity },
    ]);
    const fake = fakeScene({ x: 0, y: 0, width: CHUNK_PX, height: CHUNK_PX });
    const view = new WorldView(fake.scene, controller);
    view.hover = { x: 3, y: 3 };
    view.update();
    const overlay = fake.graphics[1].calls;
    expect(overlay.fillRect).toEqual([
      [3 * VIEW.tilePx, 3 * VIEW.tilePx, VIEW.tilePx, VIEW.tilePx],
    ]);
    expect(overlay.fillTriangle).toHaveLength(1);
    expect(overlay.strokeRect).toHaveLength(1);
  });

  it('dünya dışı imleç ya da araçsız durumda önizleme çizmez', () => {
    const sim = smallSim();
    const controller = controllerFor(sim);
    const fake = fakeScene({ x: 0, y: 0, width: CHUNK_PX, height: CHUNK_PX });
    const view = new WorldView(fake.scene, controller);
    view.hover = { x: 3, y: 3 };
    view.update();
    expect(fake.graphics[1].calls.fillRect).toBeUndefined();
    controller.select('wall');
    view.hover = { x: 999, y: 999 };
    view.update();
    expect(fake.graphics[1].calls.fillRect).toBeUndefined();
  });

  it('destroy dokuları ve katmanları serbest bırakır', () => {
    const sim = smallSim();
    const fake = fakeScene({ x: 0, y: 0, width: CHUNK_PX * 2 - 1, height: CHUNK_PX - 1 });
    const view = new WorldView(fake.scene, controllerFor(sim));
    view.update();
    view.destroy();
    expect(view.textureCount).toBe(0);
    expect(fake.images.every((image) => image.destroy.mock.calls.length === 1)).toBe(true);
    expect(fake.raw.textures.remove).toHaveBeenCalledTimes(2);
    for (const g of fake.graphics)
      expect((g as unknown as { destroy: unknown }).destroy).toHaveBeenCalled();
  });
});
