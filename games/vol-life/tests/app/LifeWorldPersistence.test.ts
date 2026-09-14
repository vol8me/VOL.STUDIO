import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';

function createWorld(config = worldConfig, seed = 42): LifeWorld {
  return new LifeWorld(config, createExplicitWorldMetadata(seed));
}

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LifeWorldSnapshotCodec', () => {
  it('snapshotı sürümlü küçük-endian ikili yükte kayıpsız döndürür', async () => {
    const world = createWorld({ ...worldConfig, fieldResolution: 8 });
    for (let index = 0; index < 20; index++) world.step();
    const snapshot = world.snapshot();
    const envelope = await encodeLifeWorldSnapshot(snapshot, 'fingerprint');

    const decoded = await decodeLifeWorldSnapshot(envelope, 'fingerprint');

    expect(decoded).toEqual(snapshot);
    expect(envelope.schemaVersion).toBe(2);
    expect(envelope.encoding).toMatch(/base64/);
  });

  it('uzunluğu değişmeyen ikili bozulmayı checksum ile reddeder', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const snapshot = createWorld({ ...worldConfig, fieldResolution: 8 }).snapshot();
    const envelope = await encodeLifeWorldSnapshot(snapshot, 'fingerprint');
    const bytes = Buffer.from(envelope.payload, 'base64');
    bytes[40] ^= 0x01;

    await expect(
      decodeLifeWorldSnapshot({ ...envelope, payload: bytes.toString('base64') }, 'fingerprint'),
    ).rejects.toThrow(/checksum/i);
  });

  it('farklı yapılandırma parmak izini ve bozuk yükü dünyaya uygulamaz', async () => {
    const snapshot = createWorld({ ...worldConfig, fieldResolution: 8 }).snapshot();
    const envelope = await encodeLifeWorldSnapshot(snapshot, 'current');

    expect(await decodeLifeWorldSnapshot(envelope, 'changed')).toBeNull();
    await expect(
      decodeLifeWorldSnapshot({ ...envelope, payload: 'bozuk!' }, 'current'),
    ).rejects.toThrow();
  });

  it('gzip kaydını açacak platform desteği yoksa yeni dünyaya düşer', async () => {
    const snapshot = createWorld({ ...worldConfig, fieldResolution: 8 }).snapshot();
    const envelope = await encodeLifeWorldSnapshot(snapshot, 'current');
    expect(envelope.encoding).toBe('gzip-base64');
    vi.stubGlobal('DecompressionStream', undefined);

    await expect(decodeLifeWorldSnapshot(envelope, 'current')).resolves.toBeNull();
  });

  it('payload bildirilen ikili uzunlukla uyuşmazsa reddeder', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const snapshot = createWorld({ ...worldConfig, fieldResolution: 8 }).snapshot();
    const envelope = await encodeLifeWorldSnapshot(snapshot, 'current');

    await expect(
      decodeLifeWorldSnapshot({ ...envelope, payload: envelope.payload.slice(0, -4) }, 'current'),
    ).rejects.toThrow(/uzunluğu/i);
  });

  it('geçersiz snapshot alanlarında RangeError fırlatır', async () => {
    const valid = createWorld({ ...worldConfig, fieldResolution: 8 }).snapshot();
    await expect(encodeLifeWorldSnapshot({ ...valid, tick: -1 }, 'test')).rejects.toThrow(
      RangeError,
    );
    await expect(
      encodeLifeWorldSnapshot(
        { ...valid, particles: { ...valid.particles, x: new Float32Array(1) } },
        'test',
      ),
    ).rejects.toThrow(RangeError);
    const nonFinite = valid.fields.light.slice();
    nonFinite[0] = Number.NaN;
    await expect(
      encodeLifeWorldSnapshot({ ...valid, fields: { ...valid.fields, light: nonFinite } }, 'test'),
    ).rejects.toThrow(RangeError);
  });

  it('bozuk veya geçersiz ikili zarfta null döner veya RangeError fırlatır', async () => {
    expect(await decodeLifeWorldSnapshot(null, 'test')).toBeNull();
    expect(await decodeLifeWorldSnapshot('string', 'test')).toBeNull();
    expect(await decodeLifeWorldSnapshot({ schemaVersion: 1 }, 'test')).toBeNull();
    expect(
      await decodeLifeWorldSnapshot(
        { schemaVersion: 2, configFingerprint: 'test', encoding: 'invalid', payload: '' },
        'test',
      ),
    ).toBeNull();

    // Kısa başlık (HEADER_BYTES < 32)
    const shortBytes = new Uint8Array(10);
    const shortPayload = Buffer.from(shortBytes).toString('base64');
    await expect(
      decodeLifeWorldSnapshot(
        {
          schemaVersion: 2,
          configFingerprint: 'test',
          encoding: 'base64',
          byteLength: shortBytes.byteLength,
          checksum: 'crc32-00000000',
          payload: shortPayload,
        },
        'test',
      ),
    ).rejects.toThrow(RangeError);

    // Yanlış sihirli sayı
    const invalidMagic = new Uint8Array(32);
    const invalidPayload = Buffer.from(invalidMagic).toString('base64');
    await expect(
      decodeLifeWorldSnapshot(
        {
          schemaVersion: 2,
          configFingerprint: 'test',
          encoding: 'base64',
          byteLength: invalidMagic.byteLength,
          checksum: 'crc32-00000000',
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
    const testWorldConfig = { ...worldConfig, fieldResolution: 8 };
    const persistence = new LifeWorldPersistence(
      memory.saveManager,
      testWorldConfig,
      particleConfig,
    );
    const snapshot = createWorld(testWorldConfig).snapshot();

    await persistence.save(snapshot);

    expect(await persistence.load()).toEqual(snapshot);
    expect(memory.manager.save).toHaveBeenCalledWith('vol-life:world', memory.read());
  });

  it('parmak izi fizik ve dünya yapılandırmasına bağlı, instance seedinden bağımsızdır', () => {
    const baseline = createWorldConfigFingerprint(worldConfig, particleConfig);

    expect(createWorldConfigFingerprint(worldConfig, particleConfig)).toBe(baseline);
    expect(createWorld(worldConfig, 1).snapshot().metadata.seed).not.toBe(
      createWorld(worldConfig, 2).snapshot().metadata.seed,
    );
    expect(
      createWorldConfigFingerprint(worldConfig, {
        ...particleConfig,
        frictionPerReferenceTick: 0.9,
      }),
    ).not.toBe(baseline);
  });

  it('kurulum yapılandırmasını sonradan yapılan dış mutasyondan yalıtır', async () => {
    const memory = memorySaveManager();
    const config = {
      ...worldConfig,
      boundsUnits: { ...worldConfig.boundsUnits },
      fieldResolution: 8,
    };
    const interactionMatrix = particleConfig.interactionMatrix.slice();
    const particles = { ...particleConfig, interactionMatrix };
    const persistence = new LifeWorldPersistence(memory.saveManager, config, particles);
    const snapshot = createWorld(config).snapshot();

    config.fieldResolution = 16;
    interactionMatrix.fill(Number.NaN);

    await expect(persistence.save(snapshot)).resolves.toBeUndefined();
    await expect(persistence.load()).resolves.toEqual(snapshot);
  });

  it('parmak izi üretmeden önce geçersiz fizik yapılandırmasını reddeder', () => {
    expect(() =>
      createWorldConfigFingerprint({ ...worldConfig, fixedStepMs: Number.NaN }, particleConfig),
    ).toThrow(RangeError);
    expect(() =>
      createWorldConfigFingerprint(worldConfig, {
        ...particleConfig,
        frictionPerReferenceTick: Number.NaN,
      }),
    ).toThrow(RangeError);
  });

  it('checksumı doğru olsa da sınır dışındaki parçacığı yüklemez', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const testWorldConfig = { ...worldConfig, fieldResolution: 8 };
    const snapshot = createWorld(testWorldConfig).snapshot();
    const x = snapshot.particles.x.slice();
    x[0] = testWorldConfig.boundsUnits.x - 1;
    const envelope = await encodeLifeWorldSnapshot(
      {
        ...snapshot,
        particles: { ...snapshot.particles, x },
      },
      createWorldConfigFingerprint(testWorldConfig, particleConfig),
    );
    const memory = memorySaveManager(envelope);
    const persistence = new LifeWorldPersistence(
      memory.saveManager,
      testWorldConfig,
      particleConfig,
    );

    await expect(persistence.load()).resolves.toBeNull();
  });

  it('yapılandırmayla ayrışan alan, parçacık, hız, tür ve bant verisini kaydetmez', async () => {
    const memory = memorySaveManager();
    const persistence = new LifeWorldPersistence(memory.saveManager, worldConfig, particleConfig);
    const snapshot = createWorld().snapshot();
    const shortField = snapshot.fields.light.slice(1);
    const shortX = snapshot.particles.x.slice(1);
    const fastVx = snapshot.particles.vx.slice();
    fastVx[0] = particleConfig.maxSpeedUnitsPerReferenceTick * 2;
    const invalidType = snapshot.particles.type.slice();
    invalidType[0] = 247;
    const invalidSnapshots = [
      { ...snapshot, metadata: { ...snapshot.metadata, seed: -1 } },
      { ...snapshot, fields: { ...snapshot.fields, light: shortField } },
      { ...snapshot, particles: { ...snapshot.particles, x: shortX } },
      { ...snapshot, particles: { ...snapshot.particles, vx: fastVx } },
      { ...snapshot, particles: { ...snapshot.particles, type: invalidType } },
      { ...snapshot, nextFieldBand: worldConfig.fieldUpdateBands },
    ];

    for (const invalid of invalidSnapshots) {
      await expect(persistence.save(invalid)).rejects.toThrow(RangeError);
    }
    expect(memory.manager.save).not.toHaveBeenCalled();
  });
});

