import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageAdapter } from '@volstudio/core';

const fakes = vi.hoisted(() => ({
  platform: { value: 'web' as 'web' | 'desktop' | 'android' },
  storeOptions: [] as unknown[],
}));

vi.mock('@volstudio/tauri-v2', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@volstudio/tauri-v2');
  class FakeTauriStoreAdapter {
    constructor(options: unknown) {
      fakes.storeOptions.push(options);
    }
  }
  return {
    ...actual,
    getRuntimePlatform: () => fakes.platform.value,
    TauriStoreAdapter: FakeTauriStoreAdapter,
  };
});

import { createSaveManager } from '@/app/storage';

function adapterOf(manager: unknown): unknown {
  return (manager as { adapter: unknown }).adapter;
}

afterEach(() => {
  fakes.platform.value = 'web';
  fakes.storeOptions.length = 0;
});

describe('createSaveManager', () => {
  it('tarayıcıda localStorage kullanır', () => {
    expect(adapterOf(createSaveManager())).toBeInstanceOf(LocalStorageAdapter);
    expect(fakes.storeOptions).toHaveLength(0);
  });

  it.each(['desktop', 'android'] as const)(
    '%s kabuğunda oyun kimliğiyle native store açar',
    (shell) => {
      fakes.platform.value = shell;
      expect(adapterOf(createSaveManager())).not.toBeInstanceOf(LocalStorageAdapter);
      expect(fakes.storeOptions).toEqual([{ gameId: 'vol-life' }]);
    },
  );
});
