import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SaveManager } from '@volstudio/core';
import { MAX_STABLE_ID } from '@/runtime/sim/ParticleStore';
import {
  cloneSubstrateConfig,
  fingerprintSubstrateConfig,
  substrateConfig,
  type SubstrateConfig,
} from '@/config/substrate';
import { LifeWorldAutosave, LifeWorldPersistence } from '@/app/LifeWorldPersistence';
import { decodeLifeWorldSnapshot, encodeLifeWorldSnapshot } from '@/app/LifeWorldSnapshotCodec';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';

function smallConfig(): SubstrateConfig {
  return {
    ...substrateConfig,
    world: { ...substrateConfig.world, fieldResolution: 8 },
  };
}

function createWorld(config: SubstrateConfig = smallConfig(), seed = 42): LifeWorld {
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
    const world = createWorld();
    for (let index = 0; index < 20; index++) world.step();
    const snapshot = world.snapshot();
    const fingerprint = fingerprintSubstrateConfig(smallConfig());
    const envelope = await encodeLifeWorldSnapshot(snapshot, fingerprint);

    const decoded = await decodeLifeWorldSnapshot(envelope, fingerprint);

    expect(decoded).toEqual({ kind: 'snapshot', snapshot });
    expect(envelope.schemaVersion).toBe(4);
    expect(envelope.encoding).toMatch(/base64/);
  });

  it('adlandırılmış akış tablosunu ve tükenmiş ID sayacını gidiş dönüşte korur', async () => {
    const config = smallConfig();
    const world = createWorld(config);
    for (let index = 0; index < 5; index++) world.step();
    const snapshot = world.snapshot();
    const exhausted = {
      ...snapshot,
      randomStreamStates: Int32Array.from(snapshot.randomStreamStates, (state, index) =>
        index === 3 ? state + 1 : state,
      ),
      particles: { ...snapshot.particles, nextStableId: MAX_STABLE_ID + 1 },
    };
    const fingerprint = fingerprintSubstrateConfig(config);

    const envelope = await encodeLifeWorldSnapshot(exhausted, fingerprint);
    const decoded = await decodeLifeWorldSnapshot(envelope, fingerprint);

    expect(decoded).toEqual({ kind: 'snapshot', snapshot: exhausted });
  });

  /*
   * Zarf gerçek v3 kodeğiyle (`8b385ad`) üretildi ve fixture olarak saklanıyor:
   * "eski kayıt sessizce v4 fiziğinde oynatılmaz" iddiası ancak GERÇEK bir eski
   * zarfla sınanabilir, elle kurgulanmış bir nesneyle değil.
   */
  it('gerçek v3 zarfı sessizce oynatılmaz, uyumsuz şema verir', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const envelope = JSON.parse(
      readFileSync(join(import.meta.dirname, 'fixtures/lifeWorldEnvelopeV3.json'), 'utf8'),
    ) as { schemaVersion: number; configFingerprint: string };
    expect(envelope.schemaVersion).toBe(3);

    expect(await decodeLifeWorldSnapshot(envelope, envelope.configFingerprint)).toEqual({
      kind: 'incompatible',
      reason: 'schema',
    });

    const memory = memorySaveManager(envelope);
    const persistence = new LifeWorldPersistence(memory.saveManager, smallConfig());
    const result = await persistence.load();

    expect(result.snapshot).toBeNull();
    expect(result.issue).toBe('incompatible');
  });

  it('uzunluğu değişmeyen ikili bozulmayı checksum ile reddeder', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const snapshot = createWorld().snapshot();
    const fingerprint = fingerprintSubstrateConfig(smallConfig());
    const envelope = await encodeLifeWorldSnapshot(snapshot, fingerprint);
    const bytes = Buffer.from(envelope.payload, 'base64');
    bytes[40] ^= 0x01;

    await expect(
      decodeLifeWorldSnapshot({ ...envelope, payload: bytes.toString('base64') }, fingerprint),
    ).rejects.toThrow(/checksum/i);
  });

  it('farklı yapılandırma parmak izini uyumsuz işaretler ve bozuk yükü reddeder', async () => {
    const snapshot = createWorld().snapshot();
    const fingerprint = fingerprintSubstrateConfig(smallConfig());
    const envelope = await encodeLifeWorldSnapshot(snapshot, fingerprint);

    expect(await decodeLifeWorldSnapshot(envelope, 'life-world-v3-deadbeefdeadbeef')).toEqual({
      kind: 'incompatible',
      reason: 'fingerprint',
    });
    await expect(
      decodeLifeWorldSnapshot({ ...envelope, payload: 'bozuk!' }, fingerprint),
    ).rejects.toThrow();
  });

  it('gzip kaydını açacak platform desteği yoksa hata fırlatır', async () => {
    const snapshot = createWorld().snapshot();
    const fingerprint = fingerprintSubstrateConfig(smallConfig());
    const envelope = await encodeLifeWorldSnapshot(snapshot, fingerprint);
    expect(envelope.encoding).toBe('gzip-base64');
    vi.stubGlobal('DecompressionStream', undefined);

    await expect(decodeLifeWorldSnapshot(envelope, fingerprint)).rejects.toThrow();
  });

  it('payload bildirilen ikili uzunlukla uyuşmazsa reddeder', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const snapshot = createWorld().snapshot();
    const fingerprint = fingerprintSubstrateConfig(smallConfig());
    const envelope = await encodeLifeWorldSnapshot(snapshot, fingerprint);

    await expect(
      decodeLifeWorldSnapshot({ ...envelope, payload: envelope.payload.slice(0, -4) }, fingerprint),
    ).rejects.toThrow(/uzunluğu/i);
  });

  it('geçersiz snapshot alanlarında RangeError fırlatır', async () => {
    const valid = createWorld().snapshot();
    const fingerprint = fingerprintSubstrateConfig(smallConfig());
    await expect(encodeLifeWorldSnapshot({ ...valid, tick: -1 }, fingerprint)).rejects.toThrow(
      RangeError,
    );
    await expect(
      encodeLifeWorldSnapshot(
        { ...valid, particles: { ...valid.particles, x: new Float32Array(1) } },
        fingerprint,
      ),
    ).rejects.toThrow(RangeError);
    const nonFinite = valid.fields.light.slice();
    nonFinite[0] = Number.NaN;
    await expect(
      encodeLifeWorldSnapshot(
        { ...valid, fields: { ...valid.fields, light: nonFinite } },
        fingerprint,
      ),
    ).rejects.toThrow(RangeError);
  });

  it('bozuk veya geçersiz ikili zarfta uyumsuz/istisna döner', async () => {
    expect(await decodeLifeWorldSnapshot(null, 'test')).toEqual({ kind: 'none' });
    expect(await decodeLifeWorldSnapshot(undefined, 'test')).toEqual({ kind: 'none' });
    expect(await decodeLifeWorldSnapshot({ schemaVersion: 1 }, 'test')).toEqual({
      kind: 'incompatible',
      reason: 'schema',
    });
    expect(
      await decodeLifeWorldSnapshot(
        { schemaVersion: 2, configFingerprint: 'test', encoding: 'invalid', payload: '' },
        'test',
      ),
    ).toEqual({ kind: 'incompatible', reason: 'schema' });
    expect(
      await decodeLifeWorldSnapshot(
        { schemaVersion: 3, configFingerprint: 'test', encoding: 'base64', payload: '' },
        'test',
      ),
    ).toEqual({ kind: 'incompatible', reason: 'schema' });
    await expect(decodeLifeWorldSnapshot('string', 'test')).rejects.toThrow(RangeError);

    // Kısa başlık (HEADER_BYTES < 64)
    const shortBytes = new Uint8Array(10);
    const shortPayload = Buffer.from(shortBytes).toString('base64');
    await expect(
      decodeLifeWorldSnapshot(
        {
          schemaVersion: 4,
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
    const invalidMagic = new Uint8Array(64);
    const invalidPayload = Buffer.from(invalidMagic).toString('base64');
    await expect(
      decodeLifeWorldSnapshot(
        {
          schemaVersion: 4,
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
    const config = smallConfig();
    const persistence = new LifeWorldPersistence(memory.saveManager, config);
    const snapshot = createWorld(config).snapshot();

    await persistence.save(snapshot);

    const result = await persistence.load();
    expect(result.snapshot).toEqual(snapshot);
    expect(result.issue).toBeNull();
    expect(memory.manager.save).toHaveBeenCalledWith('vol-life:world', memory.read());
  });

  it('parmak izi fizik ve dünya yapılandırmasına bağlı, instance seedinden bağımsızdır', () => {
    const config = smallConfig();
    const baseline = fingerprintSubstrateConfig(config);

    expect(fingerprintSubstrateConfig(cloneSubstrateConfig(config))).toBe(baseline);
    expect(createWorld(config, 1).snapshot().metadata.seed).not.toBe(
      createWorld(config, 2).snapshot().metadata.seed,
    );
    const modified = cloneSubstrateConfig(config);
    (
      modified.candidate.physics as { dynamics: { dampingPerReferenceTick: number } }
    ).dynamics.dampingPerReferenceTick = 0.9;
    expect(fingerprintSubstrateConfig(modified)).not.toBe(baseline);
  });

  it('kurulum yapılandırmasını sonradan yapılan dış mutasyondan yalıtır', async () => {
    const memory = memorySaveManager();
    const config = cloneSubstrateConfig(smallConfig());
    const persistence = new LifeWorldPersistence(memory.saveManager, config);
    const snapshot = createWorld(config).snapshot();

    (config.world as { fieldResolution: number }).fieldResolution = 16;

    await expect(persistence.save(snapshot)).resolves.toBeUndefined();
    const result = await persistence.load();
    expect(result.snapshot).toEqual(snapshot);
  });

  it('parmak izi üretmeden önce geçersiz yapılandırmayı reddeder', () => {
    const bad = cloneSubstrateConfig(smallConfig());
    (bad.world as { fixedStepMs: number }).fixedStepMs = Number.NaN;
    expect(() => fingerprintSubstrateConfig(bad)).toThrow(RangeError);
  });

  it('checksumı doğru olsa da sınır dışındaki parçacığı yüklemez', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = smallConfig();
    const snapshot = createWorld(config).snapshot();
    const x = snapshot.particles.x.slice();
    x[0] = config.world.boundsUnits.x - 1;
    const fingerprint = fingerprintSubstrateConfig(config);
    const envelope = await encodeLifeWorldSnapshot(
      {
        ...snapshot,
        particles: { ...snapshot.particles, x },
      },
      fingerprint,
    );
    const memory = memorySaveManager(envelope);
    const persistence = new LifeWorldPersistence(memory.saveManager, config);

    const result = await persistence.load();
    expect(result.snapshot).toBeNull();
    expect(result.issue).toBe('corrupt');
  });

  it('yapılandırmayla ayrışan alan, parçacık, hız, tür ve bant verisini kaydetmez', async () => {
    const memory = memorySaveManager();
    const config = smallConfig();
    const persistence = new LifeWorldPersistence(memory.saveManager, config);
    const snapshot = createWorld(config).snapshot();
    const shortField = snapshot.fields.light.slice(1);
    const shortX = snapshot.particles.x.slice(1);
    const fastVx = snapshot.particles.vx.slice();
    fastVx[0] = config.candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick * 2;
    const invalidType = snapshot.particles.type.slice();
    invalidType[0] = 247;
    const invalidSnapshots = [
      { ...snapshot, metadata: { ...snapshot.metadata, seed: -1 } },
      { ...snapshot, fields: { ...snapshot.fields, light: shortField } },
      { ...snapshot, particles: { ...snapshot.particles, x: shortX } },
      { ...snapshot, particles: { ...snapshot.particles, vx: fastVx } },
      { ...snapshot, particles: { ...snapshot.particles, type: invalidType } },
      { ...snapshot, nextFieldBand: config.world.fieldUpdateBands },
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
        const world = createWorld(smallConfig(), ++tick);
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
    const config = smallConfig();
    const persistence = new LifeWorldPersistence(memory.saveManager, config);
    const source = {
      snapshot: () => createWorld(config).snapshot(),
    };
    const autosave = persistence.attach(source, { intervalMs: 10_000 });
    expect(autosave).toBeInstanceOf(LifeWorldAutosave);
    autosave.destroy();
  });

  it('geçersiz otomatik kayıt aralığında RangeError fırlatır', () => {
    const save = vi.fn(() => Promise.resolve());
    const source = {
      snapshot: () => createWorld().snapshot(),
    };
    expect(() => new LifeWorldAutosave({ save }, source, { intervalMs: 0 })).toThrow(RangeError);
    expect(() => new LifeWorldAutosave({ save }, source, { intervalMs: -10 })).toThrow(RangeError);
  });

  it('görünürlük aboneliği kurulamazsa daha önce açılan intervali geri bırakır', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const source = {
      snapshot: () => createWorld().snapshot(),
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
      snapshot: () => createWorld().snapshot(),
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
      snapshot: () => createWorld().snapshot(),
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
      smallConfig(),
    );
    const result = await persistence.load();
    expect(result.snapshot).toBeNull();
    expect(result.issue).toBe('corrupt');
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
      snapshot: () => createWorld().snapshot(),
    };
    const autosave = new LifeWorldAutosave({ save }, source, { onError, intervalMs: 10_000 });
    await expect(autosave.flush()).rejects.toThrow('Kayıt başarısız');
    expect(errorSpy).toHaveBeenCalled();
    autosave.destroy();
  });

  it('nextFieldBand sınır dışı olduğunda kaydetmez ve RangeError fırlatır', async () => {
    const memory = memorySaveManager();
    const config = smallConfig();
    const persistence = new LifeWorldPersistence(memory.saveManager, config);
    const snapshot = createWorld(config).snapshot();
    await expect(
      persistence.save({ ...snapshot, nextFieldBand: config.world.fieldUpdateBands }),
    ).rejects.toThrow(RangeError);
    await expect(persistence.save({ ...snapshot, nextFieldBand: -1 })).rejects.toThrow(RangeError);
  });
});
