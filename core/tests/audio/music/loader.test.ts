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

describe('StemLoader — URL yükleme', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('başarılı yanıt çözülür; tek istek yapılır', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(fakeResponse(true, 200, 'audio/ogg')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const buffer = await new StemLoader(fakeContext()).loadFromUrl('track.ogg');

    expect(buffer).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('başarısız .ogg başka biçime düşmez; hata kaynağı ve durumu adıyla fırlatılır', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(fakeResponse(false, 404, null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new StemLoader(fakeContext()).loadFromUrl('track.ogg')).rejects.toThrow(
      /track\.ogg.*404/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('signal zaten abort edilmişse fetch hiç denenmez', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('should not reach')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const controller = new AbortController();
    controller.abort();
    const loader = new StemLoader(fakeContext());

    await expect(loader.loadFromUrl('track.ogg', { signal: controller.signal })).rejects.toThrow(
      /iptal/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
