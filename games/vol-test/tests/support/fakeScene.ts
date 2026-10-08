import { vi } from 'vitest';

/**
 * Phaser nesnelerinin kayıt tutan sahtesi: her yöntem zincirlenebilir casustur,
 * atanan alanlar okunabilir kalır. Görünüm sınıfları gerçek bir WebGL bağlamı
 * olmadan sürülür; doğrulanan şey çizim değil, simülasyondan görünüme akan değerdir.
 */
export type FakeObject = Record<string, unknown> & {
  readonly calls: Array<[string, unknown[]]>;
  readonly kind: string;
  readonly args: unknown[];
};

export function fakeObject(kind: string, args: unknown[] = []): FakeObject {
  const calls: Array<[string, unknown[]]> = [];
  const state: Record<string, unknown> = { kind, args, calls, visible: true, emitting: false };
  // Poz sözleşmesi (CORE `PoseSourceNode`): kapsayıcı çocuk listesi, görüntü
  // doku ve dünya dönüşümü taşır. Diğer alanlar tanımsız kalır.
  state.list = kind === 'container' ? (args[2] ?? []) : undefined;
  state.texture = kind === 'image' ? { key: args[2] } : undefined;
  state.frame = undefined;
  state.originX = 0.5;
  state.originY = 0.5;
  state.getWorldTransformMatrix = () => ({
    decomposeMatrix: () => ({
      translateX: Number(state.x ?? args[0] ?? 0),
      translateY: Number(state.y ?? args[1] ?? 0),
      rotation: Number(state.rotation ?? 0),
      scaleX: 1,
      scaleY: 1,
    }),
  });
  const proxy: FakeObject = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === 'then') return undefined;
      if (key === 'getAliveParticleCount') return () => Number(target.aliveCount ?? 0);
      const method = (...methodArgs: unknown[]) => {
        calls.push([key, methodArgs]);
        const setter = /^set([A-Z]\w*)$/.exec(key);
        if (setter && methodArgs.length === 1) {
          const field = setter[1].charAt(0).toLowerCase() + setter[1].slice(1);
          target[field] = methodArgs[0];
        }
        if (key === 'setPosition') {
          target.x = methodArgs[0];
          target.y = methodArgs[1];
        }
        return proxy;
      };
      target[key] = method;
      return method;
    },
  }) as FakeObject;
  return proxy;
}

export function lastCall(object: FakeObject, method: string): unknown[] | undefined {
  return object.calls.filter(([name]) => name === method).at(-1)?.[1];
}

export interface FakeScene {
  readonly created: FakeObject[];
  readonly add: Record<string, (...args: unknown[]) => FakeObject>;
  readonly textures: {
    exists: (key: string) => boolean;
    addCanvas: ReturnType<typeof vi.fn>;
    addSpriteSheet: ReturnType<typeof vi.fn>;
    get: (key: string) => { getSourceImage: () => HTMLCanvasElement };
  };
  readonly load: { svg: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };
}

export function fakeScene(): FakeScene {
  const created: FakeObject[] = [];
  const factory =
    (kind: string) =>
    (...args: unknown[]): FakeObject => {
      const object = fakeObject(kind, args);
      created.push(object);
      return object;
    };
  const add = new Proxy(
    {},
    {
      get: (_target, kind: string) => factory(kind),
    },
  );
  const textureKeys = new Set<string>();
  return {
    created,
    add,
    textures: {
      exists: (key) => textureKeys.has(key),
      addCanvas: vi.fn((key: string, canvas: HTMLCanvasElement) => {
        textureKeys.add(key);
        return { key, getSourceImage: () => canvas };
      }),
      addSpriteSheet: vi.fn((key: string) => textureKeys.add(key)),
      get: () => ({ getSourceImage: () => document.createElement('canvas') }),
    },
    load: { svg: vi.fn(), on: vi.fn() },
  };
}
