import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTauri } from '@tauri-apps/api/core';
import { TauriStoreAdapter } from '@volstudio/tauri-v2';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
}));

vi.mock('@volstudio/tauri-v2', () => ({
  TauriStoreAdapter: vi.fn(),
}));

describe('createStorageAdapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('Tauri disi ortamda LocalStorageAdapter kullanir', async () => {
    vi.mocked(isTauri).mockReturnValue(false);

    const { createStorageAdapter } = await import('@/app/storage');
    const adapter = createStorageAdapter();

    expect(adapter.constructor.name).toBe('LocalStorageAdapter');
  });

  it('Tauri ortaminda TauriStoreAdapter kullanir ve oyun kimligi ile store acar', async () => {
    vi.mocked(isTauri).mockReturnValue(true);

    const { createStorageAdapter } = await import('@/app/storage');
    const adapter = createStorageAdapter();

    expect(adapter).toBeInstanceOf(TauriStoreAdapter);
    expect(TauriStoreAdapter).toHaveBeenCalledWith({ gameId: 'vol-hell' });
  });
});
