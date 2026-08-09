import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LazyStore } from '@tauri-apps/plugin-store';
import { TauriStoreAdapter } from '../../src/adapters/TauriStoreAdapter';

const mockSave = vi.fn();
const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDelete = vi.fn();

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: vi.fn(),
}));

describe('TauriStoreAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(true);
    mockSave.mockResolvedValue(undefined);
    vi.mocked(LazyStore).mockImplementation(
      () =>
        ({
          get: mockGet,
          set: mockSet,
          delete: mockDelete,
          save: mockSave,
        }) as unknown as LazyStore
    );
  });

  it('deger getirir', async () => {
    const adapter = new TauriStoreAdapter();
    mockGet.mockResolvedValueOnce({ lang: 'tr' });

    const value = await adapter.get<{ lang: string }>('settings');

    expect(value).toEqual({ lang: 'tr' });
    expect(mockGet).toHaveBeenCalledWith('settings');
  });

  it('null deger yerine undefined dondurur', async () => {
    const adapter = new TauriStoreAdapter();
    mockGet.mockResolvedValueOnce(null);

    const value = await adapter.get('settings');

    expect(value).toBeUndefined();
  });

  it('set sonrasi explicit save cagrilir', async () => {
    const adapter = new TauriStoreAdapter();

    await adapter.set('settings', { lang: 'en' });

    expect(mockSet).toHaveBeenCalledWith('settings', { lang: 'en' });
    expect(mockSave).toHaveBeenCalled();
  });

  it('remove sonrasi explicit save cagrilir', async () => {
    const adapter = new TauriStoreAdapter();

    await adapter.remove('settings');

    expect(mockDelete).toHaveBeenCalledWith('settings');
    expect(mockSave).toHaveBeenCalled();
  });

  it('custom path ile calisir', () => {
    new TauriStoreAdapter({ path: 'custom-store.json' });

    expect(LazyStore).toHaveBeenCalledWith('custom-store.json', { autoSave: false });
  });

  it('gameId ile oyun bazli store dosyasi acar', () => {
    new TauriStoreAdapter({ gameId: 'vol-hell' });

    expect(LazyStore).toHaveBeenCalledWith('vol-hell-store.json', { autoSave: false });
  });
});
