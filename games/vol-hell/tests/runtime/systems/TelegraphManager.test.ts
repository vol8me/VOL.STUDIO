import { describe, it, expect, vi } from 'vitest';
import { TelegraphManager, type TelegraphShape } from '@/runtime/systems/TelegraphManager';

function makeGraphics() {
  return {
    setDepth: vi.fn(),
    clear: vi.fn(),
    fillStyle: vi.fn(),
    lineStyle: vi.fn(),
    fillCircle: vi.fn(),
    strokeCircle: vi.fn(),
    fillPath: vi.fn(),
    strokePath: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    destroy: vi.fn(),
  };
}

function makeScene() {
  return {
    add: {
      graphics: vi.fn(makeGraphics),
    },
  } as never;
}

describe('TelegraphManager', () => {
  it('play uyarı çizer ve süre dolunca complete=true ile çözülür', async () => {
    const manager = new TelegraphManager(makeScene());
    const handle = manager.play({
      durationMs: 500,
      shape: 'circle' as TelegraphShape,
      x: 100,
      y: 100,
      radius: 50,
    });

    expect(manager.getActiveCount()).toBe(1);

    manager.update(400);
    manager.update(200);

    await expect(handle.promise).resolves.toEqual({ completed: true });
    expect(manager.getActiveCount()).toBe(0);
  });

  it('süre dolmadan resolve olmaz', async () => {
    const manager = new TelegraphManager(makeScene());
    const handle = manager.play({
      durationMs: 300,
      shape: 'circle' as TelegraphShape,
      x: 0,
      y: 0,
      radius: 10,
    });

    manager.update(299);

    let resolved = false;
    handle.promise.then(() => (resolved = true));
    await Promise.resolve();

    expect(resolved).toBe(false);
    expect(manager.getActiveCount()).toBe(1);
  });

  it('cancelAll bekleyen telegraphları siler ve complete=false ile çözer', async () => {
    const manager = new TelegraphManager(makeScene());
    const handle = manager.play({
      durationMs: 300,
      shape: 'circle' as TelegraphShape,
      x: 0,
      y: 0,
      radius: 10,
    });

    manager.cancelAll();
    manager.update(500);

    await expect(handle.promise).resolves.toEqual({ completed: false });
    expect(manager.getActiveCount()).toBe(0);
  });

  it('handle.cancel() tek bir telegraphı complete=false ile çözer', async () => {
    const manager = new TelegraphManager(makeScene());
    const a = manager.play({
      durationMs: 500,
      shape: 'circle' as TelegraphShape,
      x: 0,
      y: 0,
      radius: 10,
    });
    const b = manager.play({
      durationMs: 500,
      shape: 'circle' as TelegraphShape,
      x: 100,
      y: 100,
      radius: 20,
    });

    a.cancel();

    await expect(a.promise).resolves.toEqual({ completed: false });
    expect(manager.getActiveCount()).toBe(1);

    manager.update(500);

    await expect(b.promise).resolves.toEqual({ completed: true });
    expect(manager.getActiveCount()).toBe(0);
  });

  it('birden fazla telegraph aynı anda yaşayabilir', async () => {
    const manager = new TelegraphManager(makeScene());
    const a = manager.play({
      durationMs: 200,
      shape: 'circle' as TelegraphShape,
      x: 0,
      y: 0,
      radius: 10,
    });
    const b = manager.play({
      durationMs: 400,
      shape: 'circle' as TelegraphShape,
      x: 100,
      y: 100,
      radius: 20,
    });

    expect(manager.getActiveCount()).toBe(2);

    manager.update(200);
    await expect(a.promise).resolves.toEqual({ completed: true });
    expect(manager.getActiveCount()).toBe(1);

    manager.update(200);
    await expect(b.promise).resolves.toEqual({ completed: true });
    expect(manager.getActiveCount()).toBe(0);
  });

  it('destroy cancelAll ile aynı temizliği yapar', async () => {
    const manager = new TelegraphManager(makeScene());
    const handle = manager.play({
      durationMs: 300,
      shape: 'circle' as TelegraphShape,
      x: 0,
      y: 0,
      radius: 10,
    });

    manager.destroy();

    await expect(handle.promise).resolves.toEqual({ completed: false });
    expect(manager.getActiveCount()).toBe(0);
  });
});
