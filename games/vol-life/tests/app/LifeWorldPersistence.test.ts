import { describe, expect, it, vi } from 'vitest';
import type { SaveManager } from '@volstudio/core';
import { particleConfig } from '@/config/particles';
import { worldConfig } from '@/config/world';
import {
  LifeWorldAutosave,
  LifeWorldPersistence,
  createWorldConfigFingerprint,
} from '@/app/LifeWorldPersistence';
import { decodeLifeWorldSnapshot, encodeLifeWorldSnapshot } from '@/app/LifeWorldSnapshotCodec';
import { LifeWorld } from '@/runtime/sim/LifeWorld';

function memorySaveManager(initial: unknown = null) {
  let value = initial;
  const manager = {
    load: vi.fn(() => Promise.resolve(value)),
    save: vi.fn((_key: string, next: unknown) => {
      value = next;
      return Promise.resolve();
    }),
  };
  return { manager, saveManager: manager as unknown as SaveManager, read: () => value };
}

describe('LifeWorldSnapshotCodec', () => {
  it('snapshotı sürümlü küçük-endian ikili yükte kayıpsız döndürür', async () => {
    const world = new LifeWorld({ ...worldConfig, fieldResolution: 8, seed: 42 });
    for (let index = 0; index < 20; index++) world.step();
    const snapshot = world.snapshot();
    const envelope = await encodeLifeWorldSnapshot(snapshot, 'fingerprint');

    const decoded = await decodeLifeWorldSnapshot(envelope, 'fingerprint');

    expect(decoded).toEqual(snapshot);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.encoding).toMatch(/base64/);
  });

  it('farklı yapılandırma parmak izini ve bozuk yükü dünyaya uygulamaz', async () => {
    const snapshot = new LifeWorld({ ...worldConfig, fieldResolution: 8 }).snapshot();
    const envelope = await encodeLifeWorldSnapshot(snapshot, 'current');

    expect(await decodeLifeWorldSnapshot(envelope, 'changed')).toBeNull();
    await expect(
      decodeLifeWorldSnapshot({ ...envelope, payload: 'bozuk!' }, 'current'),
    ).rejects.toThrow();
  });

  it('geçersiz snapshot alanlarında RangeError fırlatır', async () => {
    const valid = new LifeWorld({ ...worldConfig, fieldResolution: 8 }).snapshot();
    await expect(encodeLifeWorldSnapshot({ ...valid, tick: -1 }, 'test')).rejects.toThrow(
      RangeError,
    );
    await expect(
      encodeLifeWorldSnapshot(
        { ...valid, particles: { ...valid.particles, x: new Float32Array(1) } },
        'test',
      ),
    ).rejects.toThrow(RangeError);
  });

  it('bozuk veya geçersiz ikili zarfta null döner veya RangeError fırlatır', async () => {
    expect(await decodeLifeWorldSnapshot(null, 'test')).toBeNull();
    expect(await decodeLifeWorldSnapshot('string', 'test')).toBeNull();
    expect(await decodeLifeWorldSnapshot({ schemaVersion: 2 }, 'test')).toBeNull();
    expect(
      await decodeLifeWorldSnapshot(
        { schemaVersion: 1, configFingerprint: 'test', encoding: 'invalid', payload: '' },
        'test',
      ),
    ).toBeNull();

    // Kısa başlık (HEADER_BYTES < 32)
    const shortBytes = new Uint8Array(10);
    const shortPayload = Buffer.from(shortBytes).toString('base64');
    await expect(
      decodeLifeWorldSnapshot(
        { schemaVersion: 1, configFingerprint: 'test', encoding: 'base64', payload: shortPayload },
        'test',
      ),
    ).rejects.toThrow(RangeError);

    // Yanlış sihirli sayı
    const invalidMagic = new Uint8Array(32);
    const invalidPayload = Buffer.from(invalidMagic).toString('base64');
    await expect(
      decodeLifeWorldSnapshot(
        {
          schemaVersion: 1,
          configFingerprint: 'test',
          encoding: 'base64',
          payload: invalidPayload,
        },
        'test',
      ),
    ).rejects.toThrow(RangeError);
  });
});