describe('LifeWorldAutosave', () => {
  it('periyodik ve arka plan kayıtlarını tek kuyrukta birleştirip kapanışta son durumu alır', async () => {
    vi.useFakeTimers();
    const visibilityListeners: Array<(state: 'foreground' | 'background') => void> = [];
    let tick = 0;
    const source = {
      snapshot: () => {
        const world = createWorld({ ...worldConfig, fieldResolution: 8 }, ++tick);
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
    const testWorldConfig = { ...worldConfig, fieldResolution: 8 };
    const persistence = new LifeWorldPersistence(
      memory.saveManager,
      testWorldConfig,
      particleConfig,
    );
    const source = {
      snapshot: () => createWorld(testWorldConfig).snapshot(),
    };
    const autosave = persistence.attach(source, { intervalMs: 10_000 });
    expect(autosave).toBeInstanceOf(LifeWorldAutosave);
    autosave.destroy();
  });

  it('geçersiz otomatik kayıt aralığında RangeError fırlatır', () => {
    const save = vi.fn(() => Promise.resolve());
    const source = {
      snapshot: () => createWorld({ ...worldConfig, fieldResolution: 8 }).snapshot(),
    };
    expect(() => new LifeWorldAutosave({ save }, source, { intervalMs: 0 })).toThrow(RangeError);
    expect(() => new LifeWorldAutosave({ save }, source, { intervalMs: -10 })).toThrow(RangeError);
  });

  it('görünürlük aboneliği kurulamazsa daha önce açılan intervali geri bırakır', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const source = {
      snapshot: () => createWorld({ ...worldConfig, fieldResolution: 8 }).snapshot(),
    };

    expect(
      () =>
        new LifeWorldAutosave({ save: vi.fn() }, source, {
          intervalMs: 10_000,
          observeVisibility: () => {
            throw new Error('görünürlük kurulamadı');
          },
        }),
    ).toThrow('görünürlük kurulamadı');
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
  });

  it('destroy sonrasında yeni periyodik kayıt kabul etmez', async () => {
    const save = vi.fn(() => Promise.resolve());
    const source = {
      snapshot: () => createWorld({ ...worldConfig, fieldResolution: 8 }).snapshot(),
    };
    const autosave = new LifeWorldAutosave({ save }, source, { intervalMs: 10_000 });

    autosave.destroy();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    autosave.requestSave();
    await Promise.resolve();

    expect(save).toHaveBeenCalledOnce();
  });

  it('kayıt hatasında onError callbackini çağırır ve çökmez', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saveError = new Error('Disk dolu');
    const save = vi.fn(() => Promise.reject(saveError));
    const onError = vi.fn();
    const source = {
      snapshot: () => createWorld({ ...worldConfig, fieldResolution: 8 }).snapshot(),
    };
    const autosave = new LifeWorldAutosave({ save }, source, { onError, intervalMs: 10_000 });

    await expect(autosave.flush()).rejects.toBe(saveError);
    expect(onError).toHaveBeenCalledWith(saveError);
    autosave.destroy();
  });

  it('snapshot üretimi çökerse zamanlayıcıdan hata sızdırmaz ve kullanıcıyı bilgilendirir', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const snapshotError = new Error('snapshot bozuk');
    const onError = vi.fn();
    const autosave = new LifeWorldAutosave(
      { save: vi.fn() },
      {
        snapshot: () => {
          throw snapshotError;
        },
      },
      { onError, intervalMs: 10_000 },
    );

    expect(() => autosave.requestSave()).not.toThrow();
    expect(onError).toHaveBeenCalledWith(snapshotError);
    expect(() => autosave.destroy()).not.toThrow();
  });

  it('flush snapshot hatasını özgün nedeniyle reddeder', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const snapshotError = new Error('snapshot bozuk');
    const autosave = new LifeWorldAutosave(
      { save: vi.fn() },
      {
        snapshot: () => {
          throw snapshotError;
        },
      },
      { intervalMs: 10_000 },
    );

    await expect(autosave.flush()).rejects.toBe(snapshotError);
    autosave.destroy();
  });

  it('kapanış snapshotı üretilemese de dinleyiciyi ve zamanlayıcıyı toplar', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listeners: Array<(state: 'foreground' | 'background') => void> = [];
    const source = {
      snapshot: vi.fn(() => {
        throw new Error('snapshot bozuk');
      }),
    };
    const autosave = new LifeWorldAutosave({ save: vi.fn() }, source, {
      intervalMs: 10_000,
      observeVisibility: (listener) => {
        listeners.push(listener);
        return () => listeners.splice(listeners.indexOf(listener), 1);
      },
    });

    autosave.destroy();
    const callsAtDestroy = source.snapshot.mock.calls.length;
    autosave.requestSave();

    expect(listeners).toHaveLength(0);
    expect(source.snapshot).toHaveBeenCalledTimes(callsAtDestroy);
  });

  it('load sırasında saveManager hata fırlatırsa null döner', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
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

  it('geçersiz intervalMs verildiğinde LifeWorldAutosave RangeError fırlatır', () => {
    const save = vi.fn(() => Promise.resolve());
    const source = { snapshot: () => createWorld().snapshot() };
    expect(() => new LifeWorldAutosave({ save }, source, { intervalMs: 0 })).toThrow(RangeError);
    expect(() => new LifeWorldAutosave({ save }, source, { intervalMs: -100 })).toThrow(RangeError);
    expect(() => new LifeWorldAutosave({ save }, source, { intervalMs: Number.NaN })).toThrow(
      RangeError,
    );
  });

  it('onError callbacki hata fırlattığında console.error ile loglar', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const save = vi.fn(() => Promise.reject(new Error('Kayıt başarısız')));
    const onError = vi.fn(() => {
      throw new Error('Callback patladı');
    });
    const source = {
      snapshot: () => createWorld({ ...worldConfig, fieldResolution: 8 }).snapshot(),
    };
    const autosave = new LifeWorldAutosave({ save }, source, { onError, intervalMs: 10_000 });
    await expect(autosave.flush()).rejects.toThrow('Kayıt başarısız');
    expect(errorSpy).toHaveBeenCalled();
    autosave.destroy();
  });

  it('nextFieldBand sınır dışı olduğunda kaydetmez ve RangeError fırlatır', async () => {
    const memory = memorySaveManager();
    const persistence = new LifeWorldPersistence(memory.saveManager, worldConfig, particleConfig);
    const snapshot = createWorld().snapshot();
    await expect(
      persistence.save({ ...snapshot, nextFieldBand: worldConfig.fieldUpdateBands }),
    ).rejects.toThrow(RangeError);
    await expect(persistence.save({ ...snapshot, nextFieldBand: -1 })).rejects.toThrow(RangeError);
  });
});
