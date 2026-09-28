import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { TauriStoreAdapter } from '../../src/adapters/TauriStoreAdapter';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));

const store = new Map<string, string>();
const mockInvoke = vi.mocked(invoke);

function wireStore(overrides?: {
  read?: (name: string) => { data: string | null; recovered: boolean };
  write?: (name: string, data: string) => void;
}) {
  mockInvoke.mockImplementation((command: string, args?: unknown) => {
    const { name, data } = (args ?? {}) as { name: string; data?: string };
    if (command === 'vol_store_read') {
      return Promise.resolve(
        overrides?.read
          ? overrides.read(name)
          : { data: store.get(name) ?? null, recovered: false },
      );
    }
    if (command === 'vol_store_write') {
      if (overrides?.write) overrides.write(name, data ?? '');
      else store.set(name, data ?? '');
      return Promise.resolve();
    }
    return Promise.reject(new Error(`beklenmeyen komut: ${command}`));
  });
}

describe('TauriStoreAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    wireStore();
  });

  it('deger getirir ve ilk erisimde native okuma yapar', async () => {
    store.set('volstudio-store.json', JSON.stringify({ settings: { lang: 'tr' } }));
    const adapter = new TauriStoreAdapter();

    const value = await adapter.get<{ lang: string }>('settings');

    expect(value).toEqual({ lang: 'tr' });
    expect(mockInvoke).toHaveBeenCalledWith('vol_store_read', { name: 'volstudio-store.json' });
  });

  it('olmayan anahtar undefined dondurur', async () => {
    const adapter = new TauriStoreAdapter();
    await expect(adapter.get('yok')).resolves.toBeUndefined();
  });

  it('set dosyaya atomik komutla yazar', async () => {
    const adapter = new TauriStoreAdapter();
    await adapter.set('settings', { lang: 'en' });

    expect(mockInvoke).toHaveBeenCalledWith('vol_store_write', {
      name: 'volstudio-store.json',
      data: JSON.stringify({ settings: { lang: 'en' } }),
    });
  });

  it('remove anahtari siler ve kaydeder', async () => {
    const adapter = new TauriStoreAdapter();
    await adapter.set('a', 1);
    await adapter.set('b', 2);
    await adapter.remove('a');

    await expect(adapter.get('a')).resolves.toBeUndefined();
    await expect(adapter.get('b')).resolves.toBe(2);
  });

  it('keys kayıttaki tüm anahtarları döndürür', async () => {
    store.set('volstudio-store.json', JSON.stringify({ a: 1, b: 2 }));
    const adapter = new TauriStoreAdapter();
    await expect(adapter.keys()).resolves.toEqual(['a', 'b']);
  });

  it('yazmalar sirayla gider — kuyruk onceki hata ile kirilmaz', async () => {
    const order: string[] = [];
    let fail = true;
    wireStore({
      write: (_name, data) => {
        order.push(data);
        if (fail) {
          fail = false;
          throw new Error('disk dolu');
        }
        store.set('volstudio-store.json', data);
      },
    });
    const adapter = new TauriStoreAdapter();

    await expect(adapter.set('x', 1)).rejects.toThrow('disk dolu');
    await adapter.set('x', 2);

    expect(order).toEqual([JSON.stringify({ x: 1 }), JSON.stringify({ x: 2 })]);
    await expect(adapter.get<number>('x')).resolves.toBe(2);
  });

  it('native yedekten dondugunu bildirirse onRecovered cagrilir', async () => {
    wireStore({
      read: () => ({ data: JSON.stringify({ keep: true }), recovered: true }),
    });
    const onRecovered = vi.fn();
    const adapter = new TauriStoreAdapter();
    adapter.onRecovered = onRecovered;

    await expect(adapter.get('keep')).resolves.toBe(true);
    expect(onRecovered).toHaveBeenCalledWith('volstudio-store.json');
  });

  it('custom path ile calisir', async () => {
    const adapter = new TauriStoreAdapter({ path: 'custom-store.json' });
    await adapter.get('x');
    expect(mockInvoke).toHaveBeenCalledWith('vol_store_read', { name: 'custom-store.json' });
  });

  it('gameId ile oyun bazli store dosyasi acar', async () => {
    const adapter = new TauriStoreAdapter({ gameId: 'vol-hell' });
    await adapter.get('x');
    expect(mockInvoke).toHaveBeenCalledWith('vol_store_read', { name: 'vol-hell-store.json' });
  });
});
