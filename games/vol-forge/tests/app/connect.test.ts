import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERVER,
  DEFAULT_WORLD,
  createPlayerKey,
  loadSettings,
  parseServer,
  parseWorld,
  rememberServer,
  type KeyValueStore,
} from '../../src/app/connect';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const counter = (): (() => number) => {
  let n = 0;
  return () => (n++ % 36) / 36;
};

describe('parseServer', () => {
  it('http(s) adresini kökte tutar, ws(s) adresini http(s)e çevirir', () => {
    expect(parseServer('http://127.0.0.1:2567')).toBe('http://127.0.0.1:2567');
    expect(parseServer('  https://oyun.example.org/ ')).toBe('https://oyun.example.org');
    expect(parseServer('ws://localhost:2567')).toBe('http://localhost:2567');
    expect(parseServer('wss://oyun.example.org')).toBe('https://oyun.example.org');
  });

  it('yol, sorgu, bölüm ve kullanıcı bilgisini reddeder', () => {
    expect(parseServer('http://a.example/lobby')).toBeNull();
    expect(parseServer('http://a.example/?x=1')).toBeNull();
    expect(parseServer('http://a.example/#x')).toBeNull();
    expect(parseServer('http://kullanici:parola@a.example')).toBeNull();
  });

  it('başka şema ve çöp girdiyi reddeder', () => {
    expect(parseServer('file:///etc/passwd')).toBeNull();
    expect(parseServer('javascript:alert(1)')).toBeNull();
    expect(parseServer('sunucu')).toBeNull();
    expect(parseServer('')).toBeNull();
  });
});

describe('parseWorld', () => {
  it('küçük harf, rakam, tire ve alt çizgiyi kabul eder', () => {
    expect(parseWorld(' world-1 ')).toBe('world-1');
    expect(parseWorld('a_b-9')).toBe('a_b-9');
  });

  it('büyük harf, boşluk, boş ve çok uzun kimliği reddeder', () => {
    expect(parseWorld('World')).toBeNull();
    expect(parseWorld('a b')).toBeNull();
    expect(parseWorld('')).toBeNull();
    expect(parseWorld('-ab')).toBeNull();
    expect(parseWorld('a'.repeat(33))).toBeNull();
  });
});

describe('createPlayerKey', () => {
  it('sunucunun oyuncu anahtarı kuralına uyar', () => {
    const key = createPlayerKey(counter());
    expect(key).toMatch(/^player-[a-z0-9]{12}$/);
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(64);
  });
});

describe('loadSettings', () => {
  it('varsayılanlarla başlar ve anahtarı üretip saklar', () => {
    const storage = memoryStore();
    const first = loadSettings('', storage, counter());
    expect(first).toMatchObject({
      server: DEFAULT_SERVER,
      worldId: DEFAULT_WORLD,
      autoJoin: false,
    });
    expect(storage.data['volforge.playerKey']).toBe(first.key);
    const second = loadSettings('', storage, () => 0.99);
    expect(second.key).toBe(first.key);
  });

  it('sorgu dizgisi sunucu ve dünyayı belirler ve otomatik katılımı açar', () => {
    const settings = loadSettings(
      '?server=http://10.0.0.5:2567&world=beta-2',
      memoryStore(),
      counter(),
    );
    expect(settings).toMatchObject({
      server: 'http://10.0.0.5:2567',
      worldId: 'beta-2',
      autoJoin: true,
    });
  });

  it('geçersiz sorgu adresi sessizce varsayılana düşer, otomatik katılmaz', () => {
    const settings = loadSettings('?server=ftp://x&world=Bad World', memoryStore(), counter());
    expect(settings).toMatchObject({
      server: DEFAULT_SERVER,
      worldId: DEFAULT_WORLD,
      autoJoin: false,
    });
  });

  it('saklanan sunucu sorgu yokken kullanılır; bozuk saklı anahtar yenilenir', () => {
    const storage = memoryStore({
      'volforge.server': 'https://kayitli.example.org',
      'volforge.playerKey': 'kısa',
    });
    const settings = loadSettings('', storage, counter());
    expect(settings.server).toBe('https://kayitli.example.org');
    expect(settings.key).toMatch(/^player-/);
    expect(storage.data['volforge.playerKey']).toBe(settings.key);
  });

  it('depolama hata fırlatsa da ya da hiç yoksa çalışır', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('engelli');
      },
      setItem: () => {
        throw new Error('engelli');
      },
    };
    expect(loadSettings('', broken, counter()).key).toMatch(/^player-/);
    expect(loadSettings('', null, counter()).key).toMatch(/^player-/);
    expect(() => rememberServer(broken, DEFAULT_SERVER)).not.toThrow();
    expect(() => rememberServer(null, DEFAULT_SERVER)).not.toThrow();
  });

  it('rememberServer adresi saklar', () => {
    const storage = memoryStore();
    rememberServer(storage, 'http://a.example:1');
    expect(storage.data['volforge.server']).toBe('http://a.example:1');
  });
});
