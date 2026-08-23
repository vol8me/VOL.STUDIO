import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactCache } from '../../server/artifactCache.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vol-artifact-cache-'));
  roots.push(root);
  return root;
}

describe('ArtifactCache', () => {
  it('ilk istekte üretir, ikincisinde diskten okur', async () => {
    const cache = new ArtifactCache({ directory: await createRoot(), namespace: 'thumbnails' });
    const produce = vi.fn(() => Promise.resolve(Buffer.from('artefakt')));

    const first = await cache.resolve('abc123-192', produce);
    const second = await cache.resolve('abc123-192', produce);

    expect(first.toString()).toBe('artefakt');
    expect(second.toString()).toBe('artefakt');
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('aynı anahtarın eşzamanlı isteklerini tek üretimde birleştirir', async () => {
    const cache = new ArtifactCache({ directory: await createRoot(), namespace: 'thumbnails' });
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const produce = vi.fn(async () => {
      await gate;
      return Buffer.from('tek');
    });

    const pending = [
      cache.resolve('eszamanli-64', produce),
      cache.resolve('eszamanli-64', produce),
      cache.resolve('eszamanli-64', produce),
    ];
    release?.();
    const results = await Promise.all(pending);

    expect(produce).toHaveBeenCalledTimes(1);
    expect(results.map((buffer) => buffer.toString())).toEqual(['tek', 'tek', 'tek']);
  });

  it('farklı revision farklı anahtar üretir; eski girdi ezilmez', async () => {
    const directory = await createRoot();
    const cache = new ArtifactCache({ directory, namespace: 'thumbnails' });

    await cache.resolve('rev1-192', () => Promise.resolve(Buffer.from('eski')));
    const fresh = await cache.resolve('rev2-192', () => Promise.resolve(Buffer.from('yeni')));
    const reread = await cache.resolve('rev1-192', () => Promise.resolve(Buffer.from('yanlis')));

    expect(fresh.toString()).toBe('yeni');
    expect(reread.toString()).toBe('eski');
  });

  it('yazım hatasında isteği düşürmez, artefaktı yine döndürür', async () => {
    const onError = vi.fn();
    // Var olmayan derin yol yerine bir DOSYA üzerine dizin açmaya zorlanır:
    // mkdir ENOTDIR verir, cache devre dışı kalır ama üretim sürer.
    const directory = await createRoot();
    const cache = new ArtifactCache({
      directory: join(directory, 'engel'),
      namespace: 'thumbnails',
      onError,
    });
    await rm(join(directory, 'engel'), { force: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(directory, 'engel'), 'dosya');

    const result = await cache.resolve('yazilamaz-32', () => Promise.resolve(Buffer.from('veri')));

    expect(result.toString()).toBe('veri');
    expect(onError).toHaveBeenCalled();
  });

  it('yarım kalan .part dosyası bırakmaz', async () => {
    const directory = await createRoot();
    const cache = new ArtifactCache({ directory, namespace: 'thumbnails' });

    await cache.resolve('temiz-192', () => Promise.resolve(Buffer.from('veri')));

    const shard = join(directory, 'thumbnails', 'te');
    const entries = await readdir(shard);
    expect(entries).toEqual(['temiz-192']);
    expect((await stat(join(shard, 'temiz-192'))).isFile()).toBe(true);
  });

  it('yol ayracı veya üst dizin taşıyan anahtarı reddeder', async () => {
    const cache = new ArtifactCache({ directory: await createRoot(), namespace: 'thumbnails' });
    const produce = (): Promise<Buffer> => Promise.resolve(Buffer.alloc(0));

    await expect(cache.resolve('../kacis', produce)).rejects.toThrow(RangeError);
    await expect(cache.resolve('alt/dizin', produce)).rejects.toThrow(RangeError);
    await expect(cache.resolve('', produce)).rejects.toThrow(RangeError);
    expect(() => new ArtifactCache({ directory: '/tmp', namespace: '../x' })).toThrow(RangeError);
  });
});