describe('LifeWorldPersistence', () => {
  it('aynı yapılandırmada kaydeder ve yeniden yükler', async () => {
    const memory = memorySaveManager();
    const persistence = new LifeWorldPersistence(memory.saveManager, worldConfig, particleConfig);
    const snapshot = new LifeWorld({ ...worldConfig, fieldResolution: 8 }).snapshot();

    await persistence.save(snapshot);

    expect(await persistence.load()).toEqual(snapshot);
    expect(memory.manager.save).toHaveBeenCalledWith('vol-life:world', memory.read());
  });

  it('parmak izi fizik ve dünya yapılandırmasının ikisine de bağlıdır', () => {
    const baseline = createWorldConfigFingerprint(worldConfig, particleConfig);

    expect(
      createWorldConfigFingerprint({ ...worldConfig, seed: worldConfig.seed + 1 }, particleConfig),
    ).not.toBe(baseline);
    expect(
      createWorldConfigFingerprint(worldConfig, {
        ...particleConfig,
        frictionPerReferenceTick: 0.9,
      }),
    ).not.toBe(baseline);
  });
});

describe('LifeWorldAutosave', () => {
  it('periyodik ve arka plan kayıtlarını tek kuyrukta birleştirip kapanışta son durumu alır', async () => {
    vi.useFakeTimers();
    const visibilityListeners: Array<(state: 'foreground' | 'background') => void> = [];
    let tick = 0;
    const source = {
      snapshot: () => {
        const world = new LifeWorld({ ...worldConfig, fieldResolution: 8, seed: ++tick });
        return world.snapshot();
      },
    };
    const save = vi.fn(() => Promise.resolve());
    const autosave = new LifeWorldAutosave({ save }, source, {
      intervalMs: 100,
      observeVisibility: (listener) => {
        visibilityListeners.push(listener);
        return () => {
          visibilityListeners.splice(visibilityListeners.indexOf(listener), 1);
        };
      },
    });

    await vi.advanceTimersByTimeAsync(100);
    visibilityListeners[0]?.('background');
    await autosave.flush();
    autosave.destroy();
    await Promise.resolve();

    expect(save.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(visibilityListeners).toHaveLength(0);
    vi.useRealTimers();
  });

  it('attach metodu persistence üzerinden LifeWorldAutosave örneği bağlar', () => {
    const memory = memorySaveManager();
    const persistence = new LifeWorldPersistence(memory.saveManager, worldConfig, particleConfig);
    const source = {
      snapshot: () => new LifeWorld({ ...worldConfig, fieldResolution: 8 }).snapshot(),
    };
    const autosave = persistence.attach(source, { intervalMs: 10_000 });
    expect(autosave).toBeInstanceOf(LifeWorldAutosave);
    autosave.destroy();
  });

  it('geçersiz otomatik kayıt aralığında RangeError fırlatır', () => {
    const save = vi.fn(() => Promise.resolve());
    const source = {
      snapshot: () => new LifeWorld({ ...worldConfig, fieldResolution: 8 }).snapshot(),
    };
    expect(() => new LifeWorldAutosave({ save }, source, { intervalMs: 0 })).toThrow(RangeError);
    expect(() => new LifeWorldAutosave({ save }, source, { intervalMs: -10 })).toThrow(RangeError);
  });

  it('kayıt hatasında onError callbackini çağırır ve çökmez', async () => {
    const saveError = new Error('Disk dolu');
    const save = vi.fn(() => Promise.reject(saveError));
    const onError = vi.fn();
    const source = {
      snapshot: () => new LifeWorld({ ...worldConfig, fieldResolution: 8 }).snapshot(),
    };
    const autosave = new LifeWorldAutosave({ save }, source, { onError, intervalMs: 10_000 });

    await autosave.flush();
    expect(onError).toHaveBeenCalledWith(saveError);
    autosave.destroy();
  });

  it('load sırasında saveManager hata fırlatırsa null döner', async () => {
    const failingManager = {
      load: vi.fn(() => Promise.reject(new Error('Depolama arızası'))),
      save: vi.fn(() => Promise.resolve()),
    };
    const persistence = new LifeWorldPersistence(
      failingManager as unknown as SaveManager,
      worldConfig,
      particleConfig,
    );
    const result = await persistence.load();
    expect(result).toBeNull();
  });
});
