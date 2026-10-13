interface Target {
  WebSocket?: new (url: string | URL, protocols?: unknown) => unknown;
}

/**
 * Colyseus SDK `new WebSocket(url, { headers, protocols })` (Node imzası) ile dener, hata fırlarsa tarayıcı
 * imzasına düşer. WebKit ikinci argümanı protokol listesi sanıp bu çağrıyı "Wrong protocol for WebSocket"
 * konsol hatasıyla reddeder; bağlantı yedek yolla yine kurulur ama her bağlantıda hata günlüğü düşer. Bu
 * sarmalayıcı nesne imzasını tarayıcı imzasına çevirir (tarayıcı başlık ekleyemez, `headers` zaten
 * kullanılamaz) ve ilk çağrı başarılı olur.
 */
export function installWebSocketShim(target: Target = globalThis as unknown as Target): boolean {
  const Native = target.WebSocket;
  if (!Native) return false;
  if ((Native as { volShim?: boolean }).volShim === true) return false;
  class ShimmedWebSocket extends (Native as new (
    url: string | URL,
    protocols?: unknown,
  ) => object) {
    static readonly volShim = true;
    constructor(url: string | URL, second?: unknown) {
      super(url, normalizeProtocols(second));
    }
  }
  target.WebSocket = ShimmedWebSocket;
  return true;
}

/** `{ protocols }` nesnesi → içindeki protokol listesi; dize ve dizi olduğu gibi kalır. */
export function normalizeProtocols(value: unknown): string | string[] | undefined {
  if (value === undefined || typeof value === 'string' || Array.isArray(value))
    return value as string | string[] | undefined;
  if (typeof value === 'object' && value !== null) {
    const inner = (value as { protocols?: unknown }).protocols;
    return inner === undefined ? undefined : normalizeProtocols(inner);
  }
  return undefined;
}
