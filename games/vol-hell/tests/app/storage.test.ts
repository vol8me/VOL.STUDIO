import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { isTauri } from '@tauri-apps/api/core';
import { TauriStoreAdapter } from '@volstudio/tauri-v2';
import type { createStorageAdapter as CreateStorageAdapterFn } from '@/app/storage';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
}));

vi.mock('@volstudio/tauri-v2', () => ({
  TauriStoreAdapter: vi.fn(),
}));

describe('createStorageAdapter', () => {
  /*
   * Modül grafiğini testlerin DIŞINDA ısıt.
   *
   * `vi.mock` hoisting ile `@tauri-apps/api/core` ve `@volstudio/tauri-v2`
   * zaten mocklanıyor; `vi.resetModules()` + her testte dinamik `import`
   * yapmaya gerek yok. `createStorageAdapter` çağrıldığında `isTauri()`nun
   * o anki mock değerini okur. Tek seferlik yüklemeyi 120 sn'lik `beforeAll`
   * yapar; test gövdeleri varsayılan 5000 ms sınırında kalır.
   */
  let createStorageAdapter: typeof CreateStorageAdapterFn;

  beforeAll(async () => {
    await import('@volstudio/core');
    const mod = await import('@/app/storage');
    createStorageAdapter = mod.createStorageAdapter;
  }, 120_000);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Tauri disi ortamda LocalStorageAdapter kullanir', () => {
    vi.mocked(isTauri).mockReturnValue(false);

    const adapter = createStorageAdapter();

    expect(adapter.constructor.name).toBe('LocalStorageAdapter');
  });

  it('Tauri ortaminda TauriStoreAdapter kullanir ve oyun kimligi ile store acar', () => {
    vi.mocked(isTauri).mockReturnValue(true);

    const adapter = createStorageAdapter();

    expect(adapter).toBeInstanceOf(TauriStoreAdapter);
    expect(TauriStoreAdapter).toHaveBeenCalledWith({ gameId: 'vol-hell' });
  });
});
