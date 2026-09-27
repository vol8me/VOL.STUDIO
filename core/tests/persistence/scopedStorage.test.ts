import { describe, expect, it } from 'vitest';
import {
  isScopedKey,
  migrateLegacyStore,
  scopeOfKey,
  ScopedSaveManager,
  type IStorageAdapter,
  type KeyEnumerable,
} from '../../src';

class MemoryAdapter implements IStorageAdapter, KeyEnumerable {
  readonly data = new Map<string, unknown>();
  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.data.get(key) as T | undefined);
  }
  set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }
  remove(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
  }
  keys(): Promise<readonly string[]> {
    return Promise.resolve([...this.data.keys()]);
  }
}

function scopedPair() {
  return { synced: new MemoryAdapter(), device: new MemoryAdapter() };
}

describe('ScopedKey', () => {
  it('kapsam önekini tanır ve ayırt eder', () => {
    expect(isScopedKey('synced.progress')).toBe(true);
    expect(isScopedKey('device.video')).toBe(true);
    expect(isScopedKey('progress')).toBe(false);
    expect(isScopedKey('other.x')).toBe(false);
    expect(scopeOfKey('synced.progress')).toBe('synced');
    expect(scopeOfKey('device.audio')).toBe('device');
  });
});

describe('ScopedSaveManager', () => {
  it('anahtarı kapsamına göre doğru adaptera yönlendirir', async () => {
    const stores = scopedPair();
    const mgr = new ScopedSaveManager(stores);

    await mgr.save('synced.progress', { level: 3 });
    await mgr.save('device.video', { quality: 'high' });

    expect(stores.synced.data.get('synced.progress')).toEqual({ level: 3 });
    expect(stores.device.data.get('device.video')).toEqual({ quality: 'high' });
    expect(stores.device.data.has('synced.progress')).toBe(false);
    expect(stores.synced.data.has('device.video')).toBe(false);
  });

  it('varsayılan değerle yükler ve siler', async () => {
    const mgr = new ScopedSaveManager(scopedPair());
    await expect(mgr.load('device.missing', 7)).resolves.toBe(7);
    await mgr.save('device.missing', 9);
    await expect(mgr.load('device.missing', 7)).resolves.toBe(9);
    await mgr.delete('device.missing');
    await expect(mgr.load('device.missing', 7)).resolves.toBe(7);
  });
});

describe('migrateLegacyStore', () => {
  it('eşlenen anahtarları doğru kapsama taşır ve eskisini siler', async () => {
    const legacy = new MemoryAdapter();
    legacy.data.set('progress', { level: 5 });
    legacy.data.set('video', { vsync: true });
    const stores = scopedPair();
    const mgr = new ScopedSaveManager(stores);

    const report = await migrateLegacyStore({
      legacy,
      scoped: mgr,
      mappings: [
        { key: 'progress', scope: 'synced' },
        { key: 'video', scope: 'device' },
      ],
    });

    expect([...report.moved].sort()).toEqual(['progress', 'video']);
    expect(report.unknownLeftBehind).toBe(false);
    expect(legacy.data.size).toBe(0);
    expect(await mgr.load('synced.progress', null)).toEqual({ level: 5 });
    expect(await mgr.load('device.video', null)).toEqual({ vsync: true });
  });

  it('eşlemede olmayan anahtar varsayılan kapsama gider ve raporlanır', async () => {
    const legacy = new MemoryAdapter();
    legacy.data.set('bilinmeyen', 42);
    const mgr = new ScopedSaveManager(scopedPair());

    const report = await migrateLegacyStore({ legacy, scoped: mgr, mappings: [] });

    expect(report.defaulted).toEqual(['bilinmeyen']);
    expect(await mgr.load('device.bilinmeyen', null)).toBe(42);
  });

  it('adapter sayamıyorsa yalnız eşlenen anahtarlar taşınır ve işaretlenir', async () => {
    const legacy: IStorageAdapter = {
      get: <T>(key: string) =>
        Promise.resolve<T | undefined>(key === 'save' ? ({ hp: 3 } as T) : undefined),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };
    const mgr = new ScopedSaveManager(scopedPair());

    const report = await migrateLegacyStore({
      legacy,
      scoped: mgr,
      mappings: [{ key: 'save', scope: 'synced' }],
    });

    expect(report.moved).toEqual(['save']);
    expect(report.unknownLeftBehind).toBe(true);
  });

  it('doğrulama başarısızsa eski kayıt silinmez — taşıma yeniden denenebilir', async () => {
    const legacy = new MemoryAdapter();
    legacy.data.set('progress', 1);
    const bozuk: IStorageAdapter = {
      get: <T>() => Promise.resolve({ farkli: true } as T), // okuma hep başka döner
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };
    const mgr = new ScopedSaveManager({ synced: bozuk, device: new MemoryAdapter() });

    await expect(
      migrateLegacyStore({
        legacy,
        scoped: mgr,
        mappings: [{ key: 'progress', scope: 'synced' }],
      }),
    ).rejects.toThrow('doğrulanamadı');
    expect(legacy.data.has('progress')).toBe(true);
  });
});
