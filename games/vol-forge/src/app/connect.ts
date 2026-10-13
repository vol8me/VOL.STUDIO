/** Bağlantı ayarları: adres doğrulama, kalıcı oyuncu anahtarı. Ağ ve DOM'a dokunmaz. */

export const DEFAULT_SERVER = 'http://127.0.0.1:2567';
export const DEFAULT_WORLD = 'world-1';

const KEY_STORAGE = 'volforge.playerKey';
const SERVER_STORAGE = 'volforge.server';
const WORLD_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const KEY_RANDOM_CHARS = 12;

/** `localStorage` biçimli, kısmi arayüz: gizli pencerede ya da engelliyken hata fırlatabilir. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ConnectSettings {
  readonly server: string;
  readonly worldId: string;
  readonly key: string;
  /** Adres `?server=` ile geldiyse bağlantı formu beklenmeden katılınır (test ve davet bağlantıları). */
  readonly autoJoin: boolean;
}

/**
 * Sunucu adresini SDK'nın beklediği `http(s)://sunucu:port` biçimine getirir. Başka şema, kullanıcı bilgisi,
 * yol, sorgu ve bölüm reddedilir; `ws(s)` karşılığına çevrilir.
 */
export function parseServer(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const scheme =
    url.protocol === 'ws:' ? 'http:' : url.protocol === 'wss:' ? 'https:' : url.protocol;
  if (scheme !== 'http:' && scheme !== 'https:') return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  if (!url.hostname) return null;
  return `${scheme}//${url.host}`;
}

export function parseWorld(value: string): string | null {
  const trimmed = value.trim();
  return WORLD_PATTERN.test(trimmed) ? trimmed : null;
}

/** `player-` + 12 küçük harf/rakam: sunucunun oyuncu anahtarı kuralına uyar (8-64 karakter). */
export function createPlayerKey(random: () => number): string {
  let key = 'player-';
  for (let index = 0; index < KEY_RANDOM_CHARS; index++)
    key += KEY_ALPHABET[Math.floor(random() * KEY_ALPHABET.length)];
  return key;
}

function read(storage: KeyValueStore | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: KeyValueStore | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Depolama yoksa oyuncu her açılışta yeni anahtar alır; ilerleme sunucu tarafında anahtara bağlıdır.
  }
}

/**
 * Ayarları sorgu dizgisi, depolama ve varsayılanlardan kurar. Oyuncu anahtarı yoksa üretilir ve
 * kaydedilir: aynı cihazdaki yeniden açılış aynı oyuncudur (komut sırası ve defter korunur).
 */
export function loadSettings(
  search: string,
  storage: KeyValueStore | null,
  random: () => number,
): ConnectSettings {
  const params = new URLSearchParams(search);
  const queried = params.get('server');
  const fromQuery = queried === null ? null : parseServer(queried);
  const stored = read(storage, SERVER_STORAGE);
  const server = fromQuery ?? (stored === null ? null : parseServer(stored)) ?? DEFAULT_SERVER;
  const worldId = parseWorld(params.get('world') ?? '') ?? DEFAULT_WORLD;
  let key = read(storage, KEY_STORAGE);
  if (key === null || !/^[A-Za-z0-9_-]{8,64}$/.test(key)) {
    key = createPlayerKey(random);
    write(storage, KEY_STORAGE, key);
  }
  return { server, worldId, key, autoJoin: fromQuery !== null };
}

export function rememberServer(storage: KeyValueStore | null, server: string): void {
  write(storage, SERVER_STORAGE, server);
}
