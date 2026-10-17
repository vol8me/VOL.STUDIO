import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LegacyKeyMapping, MigrationReport, ScopedStores } from '@volstudio/core';
import * as scopedStores from '../../src/adapters/scopedStores';
import type { ScopedStoresOptions } from '../../src/adapters/scopedStores';

const bridge = vi.hoisted(() => ({
  invoke: vi.fn<(command: string, args: { name: string; data?: string }) => Promise<unknown>>(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: bridge.invoke }));

const migrate = () => {
  const helper = (
    scopedStores as unknown as {
      migrateScopedStores?: (
        gameId: string,
        stores: ScopedStores,
        mappings: readonly LegacyKeyMapping[],
        options?: ScopedStoresOptions,
      ) => Promise<MigrationReport>;
    }
  ).migrateScopedStores;
  expect(helper, 'açık göç giriş noktası bulunmalı').toBeTypeOf('function');
  return helper!;
};

const mappings = [
  { key: 'voltest.preferences', scope: 'device' },
  { key: 'voltest.progress', scope: 'synced' },
] as const;

let directory: string;
let failTarget: string | null;
let recoveredLegacy: boolean;

async function disk(name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(directory, name), 'utf8')) as unknown;
}

beforeEach(async () => {
  bridge.invoke.mockClear();
  directory = await mkdtemp(join(tmpdir(), 'volstudio-migration-'));
  failTarget = null;
  recoveredLegacy = false;
  bridge.invoke.mockImplementation(
    async (command: string, args: { name: string; data?: string }) => {
      if (command === 'vol_store_read') {
        let data: string | null = null;
        try {
          data = await readFile(join(directory, args.name), 'utf8');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        return {
          data,
          recovered: recoveredLegacy && args.name === 'voltest-store.json',
          reset: false,
        };
      }
      if (command === 'vol_store_write') {
        if (args.name === failTarget) throw new Error('hedef yazımı kesildi');
        if (typeof args.data !== 'string') throw new Error('yazım verisi eksik');
        await writeFile(join(directory, args.name), args.data, 'utf8');
        return;
      }
      throw new Error(`Beklenmeyen komut: ${command}`);
    },
  );
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('migrateScopedStores native dosya entegrasyonu', () => {
  it('eski ayrı dosyadaki kapsamlı anahtarları önek eklemeden taşır', async () => {
    const source = JSON.stringify({
      'device.voltest.preferences': { volume: 0.6 },
      'synced.voltest.progress': { distance: 21 },
    });
    await writeFile(join(directory, 'voltest-store.json'), source);
    await migrate()('voltest', scopedStores.createScopedStores('voltest'), mappings);
    expect(await disk('voltest-device.json')).toEqual({
      'device.voltest.preferences': { volume: 0.6 },
    });
    expect(await disk('voltest-synced.json')).toEqual({
      'synced.voltest.progress': { distance: 21 },
    });
    expect(await readFile(join(directory, 'voltest-store.json'), 'utf8')).toBe(source);
  });

  it('reddedilen hedef yazımını aynı adapter ile yeniden deneyip gerçekten diske yazar', async () => {
    await writeFile(
      join(directory, 'voltest-store.json'),
      JSON.stringify({
        'voltest.progress': { distance: 19 },
      }),
    );
    const stores = scopedStores.createScopedStores('voltest');
    failTarget = 'voltest-synced.json';
    await expect(migrate()('voltest', stores, mappings)).rejects.toThrow('hedef yazımı kesildi');
    expect(await stores.synced.get('synced.voltest.progress')).toBeUndefined();
    failTarget = null;
    expect((await migrate()('voltest', stores, mappings)).moved).toEqual(['voltest.progress']);
    expect(await disk('voltest-synced.json')).toEqual({
      'synced.voltest.progress': { distance: 19 },
    });
  });
  it('eski dosyayı korur, kapsamları ayırır ve bilinmeyeni yalnız device yapar', async () => {
    const legacy = {
      'voltest.preferences': { volume: 0.4 },
      'voltest.progress': { distance: 12, shots: 2 },
      unknown: { keep: true },
    };
    const source = JSON.stringify(legacy);
    await writeFile(join(directory, 'voltest-store.json'), source);
    const report = await migrate()('voltest', scopedStores.createScopedStores('voltest'), mappings);
    expect(await disk('voltest-device.json')).toEqual({
      'device.voltest.preferences': { volume: 0.4 },
      'device.unknown': { keep: true },
    });
    expect(await disk('voltest-synced.json')).toEqual({
      'synced.voltest.progress': { distance: 12, shots: 2 },
    });
    expect(await readFile(join(directory, 'voltest-store.json'), 'utf8')).toBe(source);
    expect(report).toEqual({
      moved: ['voltest.preferences', 'voltest.progress', 'unknown'],
      defaulted: ['unknown'],
      unknownLeftBehind: false,
    });
  });

  it('mevcut hedefleri ezmez ve tekrar çalıştırma yeni yazım üretmez', async () => {
    await writeFile(
      join(directory, 'voltest-store.json'),
      JSON.stringify({
        'voltest.preferences': { volume: 0.2 },
        'voltest.progress': { distance: 4 },
      }),
    );
    const existing = JSON.stringify({ 'device.voltest.preferences': { volume: 0.8 } });
    await writeFile(join(directory, 'voltest-device.json'), existing);
    expect(
      (await migrate()('voltest', scopedStores.createScopedStores('voltest'), mappings)).moved,
    ).toEqual(['voltest.progress']);
    expect(await readFile(join(directory, 'voltest-device.json'), 'utf8')).toBe(existing);
    const writeCount = bridge.invoke.mock.calls.filter(
      ([command]) => command === 'vol_store_write',
    ).length;
    expect(
      (await migrate()('voltest', scopedStores.createScopedStores('voltest'), mappings)).moved,
    ).toEqual([]);
    expect(
      bridge.invoke.mock.calls.filter(([command]) => command === 'vol_store_write'),
    ).toHaveLength(writeCount);
  });

  it('kaynak yoksa hedef dosyalarını açıp yazmaz', async () => {
    expect(
      await migrate()('voltest', scopedStores.createScopedStores('voltest'), mappings),
    ).toEqual({ moved: [], defaulted: [], unknownLeftBehind: false });
    expect(bridge.invoke.mock.calls.map(([command]) => command)).toEqual(['vol_store_read']);
  });

  it('hedef yazımındaki kesinti kaynak kaybetmez ve yeniden açılışta tamamlanır', async () => {
    const source = JSON.stringify({
      'voltest.preferences': { volume: 0.3 },
      'voltest.progress': { distance: 17 },
    });
    await writeFile(join(directory, 'voltest-store.json'), source);
    failTarget = 'voltest-synced.json';
    await expect(
      migrate()('voltest', scopedStores.createScopedStores('voltest'), mappings),
    ).rejects.toThrow('hedef yazımı kesildi');
    expect(await readFile(join(directory, 'voltest-store.json'), 'utf8')).toBe(source);
    expect(await disk('voltest-device.json')).toEqual({
      'device.voltest.preferences': { volume: 0.3 },
    });
    failTarget = null;
    expect(
      (await migrate()('voltest', scopedStores.createScopedStores('voltest'), mappings)).moved,
    ).toEqual(['voltest.progress']);
    expect(await disk('voltest-synced.json')).toEqual({
      'synced.voltest.progress': { distance: 17 },
    });
  });

  it('eski kaydın native kurtarma bildirimini tüketiciye taşır', async () => {
    recoveredLegacy = true;
    const events: unknown[] = [];
    await migrate()('voltest', scopedStores.createScopedStores('voltest'), mappings, {
      onIntegrity: (event) => events.push(event),
    });
    expect(events).toEqual([{ name: 'voltest-store.json', kind: 'recovered' }]);
  });
});
