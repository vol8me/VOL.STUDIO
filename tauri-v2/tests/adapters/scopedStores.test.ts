import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  LocalStorageAdapter: class LocalStorageAdapter {},
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: fakes.isTauri, invoke: vi.fn() }));
vi.mock('@volstudio/core', () => ({ LocalStorageAdapter: fakes.LocalStorageAdapter }));

import { LocalStorageAdapter } from '@volstudio/core';
import { createScopedStores } from '../../src/adapters/scopedStores';
import { TauriStoreAdapter } from '../../src/adapters/TauriStoreAdapter';

describe('createScopedStores', () => {
  it('Tauri kabuğunda iki ayrı kapsam dosyasını TauriStoreAdapter ile açar', () => {
    fakes.isTauri.mockReturnValue(true);
    const stores = createScopedStores('sample-game');
    expect(stores.synced).toBeInstanceOf(TauriStoreAdapter);
    expect(stores.device).toBeInstanceOf(TauriStoreAdapter);
    expect((stores.synced as TauriStoreAdapter).onRecovered).toBeUndefined();
  });

  it('tarayıcıda iki kapsamı localStorage adaptörlerine indirir', () => {
    fakes.isTauri.mockReturnValue(false);
    const stores = createScopedStores('sample-game');
    expect(stores.synced).toBeInstanceOf(LocalStorageAdapter);
    expect(stores.device).toBeInstanceOf(LocalStorageAdapter);
  });
});
