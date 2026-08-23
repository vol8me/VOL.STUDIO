import { mkdir, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetCatalog } from '../../server/catalog.js';
import { loadProjectConfig } from '../../server/config.js';
import { watchCatalog, type CatalogWatcher } from '../../server/watcher.js';
import { createFixtureProject, type FixtureProject } from './fixtures.js';

const fixtures: FixtureProject[] = [];
const watchers: CatalogWatcher[] = [];

afterEach(async () => {
  await Promise.all(watchers.splice(0).map((watcher) => watcher.close()));
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe('watchCatalog', () => {
  it('harici dosya yazımını canlı katalog olayına dönüştürür', async () => {
    const fixture = await createFixtureProject();
    fixtures.push(fixture);
    const loaded = await loadProjectConfig(fixture.repoRoot);
    const catalog = await AssetCatalog.create({
      repoRoot: loaded.repoRoot,
      project: loaded.project,
      maxAssetBytes: loaded.limits.maxAssetBytes,
      maxImagePixels: loaded.limits.maxImagePixels,
    });
    const watcher = await watchCatalog(catalog);
    watchers.push(watcher);

    const created = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('watcher_timeout')), 4_000);
      const unsubscribe = catalog.journal.subscribe((event) => {
        if (event.type === 'created' && event.asset.name === 'external.json') {
          clearTimeout(timeout);
          unsubscribe();
          resolve(event.asset.name);
        }
      });
    });
    await writeFile(`${fixture.assetsRoot}/external.json`, '{}\n');
    await expect(created).resolves.toBe('external.json');
  }, 6_000);

  it('başlangıçta olmayan yapılandırılmış root oluşturulunca kataloğa alır', async () => {
    const fixture = await createFixtureProject();
    fixtures.push(fixture);
    await writeFile(
      `${fixture.repoRoot}/asset-studio.json`,
      `${JSON.stringify({
        schemaVersion: 1,
        roots: [
          {
            id: 'assets',
            path: 'assets',
            role: 'source',
            kinds: ['image', 'audio', 'metadata'],
          },
          {
            id: 'generated',
            path: 'generated',
            role: 'derived',
            kinds: ['metadata'],
          },
        ],
        ignore: [],
      })}\n`,
    );
    const loaded = await loadProjectConfig(fixture.repoRoot);
    const catalog = await AssetCatalog.create({
      repoRoot: loaded.repoRoot,
      project: loaded.project,
      maxAssetBytes: loaded.limits.maxAssetBytes,
      maxImagePixels: loaded.limits.maxImagePixels,
    });
    const watcher = await watchCatalog(catalog);
    watchers.push(watcher);
    const created = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('missing_root_timeout')), 4_000);
      const unsubscribe = catalog.journal.subscribe((event) => {
        if (event.type === 'created' && event.asset.rootId === 'generated') {
          clearTimeout(timeout);
          unsubscribe();
          resolve(event.asset.name);
        }
      });
    });
    await mkdir(`${fixture.repoRoot}/generated`);
    await writeFile(`${fixture.repoRoot}/generated/new.json`, '{}\n');
    await expect(created).resolves.toBe('new.json');
  }, 6_000);
});
