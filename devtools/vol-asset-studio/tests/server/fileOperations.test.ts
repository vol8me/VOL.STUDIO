import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetCatalog } from '../../server/catalog.js';
import { loadProjectConfig } from '../../server/config.js';
import { TrashStore, findReferences, previewRename } from '../../server/fileOperations.js';
import { createFixtureProject, type FixtureProject } from './fixtures.js';

const fixtures: FixtureProject[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function setup(): Promise<{ fixture: FixtureProject; catalog: AssetCatalog }> {
  const fixture = await createFixtureProject();
  fixtures.push(fixture);
  const loaded = await loadProjectConfig(fixture.repoRoot);
  const catalog = await AssetCatalog.create({
    repoRoot: loaded.repoRoot,
    project: loaded.project,
    maxAssetBytes: loaded.limits.maxAssetBytes,
    maxImagePixels: loaded.limits.maxImagePixels,
  });
  return { fixture, catalog };
}

function pngRecord(catalog: AssetCatalog) {
  const asset = catalog.snapshot().assets.find((entry) => entry.path.endsWith('car.png'));
  if (asset === undefined) throw new Error('fixture png bulunamadı');
  return catalog.get(asset.id);
}

describe('TrashStore — kurtarılabilir silme', () => {
  it('dosyayı çöpe taşır, repodan kaldırır ve kaydeder', async () => {
    const { fixture, catalog } = await setup();
    const trash = new TrashStore(join(fixture.cacheRoot, 'trash'));
    const record = pngRecord(catalog);

    const entry = await trash.trash(record);

    expect(entry.originalPath).toBe(record.summary.path);
    expect(entry.bytes).toBeGreaterThan(0);
    await expect(stat(fixture.pngPath)).rejects.toThrow();
    expect(await trash.list()).toHaveLength(1);
  });

  it('geri yükleme dosyayı BİREBİR döndürür', async () => {
    const { fixture, catalog } = await setup();
    const trash = new TrashStore(join(fixture.cacheRoot, 'trash'));
    const before = await readFile(fixture.pngPath);
    const entry = await trash.trash(pngRecord(catalog));

    await trash.restore(entry.trashId, fixture.repoRoot);

    expect((await readFile(fixture.pngPath)).equals(before)).toBe(true);
    expect(await trash.list()).toHaveLength(0);
  });

  it('hedef doluysa geri yükleme ÜZERİNE YAZMAZ', async () => {
    const { fixture, catalog } = await setup();
    const trash = new TrashStore(join(fixture.cacheRoot, 'trash'));
    const entry = await trash.trash(pngRecord(catalog));
    await writeFile(fixture.pngPath, 'yeni içerik');

    await expect(trash.restore(entry.trashId, fixture.repoRoot)).rejects.toMatchObject({
      code: 'asset_conflict',
    });
    expect(await readFile(fixture.pngPath, 'utf8')).toBe('yeni içerik');
  });

  it('bilinmeyen kimliği reddeder', async () => {
    const { fixture } = await setup();
    const trash = new TrashStore(join(fixture.cacheRoot, 'trash'));

    await expect(trash.restore('a'.repeat(24), fixture.repoRoot)).rejects.toMatchObject({
      code: 'asset_not_found',
    });
  });

  it('biçimsiz kimliği reddeder', async () => {
    const { fixture } = await setup();
    const trash = new TrashStore(join(fixture.cacheRoot, 'trash'));

    await expect(trash.restore('../kacis', fixture.repoRoot)).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('birden çok silme bağımsız kayıt tutar', async () => {
    const { fixture, catalog } = await setup();
    const trash = new TrashStore(join(fixture.cacheRoot, 'trash'));
    const png = pngRecord(catalog);
    const wav = catalog.get(
      catalog.snapshot().assets.find((entry) => entry.path.endsWith('tone.wav'))!.id,
    );

    await trash.trash(png);
    await trash.trash(wav);

    const entries = await trash.list();
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((entry) => entry.trashId)).size).toBe(2);
  });
});

describe('findReferences', () => {
  it('tam yolu ve dosya adını ayrı ayrı bulur', async () => {
    const { fixture } = await setup();
    await writeFile(
      join(fixture.repoRoot, 'kod.ts'),
      "import sprite from './assets/car.png';\nconst ad = 'car.png';\n",
    );

    const hits = await findReferences(fixture.repoRoot, 'assets/car.png');

    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every((hit) => hit.file === 'kod.ts')).toBe(true);
    expect(hits[0].line).toBe(1);
  });

  it('varlığın kendi dosyasını referans saymaz', async () => {
    const { fixture } = await setup();

    const hits = await findReferences(fixture.repoRoot, 'assets/car.json');

    expect(hits.every((hit) => hit.file !== 'assets/car.json')).toBe(true);
  });

  it('node_modules ve dist taranmaz', async () => {
    const { fixture } = await setup();
    await mkdir(join(fixture.repoRoot, 'node_modules'), { recursive: true });
    await writeFile(join(fixture.repoRoot, 'node_modules', 'x.ts'), "'car.png'");

    const hits = await findReferences(fixture.repoRoot, 'assets/car.png');

    expect(hits.every((hit) => !hit.file.includes('node_modules'))).toBe(true);
  });

  it('ikili dosyalar taranmaz', async () => {
    const { fixture } = await setup();

    const hits = await findReferences(fixture.repoRoot, 'assets/car.png');

    expect(hits.every((hit) => !hit.file.endsWith('.png'))).toBe(true);
  });

  it('satır metni kırpılır', async () => {
    const { fixture } = await setup();
    await writeFile(join(fixture.repoRoot, 'uzun.ts'), `// ${'x'.repeat(500)} car.png`);

    const hits = await findReferences(fixture.repoRoot, 'assets/car.png');

    for (const hit of hits) expect(hit.text.length).toBeLessThanOrEqual(200);
  });
});

