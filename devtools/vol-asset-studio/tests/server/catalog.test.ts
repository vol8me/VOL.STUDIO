import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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

  it('ses imzası, metadata yapısı ve boş dosya sorunlarını kataloglar', async () => {
    const fixture = await createFixtureProject();
    fixtures.push(fixture);
    await writeFile(fixture.wavPath, Buffer.from('not-wave'));
    await writeFile(`${fixture.assetsRoot}/car.json`, '{');
    await writeFile(`${fixture.assetsRoot}/empty.json`, '');

    const snapshot = (await createCatalog(fixture)).snapshot();
    expect(snapshot.assets.find((asset) => asset.name === 'tone.wav')?.problemCodes).toEqual([
      'audio_header_invalid',
    ]);
    expect(snapshot.assets.find((asset) => asset.name === 'car.json')?.problemCodes).toEqual([
      'metadata_parse_failed',
    ]);
    expect(snapshot.assets.find((asset) => asset.name === 'empty.json')?.problemCodes).toEqual([
      'asset_empty',
    ]);
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

  describe('belge son ekleri', () => {
    /*
     * Sıra bir DOĞRULUK koşuludur: `.volsprite.json` de `.json` ile biter.
     * Kısa son ek önce denenirse her belge `metadata` sayılır ve tür bilgisi
     * sessizce kaybolur. Son ekler bir dönem hem sınıflandırmada hem ilişki
     * taban yolunda AYRI AYRI yazılıydı; biri güncellenip diğeri unutulabilirdi.
     */
    /**
     * Kök, TÜM türleri kabul eder.
     *
     * Ortak fixture yalnız `image`/`audio`/`metadata` bildirir; belge türleri
     * o allowlist'te olmadığı için katalogdan elenirler ve sınıflandırma hiç
     * sınanmamış olurdu.
     */
    async function catalogWith(files: Record<string, string>): Promise<AssetCatalog> {
      const fixture = await createFixtureProject();
      fixtures.push(fixture);
      await writeFile(
        join(fixture.repoRoot, 'asset-studio.json'),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            name: 'Suffix Fixture',
            roots: [
              {
                id: 'assets',
                path: 'assets',
                role: 'source',
                kinds: ['image', 'audio', 'metadata', 'sprite-document', 'audio-recipe'],
              },
            ],
            // Üst düzey `ignore` ZORUNLUDUR (bkz. `shared/config.ts`);
            // `catalog.ts` onu korumasız yayar.
            ignore: [],
          },
          null,
          2,
        )}\n`,
      );
      for (const [name, body] of Object.entries(files)) {
        await writeFile(join(fixture.assetsRoot, name), body);
      }
      return createCatalog(fixture);
    }

    it('tür belgelerini KISA `.json` yerine kendi türüne sınıflar', async () => {
      const catalog = await catalogWith({
        'ship.volsprite.json': '{"schemaVersion":1}\n',
        'hum.volaudio.json': '{"schemaVersion":1}\n',
        'ship.volmeta.json': '{"note":"serbest"}\n',
      });
      const byName = new Map(catalog.snapshot().assets.map((asset) => [asset.name, asset.kind]));

      expect(byName.get('ship.volsprite.json')).toBe('sprite-document');
      expect(byName.get('hum.volaudio.json')).toBe('audio-recipe');
      expect(byName.get('ship.volmeta.json')).toBe('metadata');
      // Düz JSON hâlâ metadata; tabloda en sonda olması onu dışlamaz.
      expect(byName.get('car.json')).toBe('metadata');
    });

    it('bir çıktıya bakan BÜTÜN belgeler ilişki listesinde kalır', async () => {
      /*
       * `car.png`e hem sprite tarifi hem serbest metadata bakar. Eskiden her
       * belge `relatedIds`i tek elemanlı bir diziyle EZİYORDU: çıktı, son
       * işlenen belge dışındaki bütün bağlarını kaybediyordu ve arayüzde tek
       * bir ilişki görünüyordu.
       */
      const catalog = await catalogWith({ 'car.volsprite.json': '{"schemaVersion":1}\n' });
      const snapshot = catalog.snapshot();
      const byName = new Map(snapshot.assets.map((asset) => [asset.name, asset]));
      const image = byName.get('car.png');

      expect(image?.relation?.relatedIds).toHaveLength(2);
      expect(image?.relation?.relatedIds).toContain(byName.get('car.json')?.id);
      expect(image?.relation?.relatedIds).toContain(byName.get('car.volsprite.json')?.id);
    });

    it('TARİF, sidecar metadata’dan öncelikli olarak `recipeId` olur', async () => {
      /*
       * Metadata bir sidecar'dır, çıktıyı ÜRETEN değildir. Kayıt sırası hangisi
       * önce gelirse gelsin sonuç aynı olmalı; belgeler iki turda gezilir ve
       * gerçek tarif her zaman kazanır.
       */
      const catalog = await catalogWith({ 'car.volsprite.json': '{"schemaVersion":1}\n' });
      const byName = new Map(catalog.snapshot().assets.map((asset) => [asset.name, asset]));

      expect(byName.get('car.png')?.relation?.recipeId).toBe(byName.get('car.volsprite.json')?.id);
      // Tarif de kendi ürettiğini `derivedIds` ile bildirir; sidecar bildirmez.
      expect(byName.get('car.volsprite.json')?.relation?.derivedIds).toContain(
        byName.get('car.png')?.id,
      );
      expect(byName.get('car.json')?.relation?.derivedIds).toBeUndefined();
    });

    it('ilişki taban yolu belge son ekinin TAMAMINI atar', async () => {
      /*
       * `car.png` ile `car.volsprite.json` aynı tabana indiğinde ilişkilenir.
       * Yalnız `.json` atılsaydı taban `car.volsprite` olur ve ikisi hiç
       * eşleşmezdi.
       */
      const catalog = await catalogWith({ 'car.volsprite.json': '{"schemaVersion":1}\n' });
      const snapshot = catalog.snapshot();
      const image = snapshot.assets.find((asset) => asset.name === 'car.png');
      const document = snapshot.assets.find((asset) => asset.name === 'car.volsprite.json');

      expect(document).toBeDefined();
      expect(image?.relation?.relatedIds).toContain(document?.id);
    });
  });
});
