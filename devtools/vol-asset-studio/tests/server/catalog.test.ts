import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetCatalog } from '../../server/catalog.js';
import { loadProjectConfig } from '../../server/config.js';
import type { AssetEvent } from '../../shared/contracts.js';
import { createFixtureProject, type FixtureProject } from './fixtures.js';

const fixtures: FixtureProject[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function createCatalog(fixture: FixtureProject): Promise<AssetCatalog> {
  const loaded = await loadProjectConfig(fixture.repoRoot);
  return AssetCatalog.create({
    repoRoot: loaded.repoRoot,
    project: loaded.project,
    maxAssetBytes: loaded.limits.maxAssetBytes,
    maxImagePixels: loaded.limits.maxImagePixels,
  });
}

function git(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true }, (error) => {
      if (error === null) resolve();
      else reject(error instanceof Error ? error : new Error('git_fixture_failed'));
    });
  });
}

describe('AssetCatalog', () => {
  it('görsel, ses ve JSON ilişkisini kararlı özetler', async () => {
    const fixture = await createFixtureProject();
    fixtures.push(fixture);
    const catalog = await createCatalog(fixture);
    const snapshot = catalog.snapshot();
    const image = snapshot.assets.find((asset) => asset.name === 'car.png');
    const metadata = snapshot.assets.find((asset) => asset.name === 'car.json');

    expect(snapshot.assets.map((asset) => asset.kind)).toEqual(['metadata', 'image', 'audio']);
    expect(image?.image).toEqual({ width: 2, height: 2, hasAlpha: true });
    expect(image?.relation?.recipeId).toBe(metadata?.id);
    expect(metadata?.relation?.relatedIds).toContain(image?.id);
    expect(image?.revision).toMatch(/^[a-f0-9]{64}$/);
  });

  it('içerik değişikliğini changed olayı olarak yayınlar', async () => {
    const fixture = await createFixtureProject();
    fixtures.push(fixture);
    const catalog = await createCatalog(fixture);
    const events: AssetEvent[] = [];
    catalog.journal.subscribe((event) => events.push(event));
    await writeFile(fixture.pngPath, Buffer.from('broken-png'));
    await catalog.refresh();

    const changed = events.find(
      (event): event is Extract<AssetEvent, { type: 'changed' }> => event.type === 'changed',
    );
    expect(changed?.asset.name).toBe('car.png');
    expect(changed?.asset.problemCodes).toEqual(['image_decode_failed']);
  });

  it('repo göreli Git durumunu clean, modified ve untracked olarak eşler', async () => {
    const fixture = await createFixtureProject();
    fixtures.push(fixture);
    await git(fixture.repoRoot, ['init', '--quiet']);
    await git(fixture.repoRoot, ['add', '.']);
    await git(fixture.repoRoot, [
      '-c',
      'user.name=VOL Test',
      '-c',
      'user.email=vol-test@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ]);
    await writeFile(`${fixture.assetsRoot}/car.json`, '{"changed":true}\n');
    await writeFile(`${fixture.assetsRoot}/new.json`, '{}\n');

    const snapshot = (await createCatalog(fixture)).snapshot();
    expect(snapshot.assets.find((asset) => asset.name === 'tone.wav')?.gitStatus).toBe('clean');
    expect(snapshot.assets.find((asset) => asset.name === 'car.json')?.gitStatus).toBe('modified');
    expect(snapshot.assets.find((asset) => asset.name === 'new.json')?.gitStatus).toBe('untracked');
  });

  it('başlangıçta olmayan derived rootu refresh sırasında keşfeder', async () => {
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
    const catalog = await createCatalog(fixture);
    expect(catalog.roots.find((root) => root.id === 'generated')?.available).toBe(false);
    await mkdir(`${fixture.repoRoot}/generated`);
    await writeFile(`${fixture.repoRoot}/generated/new.json`, '{}\n');
    await catalog.refresh();

    expect(catalog.roots.find((root) => root.id === 'generated')?.available).toBe(true);
    expect(catalog.snapshot().assets.some((asset) => asset.name === 'new.json')).toBe(true);
    expect(catalog.journal.since(1).some((event) => event.type === 'resync')).toBe(true);
  });
});
