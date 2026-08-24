import type { AudioEditOperation, AudioRenderResponse } from '../../shared/audio';
import type { WaveformData } from '../audio/WaveformView';
import type {
  AssetEvent,
  AssetSummary,
  AudioMetadata,
  CatalogResponse,
  LeaseResponse,
  ProjectResponse,
  SaveTransactionResponse,
  SessionResponse,
} from '../../shared/index';

export interface RasterPayload {
  width: number;
  height: number;
  revision: string;
  rgba: Uint8ClampedArray;
  strippedMetadata: string[];
}

type ConnectionState = 'live' | 'offline' | 'reconnecting';

interface ErrorPayload {
  error?: {
    code?: string;
  };
}

export class AssetStudioApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'AssetStudioApiError';
  }
}

export interface AssetEventSubscription {
  close(): void;
}

/** Hata gövdesinden sözleşmeli kodu çıkarır; okunamazsa güvenli yedeğe düşer. */
async function errorCodeOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ErrorPayload;
    return body.error?.code ?? 'request_failed';
  } catch {
    return 'request_failed';
  }
}

/** Repo hostunun sürümlü HTTP/SSE yüzeyini tek noktada toplar. */
export class AssetStudioClient {
  private clientId: string;
  private leaseId?: string;
  private leaseExpiresAt?: number;

  constructor(private readonly baseUrl = '') {
    this.clientId = this.#makeClientId();
  }

  getProject(signal?: AbortSignal): Promise<ProjectResponse> {
    return this.request<ProjectResponse>('/api/v1/project', signal);
  }

  getCatalog(signal?: AbortSignal): Promise<CatalogResponse> {
    return this.request<CatalogResponse>('/api/v1/catalog', signal);
  }

  getAudioMetadata(assetId: string, signal?: AbortSignal): Promise<AudioMetadata> {
    return this.request<AudioMetadata>(this.assetUrl(assetId, 'audio'), signal);
  }

  /**
   * Düzenlenebilir piksel verisini indirir.
   *
   * `request()` JSON bekler; raster ikili olduğu için ayrı yol izler. Boyut ve
   * revizyon başlıklardan okunur — gövde saf piksel kalmalı ki
   * `Uint8ClampedArray`ye kopyasız sarılabilsin.
   */
  async getRaster(assetId: string, signal?: AbortSignal): Promise<RasterPayload> {
    const response = await fetch(this.url(this.assetUrl(assetId, 'raster')), {
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) {
      throw new AssetStudioApiError(await errorCodeOf(response), response.status);
    }
    const width = Number(response.headers.get('x-vol-raster-width'));
    const height = Number(response.headers.get('x-vol-raster-height'));
    const revision = response.headers.get('x-vol-asset-revision') ?? '';
    const buffer = await response.arrayBuffer();
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
      throw new AssetStudioApiError('decode_failed', response.status);
    }
    if (buffer.byteLength !== width * height * 4) {
      throw new AssetStudioApiError('decode_failed', response.status);
    }
    const stripped = response.headers.get('x-vol-stripped-metadata') ?? '';
    return {
      width,
      height,
      revision,
      rgba: new Uint8ClampedArray(buffer),
      strippedMetadata: stripped === '' ? [] : stripped.split(','),
    };
  }

  /** Dalga formu peak piramidi ve QA raporu. */
  getWaveform(assetId: string, signal?: AbortSignal): Promise<WaveformData> {
    return this.request(`/api/v1/assets/${encodeURIComponent(assetId)}/waveform`, signal);
  }

  async saveAudio(
    assetId: string,
    expectedRevision: string,
    operations: readonly AudioEditOperation[],
    signal?: AbortSignal,
  ): Promise<AudioRenderResponse> {
    await this.#ensureLease(signal);
    return this.request<AudioRenderResponse>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/audio/render`,
      signal,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vol-client-id': this.clientId,
          'x-vol-lease-id': this.leaseId!,
        },
        body: JSON.stringify({ expectedRevision, operations }),
      },
    );
  }

  /**
   * Seçili ses işlemlerinin sunucuda uygulanmış halini blob olarak indirir.
   *
   * İstemci oynatıcıya bu URL'yi verir; dosya kaydedilmeden önce duyulabilir.
   */
  async previewAudio(
    assetId: string,
    expectedRevision: string,
    operations: readonly AudioEditOperation[],
    signal?: AbortSignal,
  ): Promise<Blob> {
    const response = await fetch(
      this.url(`/api/v1/assets/${encodeURIComponent(assetId)}/audio/preview`),
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision, operations }),
        ...(signal === undefined ? {} : { signal }),
      },
    );
    if (!response.ok) {
      throw new AssetStudioApiError(await errorCodeOf(response), response.status);
    }
    return response.blob();
  }

  /** Tek varlığı tek mantıksal transaction olarak kaydeder. */
  async saveRaster(
    asset: Pick<AssetSummary, 'id'>,
    expectedRevision: string,
    png: Blob,
    signal?: AbortSignal,
  ): Promise<SaveTransactionResponse> {
    await this.#ensureLease(signal);
    const transactionId = `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const body = new FormData();
    body.set(
      'transaction',
      JSON.stringify({
        transactionId,
        targets: [{ assetId: asset.id, expectedRevision, payloadPart: 'payload0' }],
      }),
    );
    body.set('payload0', png, 'payload0.png');
    return this.request<SaveTransactionResponse>('/api/v1/save-transactions', signal, {
      method: 'POST',
      headers: {
        'x-vol-client-id': this.clientId,
        'x-vol-lease-id': this.leaseId!,
      },
      body,
    });
  }

