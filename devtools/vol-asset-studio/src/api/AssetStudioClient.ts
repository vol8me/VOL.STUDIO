import type {
  AssetEvent,
  AssetSummary,
  AudioMetadata,
  CatalogResponse,
  ProjectResponse,
  SessionResponse,
} from '../../shared/index';

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

/** Repo hostunun sürümlü HTTP/SSE yüzeyini tek noktada toplar. */
export class AssetStudioClient {
  constructor(private readonly baseUrl = '') {}

  getProject(signal?: AbortSignal): Promise<ProjectResponse> {
    return this.request<ProjectResponse>('/api/v1/project', signal);
  }

  getCatalog(signal?: AbortSignal): Promise<CatalogResponse> {
    return this.request<CatalogResponse>('/api/v1/catalog', signal);
  }

  getAudioMetadata(assetId: string, signal?: AbortSignal): Promise<AudioMetadata> {
    return this.request<AudioMetadata>(this.assetUrl(assetId, 'audio'), signal);
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
    init: Pick<RequestInit, 'method' | 'headers'> = {},
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

  private assetUrl(assetId: string, action: 'content' | 'thumbnail' | 'audio'): string {
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
}
