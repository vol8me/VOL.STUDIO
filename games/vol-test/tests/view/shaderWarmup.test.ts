import Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { warmShaders } from '@/view/shaderWarmup';

type Listener = () => void;

/** WebGL'li sahne sahtesi: POST_UPDATE olaylarını elle sürer. */
function webglScene(maxTextures = 16) {
  const listeners = new Set<Listener>();
  const images: Array<{ visible: boolean; destroyed: boolean }> = [];
  const keys = new Set<string>();
  const scene = {
    sys: { game: { renderer: { type: Phaser.WEBGL, maxTextures } } },
    textures: {
      exists: (key: string) => keys.has(key),
      addCanvas: vi.fn((key: string) => keys.add(key)),
      remove: vi.fn((key: string) => keys.delete(key)),
    },
    add: {
      image: () => {
        const image = { visible: true, destroyed: false };
        images.push(image);
        const chain = {
          setOrigin: () => chain,
          setScrollFactor: () => chain,
          setAlpha: () => chain,
          setVisible: (value: boolean) => {
            image.visible = value;
            return chain;
          },
          destroy: () => {
            image.destroyed = true;
          },
        };
        return chain;
      },
    },
    events: {
      on: (_name: string, listener: Listener) => listeners.add(listener),
      off: (_name: string, listener: Listener) => listeners.delete(listener),
    },
  };
  return {
    scene: scene as unknown as Phaser.Scene,
    images,
    keys,
    frame: () => [...listeners].forEach((listener) => listener()),
    listening: () => listeners.size,
  };
}

describe('warmShaders', () => {
  it('WebGL yokken (sahte bağlam, tuval) hemen döner', () => {
    const done = vi.fn();
    warmShaders({ sys: { game: { renderer: { type: Phaser.CANVAS } } } } as never, done);
    warmShaders({} as never, done);
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('her karede bir doku daha gösterir: 1..N farklı dokulu toplu çizim, sonra temizler ve döner', () => {
    const fake = webglScene(4);
    const done = vi.fn();
    warmShaders(fake.scene, done);
    expect(fake.images).toHaveLength(4);
    expect(fake.images.every((image) => !image.visible)).toBe(true);
    const visibleCounts: number[] = [];
    for (let frame = 0; frame < 4; frame++) {
      fake.frame();
      visibleCounts.push(fake.images.filter((image) => image.visible).length);
    }
    expect(visibleCounts).toEqual([1, 2, 3, 4]);
    expect(done).not.toHaveBeenCalled();
    fake.frame();
    expect(done).toHaveBeenCalledTimes(1);
    expect(fake.images.every((image) => image.destroyed)).toBe(true);
    expect(fake.keys.size).toBe(0);
    expect(fake.listening()).toBe(0);
  });

  it('birim sayısını 16 ile sınırlar; çok büyük bildirilse de 16 kademeyi ısıtır', () => {
    const fake = webglScene(64);
    warmShaders(fake.scene, () => undefined);
    expect(fake.images).toHaveLength(16);
  });
});
