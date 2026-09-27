import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { isTauri } from '@tauri-apps/api/core';
import { TauriStoreAdapter } from '@volstudio/tauri-v2';
import { ScopedSaveManager, type IStorageAdapter, type ScopedStores } from '@volstudio/core';
import type * as TauriV2 from '@volstudio/tauri-v2';
import type {
  createSaveManager as CreateSaveManagerFn,
  createLegacyStore as CreateLegacyStoreFn,
  migrateLegacySave as MigrateLegacySaveFn,
} from '@/app/storage';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
}));

vi.mock('@volstudio/tauri-v2', async (importOriginal) => {
  const actual = await importOriginal<typeof TauriV2>();
  return {
    ...actual,
    TauriStoreAdapter: vi.fn(),
  };
});

/** Bellek-içi adapter — `keys()` destekli, taşıma sayımı için. */
class MemoryStore implements IStorageAdapter {
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

describe('storage', () => {
  /*
   * Modül grafiğini testlerin DIŞINDA ısıt — `vi.mock` hoisting ile Tauri
   * adaptörleri mocklanır; dinamik import test gövdesinden çıkarılıp tek
   * seferlik `beforeAll`'a taşınır (süre sınırı güvenliği).
   */
  let createSaveManager: typeof CreateSaveManagerFn;
  let createLegacyStore: typeof CreateLegacyStoreFn;
  let migrateLegacySave: typeof MigrateLegacySaveFn;

  beforeAll(async () => {
    const mod = await import('@/app/storage');
    createSaveManager = mod.createSaveManager;
    createLegacyStore = mod.createLegacyStore;
    migrateLegacySave = mod.migrateLegacySave;
  }, 120_000);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createSaveManager iki kapsamlı ScopedSaveManager döner', () => {
    vi.mocked(isTauri).mockReturnValue(false);
    expect(createSaveManager()).toBeInstanceOf(ScopedSaveManager);
  });

  it('createLegacyStore Tauri dışında LocalStorageAdapter, içinde oyun kimliğiyle TauriStoreAdapter üretir', () => {
    vi.mocked(isTauri).mockReturnValue(false);
    expect(createLegacyStore().constructor.name).toBe('LocalStorageAdapter');

    vi.mocked(isTauri).mockReturnValue(true);
    const legacy = createLegacyStore();
    expect(legacy).toBeInstanceOf(TauriStoreAdapter);
    expect(TauriStoreAdapter).toHaveBeenCalledWith({ gameId: 'vol-hell' });
  });

  it("migrateLegacySave eski anahtarları doğrulayarak kapsamlı store'a taşır", async () => {
    // Tarayıcı yolu: eski ve yeni kayıt aynı localStorage'ı paylaşır.
    vi.mocked(isTauri).mockReturnValue(false);
    localStorage.clear();
    localStorage.setItem('vol-hell:game-stats', JSON.stringify({ bestScore: 42 }));
    localStorage.setItem('vol-hell:audio-settings', JSON.stringify({ muted: true }));

    const scoped = createSaveManager();
    const report = await migrateLegacySave(scoped);

    expect([...report.moved].sort()).toEqual(
      ['vol-hell:audio-settings', 'vol-hell:game-stats'].sort(),
    );
    // İlerleme synced'e, ayar device'a taşındı; eski anahtarlar silindi.
    await expect(scoped.load('synced.vol-hell:game-stats', null)).resolves.toEqual({
      bestScore: 42,
    });
    await expect(scoped.load('device.vol-hell:audio-settings', null)).resolves.toEqual({
      muted: true,
    });
    expect(localStorage.getItem('vol-hell:game-stats')).toBeNull();
    expect(localStorage.getItem('vol-hell:audio-settings')).toBeNull();
  });

  it('migrateLegacySave kapsamlı anahtarları ve ikinci çağrıyı atlar (idempotent)', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    localStorage.clear();
    localStorage.setItem(
      'device.vol-hell:video-settings',
      JSON.stringify({ displayMode: 'fullscreen' }),
    );

    const scoped = createSaveManager();
    const report = await migrateLegacySave(scoped);
    expect(report.moved).toEqual([]);
    // Kapsamlı anahtar `device.device.*` olarak kopyalanmadı.
    await expect(
      scoped.load('device.device.vol-hell:video-settings' as never, null),
    ).resolves.toBeNull();
  });

  it("Tauri yolunda legacy store adapter'ı gameId ile açılır", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const scoped = new ScopedSaveManager({
      synced: new MemoryStore(),
      device: new MemoryStore(),
    } satisfies ScopedStores);
    // migrateLegacySave kendi legacy store'unu kurar — TauriStoreAdapter mock'u
    // boş bir enumerable dönsün diye keys sağlanır.
    vi.mocked(TauriStoreAdapter).mockImplementation(function () {
      return new MemoryStore() as unknown as TauriStoreAdapter;
    } as never);
    const report = await migrateLegacySave(scoped);
    expect(TauriStoreAdapter).toHaveBeenCalledWith({ gameId: 'vol-hell' });
    expect(report.moved).toEqual([]);
  });
});
