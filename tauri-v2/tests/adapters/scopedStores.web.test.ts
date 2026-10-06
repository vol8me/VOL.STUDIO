// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScopedStores, migrateScopedStores } from '../../src/adapters/scopedStores';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
afterEach(() => localStorage.clear());

describe('kapsam göçünün tarayıcı sahipliği', () => {
  it('aynı origin içindeki başka oyunun anahtarlarını hedefe kopyalamaz', async () => {
    localStorage.setItem('other.progress', JSON.stringify({ keep: true }));
    localStorage.setItem('voltest.progress', JSON.stringify({ distance: 8 }));
    localStorage.setItem('voltest.extra', JSON.stringify({ keep: true }));
    const report = await migrateScopedStores('voltest', createScopedStores('voltest'), [
      { key: 'voltest.progress', scope: 'synced' },
    ]);
    expect(report.moved).toEqual(['voltest.progress', 'voltest.extra']);
    expect(localStorage.getItem('device.other.progress')).toBeNull();
    expect(localStorage.getItem('other.progress')).toBe(JSON.stringify({ keep: true }));
    expect(localStorage.getItem('device.voltest.extra')).toBe(JSON.stringify({ keep: true }));
  });

  it('mevcut kapsamlı değeri ve eski kaynağı korur; ikinci çalıştırma yazmaz', async () => {
    localStorage.setItem('voltest.progress', '2');
    localStorage.setItem('synced.voltest.progress', '9');
    const options = [{ key: 'voltest.progress', scope: 'synced' }] as const;
    const stores = createScopedStores('voltest');
    expect((await migrateScopedStores('voltest', stores, options)).moved).toEqual([]);
    expect(localStorage.getItem('synced.voltest.progress')).toBe('9');
    expect(localStorage.getItem('voltest.progress')).toBe('2');
    expect(localStorage.getItem('device.synced.voltest.progress')).toBeNull();
  });
});
