import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetStudioApiError, AssetStudioClient } from '../../src/api/AssetStudioClient';

/**
 * Gerçek `EventSource` sözleşmesini taklit eder. `readyState` ve sabitleri
 * bilerek taşır: istemci bağlantı durumunu onlardan okur, sahte bunları
 * modellemezse test gerçekte olmayan bir davranışı doğrular.
 */
class FakeEventSource extends EventTarget {
  static latest: FakeEventSource | null = null;
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readyState: number = FakeEventSource.CONNECTING;
  close = vi.fn(() => {
    this.readyState = FakeEventSource.CLOSED;
  });

  constructor(readonly url: string) {
    super();
    FakeEventSource.latest = this;
  }

  message(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  /** Tarayıcının yeniden bağlanmayı sürdürdüğü geçici kopma. */
  dropConnection(): void {
    this.readyState = FakeEventSource.CONNECTING;
    this.dispatchEvent(new Event('error'));
  }

  /** Tarayıcının denemeyi bıraktığı kalıcı kopma. */
  failPermanently(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.dispatchEvent(new Event('error'));
  }
}

describe('AssetStudioClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeEventSource.latest = null;
  });

  it('JSON yanıtını okur ve varlık URLlerini güvenli kodlar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ revision: 2, assets: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AssetStudioClient();

    await expect(client.getCatalog()).resolves.toEqual({ revision: 2, assets: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/catalog',
      expect.objectContaining({ credentials: 'same-origin', signal: undefined }),
    );
    expect(client.contentUrl({ id: 'root:path /ç.png', revision: 'abc' })).toContain(
      '/api/v1/assets/root%3Apath%20%2F%C3%A7.png/content?revision=abc',
    );
    expect(client.thumbnailUrl({ id: 'x/y', revision: 'r 1' }, 512)).toBe(
      '/api/v1/assets/x%2Fy/thumbnail?size=512&revision=r+1',
    );
  });

  it('LAN erişim anahtarını yalnız oturum açma isteğinin headerında taşır', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true, expiresAt: '2026-08-24T00:00:00Z' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new AssetStudioClient().authenticate('secret-token');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('x-vol-asset-token')).toBe('secret-token');
    expect(init.credentials).toBe('same-origin');
  });

  it('sunucunun kararlı hata kodunu typed hataya dönüştürür', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'asset_not_found' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const error = await new AssetStudioClient().getProject().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AssetStudioApiError);
    expect(error).toMatchObject({ code: 'asset_not_found', status: 404 });
  });

  it('JSON olmayan hata yanıtında güvenli fallback kullanır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('proxy error', { status: 502 })));
    await expect(new AssetStudioClient().getCatalog()).rejects.toMatchObject({
      code: 'request_failed',
      status: 502,
    });
  });

  it('ses işlem zincirini JSON gövdesi, revizyon ve lease başlıklarıyla gönderir', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ assetId: 'audio-1', revision: 'b'.repeat(64), bytes: 128 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new AssetStudioClient();
    client.setLease('client-1', 'a'.repeat(32));
    await client.saveAudio('audio/1', 'a'.repeat(64), [{ kind: 'gain', decibels: -3 }]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/assets/audio%2F1/audio/render');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('x-vol-client-id')).toBe('client-1');
    expect(headers.get('x-vol-lease-id')).toBe('a'.repeat(32));
    expect(headers.get('content-type')).toBe('application/json');
    const bodyText = init.body as string;
    expect(JSON.parse(bodyText)).toEqual({
      expectedRevision: 'a'.repeat(64),
      operations: [{ kind: 'gain', decibels: -3 }],
    });
  });

  it('ses önizlemesini blob olarak indirir', async () => {
    const payload = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(payload, {
        status: 200,
        headers: { 'content-type': 'audio/ogg' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const blob = await new AssetStudioClient().previewAudio('audio/1', 'a'.repeat(64), [
      { kind: 'gain', decibels: -3 },
    ]);

    expect(blob.type).toBe('audio/ogg');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/assets/audio%2F1/audio/preview');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      expectedRevision: 'a'.repeat(64),
      operations: [{ kind: 'gain', decibels: -3 }],
    });
  });

  it('ses metadata ve dalga formu endpointlerini çağırır', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ codec: 'vorbis', durationSeconds: 1, sampleRate: 48000, channels: 2 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sampleRate: 48000,
            channelCount: 2,
            frameCount: 4800,
            levels: [],
            qa: { peakDbfs: -3, rmsDbfs: -12, clippedFrames: 0, pass: true },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AssetStudioClient();

    const metadata = await client.getAudioMetadata('audio:click');
    const waveform = await client.getWaveform('audio:click');

    expect(metadata).toMatchObject({ codec: 'vorbis' });
    expect(waveform).toMatchObject({ frameCount: 4800 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [waveUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(waveUrl).toBe('/api/v1/assets/audio%3Aclick/waveform');
  });

  it('art arda kopmalarda tarayıcı denedikçe yeniden bağlanıyor der', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const states: string[] = [];
    new AssetStudioClient().subscribe(
      () => {},
      (state) => states.push(state),
    );
    const source = FakeEventSource.latest!;

    source.readyState = FakeEventSource.OPEN;
    source.dispatchEvent(new Event('open'));
    source.dropConnection();
    source.dropConnection();
    source.failPermanently();

    // İkinci kopma da "reconnecting"tir: bir dönem yerel bayrak sıfırlandığı
    // için arayüz tarayıcı hâlâ denerken "bağlantı yok" gösteriyordu.
    expect(states).toEqual(['live', 'reconnecting', 'reconnecting', 'offline']);
  });

  it('SSE olaylarını ve bağlantı durumlarını yayınlar, close ile kaynağı kapatır', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const events: unknown[] = [];
    const states: string[] = [];
    const subscription = new AssetStudioClient().subscribe(
      (event) => events.push(event),
      (state) => states.push(state),
    );
    const source = FakeEventSource.latest!;

    source.readyState = FakeEventSource.OPEN;
    source.dispatchEvent(new Event('open'));
    source.message({ type: 'resync', revision: 4 });
    source.dropConnection();
    source.dispatchEvent(new MessageEvent('message', { data: '{broken' }));
    subscription.close();
    source.message({ type: 'resync', revision: 5 });

    expect(source.url).toBe('/api/v1/events');
    expect(events).toEqual([{ type: 'resync', revision: 4 }]);
    expect(states).toEqual(['live', 'reconnecting', 'reconnecting']);
    expect(source.close).toHaveBeenCalledOnce();
  });
});

describe('AssetStudioClient — bozuk yanıt sözleşmesi', () => {
  it('2xx ama JSON olmayan gövdeyi sözleşmeli hataya çevirir', async () => {
    // Geliştirme modunda SPA fallback API yollarını yutup HTML döndürüyordu;
    // istemci o durumda ham SyntaxError fırlatıyordu.
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AssetStudioClient();

    await expect(client.getCatalog()).rejects.toMatchObject({
      name: 'AssetStudioApiError',
      code: 'request_failed',
      status: 200,
    });
    vi.unstubAllGlobals();
  });
});
