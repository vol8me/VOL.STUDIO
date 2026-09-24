import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cacheKey, MemoryRenderCache } from '../../src/engine/renderCache';
import {
  codeFingerprint,
  DiskRenderCache,
  LayeredRenderCache,
  RENDER_CACHE_ENV,
  repoRenderCache,
} from '../../src/protocol/renderCacheStore';

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'vol-render-cache-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  delete process.env[RENDER_CACHE_ENV];
});

const ramp = (length: number, scale = 1) =>
  Float32Array.from({ length }, (_, i) => (scale * (i - length / 2)) / length);

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('disk render önbelleği', () => {
  it('mono ve stereo girdiyi birebir geri okur', () => {
    const cache = new DiskRenderCache(tempRoot());
    const mono = [ramp(333)];
    const stereo = [ramp(128), ramp(128, -0.5)];
    cache.write(cacheKey({ c: 1 }), mono);
    cache.write(cacheKey({ c: 2 }), stereo);
    expect(cache.read(cacheKey({ c: 1 }))).toEqual(mono);
    expect(cache.read(cacheKey({ c: 2 }))).toEqual(stereo);
    expect(cache.read(cacheKey({ c: 3 }))).toBeUndefined();
    expect(cache.stats).toMatchObject({ hits: 2, misses: 1, writes: 2 });
  });

  it('yarım ya da bozuk girdi ıska sayılır ve silinir', () => {
    const cache = new DiskRenderCache(tempRoot());
    const key = cacheKey({ torn: true });
    cache.write(key, [ramp(64)]);
    const [file] = files(cache.dir);
    writeFileSync(file, Buffer.alloc(40));
    expect(cache.read(key)).toBeUndefined();
    expect(files(cache.dir)).toEqual([]);
  });

  it('kod parmak izi değişince eski dizin hiç okunmadan temizlenir', () => {
    const root = tempRoot();
    const stale = join(root, 'eskiparmakizi000');
    mkdirSync(stale, { recursive: true });
    writeFileSync(join(stale, 'x.f32'), 'eski');
    const cache = new DiskRenderCache(root);
    expect(readdirSync(root)).toEqual([]);
    expect(cache.dir).toBe(join(root, codeFingerprint()));
    expect(codeFingerprint()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('bayt sınırı aşılınca en eski kullanılan girdiler bütçenin %80’ine kadar atılır', () => {
    const entry = 16 + 256 * 4;
    const cache = new DiskRenderCache(tempRoot(), { maxBytes: 4 * entry, maxEntryBytes: entry });
    const keys = [0, 1, 2, 3].map((i) => cacheKey({ i }));
    keys.forEach((key, i) => {
      cache.write(key, [ramp(256)]);
      const [latest] = files(cache.dir).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      utimesSync(latest, new Date(1000 * (i + 1)), new Date(1000 * (i + 1)));
    });
    cache.write(cacheKey({ i: 4 }), [ramp(256)]);
    expect(cache.stats.evictions).toBeGreaterThan(0);
    expect(cache.read(keys[0])).toBeUndefined();
    expect(cache.read(cacheKey({ i: 4 }))).toBeDefined();
    const total = files(cache.dir).reduce((sum, file) => sum + statSync(file).size, 0);
    expect(total).toBeLessThanOrEqual(4 * entry * 0.8);
    cache.write(cacheKey({ big: true }), [ramp(2048)]);
    expect(cache.stats.skipped).toBe(1);
  });

  it('katmanlı önbellekte disk isabeti belleğe alınır', () => {
    const root = tempRoot();
    const key = cacheKey({ layered: 1 });
    new DiskRenderCache(root).write(key, [ramp(32)]);
    const memory = new MemoryRenderCache({ maxBytes: 1 << 20 });
    const layered = new LayeredRenderCache(memory, new DiskRenderCache(root));
    expect(layered.read(key)).toEqual([ramp(32)]);
    expect(memory.read(key)).toEqual([ramp(32)]);
  });

  it('ortam değişkeni önbelleği kapatır; açıkken depo başına tek örnek', () => {
    const root = tempRoot();
    expect(repoRenderCache(root)).toBe(repoRenderCache(root));
    process.env[RENDER_CACHE_ENV] = 'off';
    expect(repoRenderCache(root)).toBeNull();
  });
});
