import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type Phaser from 'phaser';
import { PhaserCursorManager, VolCursorTheme } from '../../../src/input/cursor';

type MockFn<TArgs extends unknown[] = [], TReturn = unknown> = Mock<(...args: TArgs) => TReturn>;

interface FakeGraphics {
  clear: MockFn;
  lineStyle: MockFn;
  beginPath: MockFn;
  strokePath: MockFn;
  moveTo: MockFn;
  lineTo: MockFn;
  arc: MockFn;
  closePath: MockFn;
}

interface FakeContainer {
  setPosition: MockFn;
  setDepth: MockFn;
  destroy: MockFn;
  setScale: MockFn;
  setAngle: MockFn;
}

interface FakeTween {
  stop: MockFn;
  destroy: MockFn;
}

interface FakeScene {
  add: {
    graphics: MockFn<[], FakeGraphics>;
    container: MockFn<[], FakeContainer>;
  };
  tweens: { add: MockFn<[], FakeTween> };
  events: { on: MockFn; off: MockFn };
  input: {
    activePointer: { x: number; y: number };
    setDefaultCursor: MockFn<[], void>;
    manager: { defaultCursor: string };
  };
}

function createFakeScene(): FakeScene {
  const graphics: FakeGraphics = {
    clear: vi.fn(),
    lineStyle: vi.fn(),
    beginPath: vi.fn(),
    strokePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
  };

  const container: FakeContainer = {
    setPosition: vi.fn(),
    setDepth: vi.fn(),
    destroy: vi.fn(),
    setScale: vi.fn(),
    setAngle: vi.fn(),
  };

  const tweens = {
    add: vi.fn().mockReturnValue({ stop: vi.fn(), destroy: vi.fn() }),
  };

  const events = { on: vi.fn(), off: vi.fn() };

  const pointer = { x: 100, y: 200 };

  const input = {
    activePointer: pointer,
    setDefaultCursor: vi.fn(),
    manager: { defaultCursor: 'default' },
  };

  return {
    add: {
      graphics: vi.fn().mockReturnValue(graphics),
      container: vi.fn().mockReturnValue(container),
    },
    tweens,
    events,
    input,
  };
}

describe('PhaserCursorManager', () => {
  let fakeScene: FakeScene;

  beforeEach(() => {
    fakeScene = createFakeScene();
  });

  it('kurulur ve sahneye graphics/container ekler', () => {
    const manager = new PhaserCursorManager(fakeScene as unknown as Phaser.Scene, VolCursorTheme);
    expect(fakeScene.add.graphics).toHaveBeenCalled();
    expect(fakeScene.add.container).toHaveBeenCalled();
    expect(fakeScene.events.on).toHaveBeenCalledWith('update', expect.any(Function));
    manager.destroy();
  });

  it('set cursoru çizdirir ve pointer takibi yapar', () => {
    const manager = new PhaserCursorManager(fakeScene as unknown as Phaser.Scene, VolCursorTheme);
    manager.set('pointer');
    expect(fakeScene.add.graphics().lineStyle).toHaveBeenCalled();
    expect(fakeScene.add.graphics().beginPath).toHaveBeenCalled();
    manager.destroy();
  });

  it('reset default cursora döner', () => {
    const manager = new PhaserCursorManager(fakeScene as unknown as Phaser.Scene, VolCursorTheme);
    manager.set('pointer');
    manager.reset();
    expect(manager.current?.id).toBe('default');
    manager.destroy();
  });

  it('setTheme mevcut cursoru yeniden çizer', () => {
    const manager = new PhaserCursorManager(fakeScene as unknown as Phaser.Scene, VolCursorTheme);
    manager.set('pointer');
    manager.setTheme(VolCursorTheme);
    expect(fakeScene.add.graphics().clear).toHaveBeenCalled();
    manager.destroy();
  });

  it('destroy sahne olaylarını kaldırır', () => {
    const manager = new PhaserCursorManager(fakeScene as unknown as Phaser.Scene, VolCursorTheme);
    manager.destroy();
    expect(fakeScene.events.off).toHaveBeenCalledWith('update', expect.any(Function));
  });

  it('sahne cursorunu gizler ve destroyda eski haline getirir', () => {
    const manager = new PhaserCursorManager(fakeScene as unknown as Phaser.Scene, VolCursorTheme);
    expect(fakeScene.input.setDefaultCursor).toHaveBeenCalledWith('none');
    manager.destroy();
    expect(fakeScene.input.setDefaultCursor).toHaveBeenCalledWith('default');
  });
});