  /** Sunucudan bir editör lease'i alır. */
  async acquireLease(signal?: AbortSignal): Promise<void> {
    const response = await this.request<LeaseResponse>('/api/v1/session/lease', signal, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: this.clientId }),
    });
    if (
      response.mode !== 'editor' ||
      response.leaseId === undefined ||
      response.expiresAt === undefined
    ) {
      throw new AssetStudioApiError('editor_lease_required', 409);
    }
    this.leaseId = response.leaseId;
    this.leaseExpiresAt = new Date(response.expiresAt).getTime();
  }

  /** Mevcut lease'i yeniler; başarısızsa bir kez yeni lease almaya çalışır. */
  async renewLease(signal?: AbortSignal): Promise<void> {
    if (this.leaseId === undefined) {
      await this.acquireLease(signal);
      return;
    }
    try {
      const response = await this.request<LeaseResponse>('/api/v1/session/lease/renew', signal, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: this.clientId, leaseId: this.leaseId }),
      });
      if (response.leaseId !== undefined && response.expiresAt !== undefined) {
        this.leaseId = response.leaseId;
        this.leaseExpiresAt = new Date(response.expiresAt).getTime();
      }
    } catch (error) {
      if (error instanceof AssetStudioApiError && error.status === 409) {
        await this.acquireLease(signal);
        return;
      }
      throw error;
    }
  }

  /** Test veya manuel senaryolar için client/lease kimliklerini sabitler. */
  setLease(clientId: string, leaseId: string): void {
    this.clientId = clientId;
    this.leaseId = leaseId;
    this.leaseExpiresAt = Date.now() + 86_400_000;
  }

  authenticate(token: string, signal?: AbortSignal): Promise<SessionResponse> {
    return this.request<SessionResponse>('/api/v1/session/auth', signal, {
      method: 'POST',
      headers: { 'x-vol-asset-token': token },
    });
  }

  contentUrl(asset: Pick<AssetSummary, 'id' | 'revision'>): string {
    return this.withRevision(this.assetUrl(asset.id, 'content'), asset.revision);
  }

  thumbnailUrl(asset: Pick<AssetSummary, 'id' | 'revision'>, size = 320): string {
    const url = new URL(this.assetUrl(asset.id, 'thumbnail'), this.origin());
    url.searchParams.set('size', String(size));
    url.searchParams.set('revision', asset.revision);
    return this.relative(url);
  }

  subscribe(
    onEvent: (event: AssetEvent) => void,
    onConnection: (state: ConnectionState) => void,
  ): AssetEventSubscription {
    const source = new EventSource(this.url('/api/v1/events'));

    const handleOpen = (): void => onConnection('live');
    const handleError = (): void => {
      // Durum EventSource'un KENDİ readyState'inden okunur. Bir dönem yerel bir
      // `opened` bayrağı tutuluyordu; ikinci hatada bayrak çoktan sıfırlandığı
      // için tarayıcı hâlâ yeniden bağlanmaya çalışırken arayüz "bağlantı yok"
      // gösteriyordu. CLOSED gerçekten bitmiş demektir, CONNECTING denemede.
      onConnection(source.readyState === EventSource.CLOSED ? 'offline' : 'reconnecting');
    };
    const handleMessage = (rawEvent: Event): void => {
      if (!(rawEvent instanceof MessageEvent) || typeof rawEvent.data !== 'string') return;
      try {
        onEvent(JSON.parse(rawEvent.data) as AssetEvent);
      } catch {
        onConnection('reconnecting');
      }
    };
    source.addEventListener('open', handleOpen);
    source.addEventListener('error', handleError);
    source.addEventListener('message', handleMessage);

    return {
      close: () => {
        source.removeEventListener('open', handleOpen);
        source.removeEventListener('error', handleError);
        source.removeEventListener('message', handleMessage);
        source.close();
      },
    };
  }

  private async request<T>(
    path: string,
    signal?: AbortSignal,
    init: Pick<RequestInit, 'method' | 'headers' | 'body'> = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    const response = await fetch(this.url(path), {
      ...init,
      credentials: 'same-origin',
      headers,
      signal,
    });
    if (!response.ok) {
      let body: ErrorPayload = {};
      try {
        body = (await response.json()) as ErrorPayload;
      } catch {
        // JSON olmayan proxy/ağ hatası kodu aşağıdaki güvenli fallback'e düşer.
      }
      throw new AssetStudioApiError(body.error?.code ?? 'request_failed', response.status);
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      // 2xx ama JSON değil: araya giren bir katman (SPA fallback, proxy, portal)
      // HTML döndürmüştür. Ham `SyntaxError` sızdırmak yerine arayüzün
      // çevirebildiği sözleşmeli koda dönüştürülür.
      throw new AssetStudioApiError('request_failed', response.status, { cause: error });
    }
  }

  private assetUrl(assetId: string, action: 'content' | 'thumbnail' | 'audio' | 'raster'): string {
    return `/api/v1/assets/${encodeURIComponent(assetId)}/${action}`;
  }

  private withRevision(path: string, revision: string): string {
    const url = new URL(path, this.origin());
    url.searchParams.set('revision', revision);
    return this.relative(url);
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private origin(): string {
    return typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  }

  private relative(url: URL): string {
    return this.baseUrl
      ? `${this.baseUrl}${url.pathname}${url.search}`
      : `${url.pathname}${url.search}`;
  }

  #makeClientId(): string {
    const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
      return globalCrypto.randomUUID();
    }
    return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  async #ensureLease(signal?: AbortSignal): Promise<void> {
    if (
      this.leaseId === undefined ||
      this.leaseExpiresAt === undefined ||
      this.leaseExpiresAt - Date.now() < 5_000
    ) {
      await this.renewLease(signal);
    }
  }
}
