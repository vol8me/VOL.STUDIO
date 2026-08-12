import { describe, it, expect, afterEach, vi } from 'vitest';
import { StemLoader } from '../../../src/audio/music/loader';

function fakeResponse(ok: boolean, status: number, contentType: string | null): Response {
  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null),
    },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as unknown as Response;
}

function fakeContext(): AudioContext {
  return {
    decodeAudioData: vi.fn(() => Promise.resolve({} as AudioBuffer)),
  } as unknown as AudioContext;
}

describe('StemLoader — .ogg -> .mp3 fallback', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('.ogg 404 dönerse .mp3 dener ve başarılı olursa AudioBuffer döner', async () => {
    // `StemLoader` fetch'i her zaman string src ile çağırır (bkz. loader.ts) —
    // mock parametresini buna göre daraltmak `no-base-to-string` uyarısını önler.
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('.ogg')) return Promise.resolve(fakeResponse(false, 404, null));
      return Promise.resolve(fakeResponse(true, 200, 'audio/mpeg'));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const loader = new StemLoader(fakeContext());
    const buffer = await loader.loadFromUrl('track.ogg');

    expect(buffer).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('track.mp3');
  });

  it('.ogg ve .mp3 ikisi de başarısız olursa son (mp3) denemenin hatasını fırlatır', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(fakeResponse(false, 404, null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const loader = new StemLoader(fakeContext());

    await expect(loader.loadFromUrl('track.ogg')).rejects.toThrow(/track\.mp3/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('.ogg olmayan kaynaklarda (.wav) fallback denenmez, orijinal hata fırlatılır', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(fakeResponse(false, 404, null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const loader = new StemLoader(fakeContext());

    await expect(loader.loadFromUrl('track.wav')).rejects.toThrow(/track\.wav/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ilk deneme başarılı olursa fallback hiç denenmez', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(fakeResponse(true, 200, 'audio/ogg')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const loader = new StemLoader(fakeContext());
    await loader.loadFromUrl('track.ogg');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sorgu string/fragment içeren .ogg URL için de doğru .mp3 üretir', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('.ogg?v=2')) return Promise.resolve(fakeResponse(false, 404, null));
      return Promise.resolve(fakeResponse(true, 200, 'audio/mpeg'));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const loader = new StemLoader(fakeContext());
    await loader.loadFromUrl('track.ogg?v=2');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('track.mp3?v=2');
  });

  it('çağıran signal abort ederse fallback denenmez, iptal hatası doğrudan fırlatılır', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const loader = new StemLoader(fakeContext());

    await expect(loader.loadFromUrl('track.ogg', { signal: controller.signal })).rejects.toThrow();
    // Yalnızca ilk (.ogg) deneme yapılmalı — abort sonrası .mp3 fallback denenmemeli.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('.ogg ve .mp3 ikisi de başarısız olursa orijinal .ogg hatası cause olarak zincirlenir', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('.ogg')) return Promise.resolve(fakeResponse(false, 500, null));
      return Promise.resolve(fakeResponse(false, 404, null));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const loader = new StemLoader(fakeContext());

    try {
      await loader.loadFromUrl('track.ogg');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/track\.mp3/);
      expect((err as Error).cause).toBeInstanceOf(Error);
      expect(((err as Error).cause as Error).message).toMatch(/track\.ogg.*500/);
    }
  });
});
