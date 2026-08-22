import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SpriteDoc } from '@volstudio/core/visual';
import { listOutputs, loadOutput, saveOutput } from '../../src/io/forgeClient';

const DOC = { schemaVersion: 1 } as unknown as SpriteDoc;

function mockFetch(status: number, payload: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(payload),
    } as Response),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('çıktı istemcisi (§8.11)', () => {
  it('kaydetme yalnızca BELGEYİ gönderir — PNG"yi sunucu üretir', async () => {
    const fetchMock = mockFetch(200, {
      docPath: 'material/a.json',
      pngPath: 'material/a.png',
      width: 64,
      height: 64,
      qaPass: true,
      qaMetrics: [],
    });

    const result = await saveOutput('material', 'a', DOC);
    expect(result.pngPath).toBe('material/a.png');
    expect(result.qaPass).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/forge/save');
    const raw = typeof init.body === 'string' ? init.body : '';
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['category', 'doc', 'name']);
    // Tarayıcı PNG kodlamaz; gövdede raster yok (D8).
    expect(raw).not.toContain('png');
  });

  it('sunucu hatası mesajıyla birlikte fırlatılır', async () => {
    mockFetch(400, { error: 'bilinmeyen kategori: metaller' });
    await expect(saveOutput('material', 'a', DOC)).rejects.toThrow(/bilinmeyen kategori/);
  });

  it('mesajsız hata durum koduna düşer', async () => {
    mockFetch(500, {});
    await expect(saveOutput('material', 'a', DOC)).rejects.toThrow(/HTTP 500/);
  });

  it('listeleme kategorileri ve çıktıları döndürür', async () => {
    mockFetch(200, { categories: ['material'], outputs: { material: ['a'] } });
    const listing = await listOutputs();
    expect(listing.outputs.material).toEqual(['a']);
  });

  it('yükleme yolu URL kodlanır', async () => {
    const fetchMock = mockFetch(200, { doc: DOC });
    await loadOutput('material/a b.json');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/forge/load?path=material%2Fa%20b.json');
  });
});
