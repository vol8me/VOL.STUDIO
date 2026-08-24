import { describe, it, expect, vi } from 'vitest';
import type Phaser from 'phaser';
import { PhaserCursorContext, VolCursorTheme } from '../../../src/input/cursor';

type MockFn = ReturnType<typeof vi.fn>;

interface FakeGraphics {
  clear: MockFn;
  lineStyle: MockFn;
  fillStyle: MockFn;
  beginPath: MockFn;
  strokePath: MockFn;
  fillPath: MockFn;
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

function createFakeScene() {
  const graphics: FakeGraphics = {
    clear: vi.fn(),
    lineStyle: vi.fn(),
    fillStyle: vi.fn(),
    beginPath: vi.fn(),
    strokePath: vi.fn(),
    fillPath: vi.fn(),
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

  const inputOn = vi.fn();
  const inputOff = vi.fn();

  const scene = {
    add: {
      graphics: vi.fn().mockReturnValue(graphics),
      container: vi.fn().mockReturnValue(container),
    },
    tweens,
    events,
    input: {
      activePointer: pointer,
      setDefaultCursor: vi.fn(),
      manager: { defaultCursor: 'default' },
      on: inputOn,
      off: inputOff,
    },
  };

  return { scene, inputOn, inputOff };
}

function createFakeGameObject(cursorId?: string): Phaser.GameObjects.GameObject {
  const data = new Map<string, unknown>();
  if (cursorId) data.set('cursor', cursorId);
  return {
    getData: (key: string) => data.get(key),
    setData: (key: string, value: unknown) => data.set(key, value),
  } as unknown as Phaser.GameObjects.GameObject;
}

describe('PhaserCursorContext', () => {
  it('sahne inputuna gameobjectover/gameobjectout dinleyici ekler', () => {
    const { scene, inputOn } = createFakeScene();
    const context = new PhaserCursorContext(scene as unknown as Phaser.Scene, VolCursorTheme);

    expect(inputOn).toHaveBeenCalledWith('gameobjectover', expect.any(Function));
    expect(inputOn).toHaveBeenCalledWith('gameobjectout', expect.any(Function));
    context.destroy();
  });

  it('gameobjectover hedefinin cursor data kimliğini uygular', () => {
    const { scene, inputOn } = createFakeScene();
    const context = new PhaserCursorContext(scene as unknown as Phaser.Scene, VolCursorTheme);

    const overCall = inputOn.mock.calls.find(([name]) => name === 'gameobjectover');
    const overHandler = overCall?.[1] as (
      pointer: unknown,
      gameObject: Phaser.GameObjects.GameObject,
    ) => void;
    const enemy = createFakeGameObject('target');
    overHandler({}, enemy);

    expect(context.manager.current?.id).toBe('target');
    context.destroy();
  });

  it('gameobjectout sonrası varsayılan cursora döner', () => {
    const { scene, inputOn } = createFakeScene();
    const context = new PhaserCursorContext(scene as unknown as Phaser.Scene, VolCursorTheme, {
      defaultCursor: 'crosshair',
    });

    const overCall = inputOn.mock.calls.find(([name]) => name === 'gameobjectover');
    const outCall = inputOn.mock.calls.find(([name]) => name === 'gameobjectout');
    const overHandler = overCall?.[1] as (
      pointer: unknown,
      gameObject: Phaser.GameObjects.GameObject,
    ) => void;
    const outHandler = outCall?.[1] as (
      pointer: unknown,
      gameObject: Phaser.GameObjects.GameObject,
    ) => void;

    overHandler({}, createFakeGameObject('target'));
    outHandler({}, createFakeGameObject());

    expect(context.manager.current?.id).toBe('crosshair');
    context.destroy();
  });

  it('destroy dinleyicileri kaldırır', () => {
    const { scene, inputOff } = createFakeScene();
    const context = new PhaserCursorContext(scene as unknown as Phaser.Scene, VolCursorTheme);
    context.destroy();
    expect(inputOff).toHaveBeenCalledWith('gameobjectover', expect.any(Function));
    expect(inputOff).toHaveBeenCalledWith('gameobjectout', expect.any(Function));
  });
});
