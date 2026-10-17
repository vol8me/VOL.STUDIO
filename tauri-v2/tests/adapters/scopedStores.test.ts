import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
  LocalStorageAdapter: class LocalStorageAdapter {},
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: fakes.isTauri, invoke: fakes.invoke }));
vi.mock('@volstudio/core/persistence', () => ({ LocalStorageAdapter: fakes.LocalStorageAdapter }));

import { LocalStorageAdapter } from '@volstudio/core/persistence';
import { createScopedStores } from '../../src/adapters/scopedStores';
import { TauriStoreAdapter } from '../../src/adapters/TauriStoreAdapter';

describe('createScopedStores', () => {
  it('Tauri kabuğunda iki ayrı kapsam dosyasını TauriStoreAdapter ile açar', () => {
    fakes.isTauri.mockReturnValue(true);
    const stores = createScopedStores('sample-game');
    expect(stores.synced).toBeInstanceOf(TauriStoreAdapter);
    expect(stores.device).toBeInstanceOf(TauriStoreAdapter);
  });

  it('bütünlük olayı iki kapsamın da tüketicisine ulaşır', async () => {
    fakes.isTauri.mockReturnValue(true);
    fakes.invoke.mockResolvedValue({ data: null, recovered: true, reset: false });
    const onIntegrity = vi.fn();
    const stores = createScopedStores('sample-game', { onIntegrity });
    await stores.synced.get('x');
    await stores.device.get('x');
    expect(onIntegrity.mock.calls).toEqual([
      [{ name: 'sample-game-synced.json', kind: 'recovered' }],
      [{ name: 'sample-game-device.json', kind: 'recovered' }],
    ]);
  });

  it('tarayıcıda iki kapsamı localStorage adaptörlerine indirir', () => {
    fakes.isTauri.mockReturnValue(false);
    const stores = createScopedStores('sample-game');
    expect(stores.synced).toBeInstanceOf(LocalStorageAdapter);
    expect(stores.device).toBeInstanceOf(LocalStorageAdapter);
  });
});
