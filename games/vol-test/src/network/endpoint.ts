import { NETWORK } from '@/config/network';

const SCHEMES: Readonly<Record<string, string>> = {
  'http:': 'http:',
  'https:': 'https:',
  'ws:': 'http:',
  'wss:': 'https:',
};

/**
 * Sunucu adresini eşleştirme için kullanılan `http(s)` biçimine getirir. Şemasız `host:port`
 * yazımı kabul edilir; kimlik bilgisi, yol, sorgu ya da tanınmayan şema taşıyan değer geçersizdir.
 */
export function normalizeEndpoint(value: string): string | null {
  const text = value.trim();
  if (text === '') return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//iu.test(text) ? text : `http://${text}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  const protocol = SCHEMES[url.protocol];
  if (!protocol || url.hostname === '') return null;
  if (url.username !== '' || url.password !== '') return null;
  if ((url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '')
    return null;
  return `${protocol}//${url.host}`;
}

/**
 * Bu oturumun sunucusu: `?server=` (web), yoksa derleme zamanı adresi, yoksa geliştirme adresi.
 * Geçersiz değer sessizce yok sayılır ve bir sonrakine düşülür. Native kabukta CSP yalnız
 * tanımlı adreslere izin verir; başka adres bağlantıyı reddettirir.
 */
export function resolveEndpoint(search: string, configured?: string): string {
  const requested = new URLSearchParams(search).get('server');
  return (
    (requested === null ? null : normalizeEndpoint(requested)) ??
    (configured === undefined ? null : normalizeEndpoint(configured)) ??
    NETWORK.defaultEndpoint
  );
}
