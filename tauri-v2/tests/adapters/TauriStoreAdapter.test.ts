import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { TauriStoreAdapter } from '../../src/adapters/TauriStoreAdapter';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));

const store = new Map<string, string>();
const mockInvoke = vi.mocked(invoke);

function wireStore(overrides?: {
  read?: (name: string) => { data: string | null; recovered: boolean; reset?: boolean };
  write?: (name: string, data: string) => void;
}) {
  mockInvoke.mockImplementation((command: string, args?: unknown) => {
    const { name, data } = (args ?? {}) as { name: string; data?: string };
    if (command === 'vol_store_read') {
      return Promise.resolve(
        overrides?.read
          ? overrides.read(name)
          : { data: store.get(name) ?? null, recovered: false, reset: false },
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
  it('reddedilen yazım ve silme önbellekte dayanıklı değer gibi görünmez', async () => {
    const adapter = new TauriStoreAdapter();
    await adapter.set('keep', 1);
    wireStore({
      write: () => {
        throw new Error('disk reddi');
      },
    });
    await expect(adapter.set('new', 2)).rejects.toThrow('disk reddi');
    await expect(adapter.get('new')).resolves.toBeUndefined();
    await expect(adapter.remove('keep')).rejects.toThrow('disk reddi');
    await expect(adapter.get('keep')).resolves.toBe(1);
    wireStore();
    await adapter.set('new', 3);
    expect(JSON.parse(store.get('volstudio-store.json')!)).toEqual({ keep: 1, new: 3 });
  });

  it('eşzamanlı değişimleri kendi sıradaki snapshotlarıyla yazar', async () => {
    const adapter = new TauriStoreAdapter();
    const snapshots: unknown[] = [];
    wireStore({
      write: (name, data) => {
        snapshots.push(JSON.parse(data));
        store.set(name, data);
      },
    });
    await Promise.all([adapter.set('a', 1), adapter.set('b', 2), adapter.remove('a')]);
    expect(snapshots).toEqual([{ a: 1 }, { a: 1, b: 2 }, { b: 2 }]);
    await expect(adapter.keys()).resolves.toEqual(['b']);
  });

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

  it('yedekten kurtarma ve sıfırlama bütünlük olayı olarak bildirilir', async () => {
    wireStore({
      read: () => ({ data: JSON.stringify({ keep: true }), recovered: true }),
    });
    const onIntegrity = vi.fn();
    await expect(new TauriStoreAdapter({ onIntegrity }).get('keep')).resolves.toBe(true);
    expect(onIntegrity).toHaveBeenCalledWith({ name: 'volstudio-store.json', kind: 'recovered' });

    wireStore({ read: () => ({ data: null, recovered: false, reset: true }) });
    onIntegrity.mockClear();
    const reset = new TauriStoreAdapter({ onIntegrity });
    await expect(reset.keys()).resolves.toEqual([]);
    expect(onIntegrity).toHaveBeenCalledWith({ name: 'volstudio-store.json', kind: 'reset' });
  });

  it('eşzamanlı ilk okumalar tek önbellek kurar; araya giren yazı kaybolmaz', async () => {
    store.set('volstudio-store.json', JSON.stringify({ a: 1 }));
    const reads: Array<() => void> = [];
    mockInvoke.mockImplementation((command: string, args?: unknown) => {
      const { name, data } = (args ?? {}) as { name: string; data?: string };
      if (command === 'vol_store_read') {
        const snapshot = store.get(name) ?? null;
        return new Promise((resolve) =>
          reads.push(() => resolve({ data: snapshot, recovered: false, reset: false })),
        );
      }
      store.set(name, data ?? '');
      return Promise.resolve();
    });
    const adapter = new TauriStoreAdapter();
    const first = adapter.get('a');
    const second = adapter.get('c');
    const write = adapter.set('b', 2);
    expect(reads).toHaveLength(1);
    reads.splice(0).forEach((resolve) => resolve());
    await Promise.all([first, second, write]);
    await adapter.set('c', 3);

    expect(JSON.parse(store.get('volstudio-store.json') ?? '{}')).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('başarısız okuma önbelleğe yazılmaz; sonraki çağrı yeniden dener', async () => {
    let fail = true;
    mockInvoke.mockImplementation((command: string) => {
      if (command !== 'vol_store_read') return Promise.resolve();
      if (fail) {
        fail = false;
        return Promise.reject(new Error('okunamadı'));
      }
      return Promise.resolve({ data: JSON.stringify({ x: 1 }), recovered: false, reset: false });
    });
    const adapter = new TauriStoreAdapter();
    await expect(adapter.get('x')).rejects.toThrow('okunamadı');
    await expect(adapter.get('x')).resolves.toBe(1);
  });

  it('custom path ile calisir', async () => {
    const adapter = new TauriStoreAdapter({ path: 'custom-store.json' });
    await adapter.get('x');
    expect(mockInvoke).toHaveBeenCalledWith('vol_store_read', { name: 'custom-store.json' });
  });

  it('gameId ile oyun bazli store dosyasi acar', async () => {
    const adapter = new TauriStoreAdapter({ gameId: 'sample-game' });
    await adapter.get('x');
    expect(mockInvoke).toHaveBeenCalledWith('vol_store_read', { name: 'sample-game-store.json' });
  });
});