describe('previewRename', () => {
  it('hedef yolu ve referansları önizler, UYGULAMAZ', async () => {
    const { fixture, catalog } = await setup();
    await writeFile(join(fixture.repoRoot, 'kod.ts'), "const yol = 'assets/car.png';");
    const record = pngRecord(catalog);

    const preview = await previewRename(catalog, record.summary.id, 'araba.png');

    expect(preview.from).toBe('assets/car.png');
    expect(preview.to).toBe('assets/araba.png');
    expect(preview.references.length).toBeGreaterThan(0);
    expect(preview.targetExists).toBe(false);
    // Önizleme diske DOKUNMAZ.
    await expect(stat(fixture.pngPath)).resolves.toBeTruthy();
  });

  it('hedef doluysa bildirir', async () => {
    const { fixture, catalog } = await setup();
    await writeFile(join(fixture.repoRoot, 'assets', 'dolu.png'), 'x');
    const record = pngRecord(catalog);

    const preview = await previewRename(catalog, record.summary.id, 'dolu.png');

    expect(preview.targetExists).toBe(true);
  });

  it('yol ayracı taşıyan adı reddeder', async () => {
    const { catalog } = await setup();
    const record = pngRecord(catalog);

    await expect(previewRename(catalog, record.summary.id, 'alt/ad.png')).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(previewRename(catalog, record.summary.id, '../kacis.png')).rejects.toMatchObject({
      code: 'path_outside_workspace',
    });
  });

  it('salt okunur varlığı reddeder', async () => {
    const fixture = await createFixtureProject();
    fixtures.push(fixture);
    await writeFile(
      join(fixture.repoRoot, 'asset-studio.json'),
      JSON.stringify({
        schemaVersion: 1,
        roots: [{ id: 'assets', path: 'assets', role: 'readonly', kinds: ['image'] }],
        ignore: [],
      }),
    );
    const loaded = await loadProjectConfig(fixture.repoRoot);
    const catalog = await AssetCatalog.create({
      repoRoot: loaded.repoRoot,
      project: loaded.project,
      maxAssetBytes: loaded.limits.maxAssetBytes,
      maxImagePixels: loaded.limits.maxImagePixels,
    });

    await expect(
      previewRename(catalog, pngRecord(catalog).summary.id, 'yeni.png'),
    ).rejects.toMatchObject({ code: 'asset_readonly' });
  });
});
