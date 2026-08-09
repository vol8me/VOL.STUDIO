import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { i18n, i18next, I18n } from '../../src/systems/I18n';
import type { SaveManager } from '../../src/systems/SaveManager';

function makeSaveManager(stored: string | undefined = undefined): SaveManager {
  const store = new Map<string, unknown>();
  if (stored !== undefined) store.set('vol-locale', stored);
  return {
    load<T>(key: string, defaultValue: T): Promise<T> {
      return Promise.resolve((store.get(key) as T) ?? defaultValue);
    },
    save<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
      return Promise.resolve();
    },
    delete(key: string): Promise<void> {
      store.delete(key);
      return Promise.resolve();
    },
  } as SaveManager;
}

const originalLanguage = Object.getOwnPropertyDescriptor(navigator, 'language');

beforeEach(() => {
  vi.stubGlobal('navigator', { language: 'tr-TR' });
  i18n.reset();
});

afterEach(() => {
  i18next.changeLanguage('tr').catch(() => {});
  if (originalLanguage) {
    Object.defineProperty(navigator, 'language', originalLanguage);
  } else {
    vi.unstubAllGlobals();
  }
});

describe('I18n — init', () => {
  it('init sonrası isInitialized true döner', async () => {
    expect(i18n.isInitialized()).toBe(false);
    await i18n.init();
    expect(i18n.isInitialized()).toBe(true);
  });

  it('ikinci init cagrisi no-op', async () => {
    await i18n.init();
    const localeBefore = i18n.getLocale();
    await i18n.init({ fallbackLocale: 'en' });
    expect(i18n.getLocale()).toBe(localeBefore);
  });

  it('fallbackLocale varsayilan tr', async () => {
    await i18n.init();
    expect(i18next.t('core:carousel.prev')).toBe('Önceki');
  });
});

describe('I18n — detectLocale', () => {
  it('navigator.language dilini cozer (tr-TR -> tr)', () => {
    expect(i18n.detectLocale()).toBe('tr');
  });

  it('en-US -> en', () => {
    vi.stubGlobal('navigator', { language: 'en-US' });
    expect(i18n.detectLocale()).toBe('en');
  });

  it('kayitli olmayan dil -> fallback', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    expect(i18n.detectLocale()).toBe('tr');
  });

  it('navigator yoksa fallback doner', () => {
    vi.stubGlobal('navigator', undefined);
    expect(i18n.detectLocale()).toBe('tr');
  });

  it('navigator.languages[] listesinden ilk esleseni secer', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'en-US', 'tr-TR'] });
    expect(i18n.detectLocale()).toBe('en');
  });
});

describe('I18n — changeLanguage', () => {
  it('dil degisince getLocale guncellenir', async () => {
    await i18n.init();
    await i18n.changeLanguage('en');
    expect(i18n.getLocale()).toBe('en');
  });

  it('languageChanged olayi yayilir', async () => {
    await i18n.init();
    const cb = vi.fn();
    i18n.on('languageChanged', cb);
    await i18n.changeLanguage('en');
    expect(cb).toHaveBeenCalledWith('en');
    i18n.off('languageChanged', cb);
  });

  it('off ile abonelik kaldirilir', async () => {
    await i18n.init();
    const cb = vi.fn();
    i18n.on('languageChanged', cb);
    i18n.off('languageChanged', cb);
    await i18n.changeLanguage('en');
    expect(cb).not.toHaveBeenCalled();
  });

  it('init oncesi changeLanguage hatasi', async () => {
    await expect(i18n.changeLanguage('en')).rejects.toThrow();
  });

  it('SaveManager ile tercih persist edilir', async () => {
    const saveManager = makeSaveManager();
    await i18n.init({ saveManager });
    await i18n.changeLanguage('en');
    const saved = await saveManager.load<string>('vol-locale', 'tr');
    expect(saved).toBe('en');
  });
});

describe('I18n — SaveManager entegrasyonu', () => {
  it('kayitli dil init sirasinda yuklenir', async () => {
    const saveManager = makeSaveManager('en');
    await i18n.init({ saveManager });
    expect(i18n.getLocale()).toBe('en');
  });

  it('kayit yoksa detectLocale kullanilir', async () => {
    const saveManager = makeSaveManager(undefined);
    await i18n.init({ saveManager });
    expect(i18n.getLocale()).toBe('tr');
  });

  it('ozel saveKey desteklenir', async () => {
    const store = new Map<string, unknown>([['oyun-dili', 'en']]);
    const saveManager = {
      load: vi.fn(<T>(key: string, def: T): Promise<T> => Promise.resolve((store.get(key) as T) ?? def)),
      save: vi.fn((key: string, value: unknown): Promise<void> => {
        store.set(key, value);
        return Promise.resolve();
      }),
      delete: vi.fn((key: string): Promise<void> => {
        store.delete(key);
        return Promise.resolve();
      }),
    } as unknown as SaveManager;
    await i18n.init({ saveManager, saveKey: 'oyun-dili' });
    expect(i18n.getLocale()).toBe('en');
    expect(saveManager.load).toHaveBeenCalledWith('oyun-dili', 'tr');
  });
});

describe('I18n — addResources (namespace)', () => {
  it('yeni namespace ve dil eklenir', async () => {
    await i18n.init();
    i18n.addResources('tr', 'volhell', {
      menu: { start: 'BAŞLA' },
    });
    expect((i18next.t as (key: string) => string)('volhell:menu.start')).toBe('BAŞLA');
  });

  it('getLocales yeni dili icerir', async () => {
    await i18n.init();
    i18n.addResources('de', 'core', { carousel: { prev: 'Zurück' } });
    expect(i18n.getLocales()).toContain('de');
  });

  it('mevcut namespace overwrite edilir', async () => {
    await i18n.init();
    i18n.addResources('tr', 'core', { carousel: { prev: 'Geri' } });
    expect(i18next.t('core:carousel.prev')).toBe('Geri');
  });

  it('init oncesi cagrilirsa queue lanir ve init sonrasi uygulanir', async () => {
    i18n.addResources('tr', 'volhell', {
      menu: { start: 'BAŞLA' },
    });
    expect(i18n.isInitialized()).toBe(false);
    await i18n.init();
    expect((i18next.t as (key: string) => string)('volhell:menu.start')).toBe('BAŞLA');
  });
});

describe('I18n — exists', () => {
  it('var olan key true doner', async () => {
    await i18n.init();
    expect(i18n.exists('core:carousel.prev')).toBe(true);
  });

  it('olmayan key false doner', async () => {
    await i18n.init();
    expect(i18n.exists('core:nonexistent.key')).toBe(false);
  });
});

describe('I18n — assertKey', () => {
  it('gecerli key icin hata loglamaz', async () => {
    await i18n.init();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = i18n.assertKey('core:carousel.prev');
    expect(spy).not.toHaveBeenCalled();
    expect(result).toBe('core:carousel.prev');
    spy.mockRestore();
  });

  it('gecersiz key icin console.error cagirir', async () => {
    await i18n.init();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    i18n.assertKey('core:nonexistent.key');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('core:nonexistent.key'));
    spy.mockRestore();
  });

  it('init oncesi hata loglamaz', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    i18n.assertKey('core:nonexistent.key');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('I18n — tDynamic', () => {
  it('gecerli key icin ceviri doner', async () => {
    await i18n.init();
    const result = i18n.tDynamic('core:carousel.next');
    expect(result).toBe('Sonraki');
  });

  it('gecersiz key icin console.error ve string doner', async () => {
    await i18n.init();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = i18n.tDynamic('core:nonexistent.key');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('core:nonexistent.key'));
    expect(typeof result).toBe('string');
    spy.mockRestore();
  });

  it('interpolation options ile calisir', async () => {
    await i18n.init();
    const result = i18n.tDynamic('core:carousel.page', { n: 7 });
    expect(result).toBe('Sayfa 7');
  });
});

describe('I18n — dir (metin yonu)', () => {
  it('TR icin ltr', async () => {
    await i18n.init();
    expect(i18n.dir('tr')).toBe('ltr');
  });

  it('EN icin ltr', async () => {
    await i18n.init();
    expect(i18n.dir('en')).toBe('ltr');
  });

  it('AR icin rtl', async () => {
    await i18n.init();
    expect(i18n.dir('ar')).toBe('rtl');
  });

  it('mevcut dil icin yon doner', async () => {
    await i18n.init();
    await i18n.changeLanguage('en');
    expect(i18n.dir()).toBe('ltr');
  });
});

describe('I18n — getLocales', () => {
  it('baslangicta tr ve en icerir', async () => {
    await i18n.init();
    const locales = i18n.getLocales();
    expect(locales).toContain('tr');
    expect(locales).toContain('en');
  });

  it('preloadLocales ile ek diller', async () => {
    await i18n.init({ preloadLocales: ['tr', 'en', 'de'] });
    expect(i18n.getLocales()).toContain('de');
  });
});

describe('I18n — interpolation (i18next.t)', () => {
  it('parametre degistirme calisir', async () => {
    await i18n.init();
    expect(i18next.t('core:carousel.page', { n: 3 })).toBe('Sayfa 3');
  });

  it('Ingilizce parametre degistirme', async () => {
    await i18n.init();
    await i18n.changeLanguage('en');
    expect(i18next.t('core:carousel.page', { n: 5 })).toBe('Page 5');
  });

  it('commandPalette.noMatch interpolation', async () => {
    await i18n.init();
    expect(i18next.t('core:commandPalette.noMatch', { query: 'test' })).toBe(
      '"test" için sonuç yok',
    );
  });

  it('kanban.grabbed coklu parametre', async () => {
    await i18n.init();
    expect(i18next.t('core:kanban.grabbed', { card: 'Görev A' })).toContain('Görev A');
  });
});

describe('I18n — fallback', () => {
  it('olmayan key fallback dile duser', async () => {
    await i18n.init();
    await i18n.changeLanguage('en');
    i18n.addResources('en', 'test', { only_en: 'English only' });
    i18n.addResources('tr', 'test', { only_tr: 'Türkçe only' });
    expect((i18next.t as (key: string) => string)('test:only_tr')).toBe('Türkçe only');
  });
});

describe('I18n — resources option (ek dil)', () => {
  it('init sirasinda ek dil kaynaklari yuklenir', async () => {
    await i18n.init({
      resources: {
        de: { core: { carousel: { prev: 'Zurück', next: 'Weiter' } } },
      },
    });
    await i18n.changeLanguage('de');
    expect((i18next.t as (key: string) => string)('core:carousel.prev')).toBe('Zurück');
  });

  it('resources ile eklenen dil getLocales icinde gorunur', async () => {
    await i18n.init({
      resources: {
        de: { core: { carousel: { prev: 'Zurück' } } },
      },
    });
    expect(i18n.getLocales()).toContain('de');
  });

  it('resources ile eklenen dil detectLocale icinde taninir', async () => {
    vi.stubGlobal('navigator', { language: 'de-DE' });
    await i18n.init({
      resources: {
        de: { core: { carousel: { prev: 'Zurück' } } },
      },
    });
    expect(i18n.getLocale()).toBe('de');
  });
});

describe('I18n — reset', () => {
  it('reset eklenen resource bundle lari i18next ten temizler', async () => {
    await i18n.init();
    i18n.addResources('tr', 'volhell', { menu: { start: 'BAŞLA' } });
    expect((i18next.t as (key: string) => string)('volhell:menu.start')).toBe('BAŞLA');
    i18n.reset();
    await i18n.init();
    expect((i18next.t as (key: string) => string)('volhell:menu.start')).not.toBe('BAŞLA');
  });

  it('reset pendingResources i temizler', () => {
    i18n.addResources('tr', 'volhell', { menu: { start: 'BAŞLA' } });
    i18n.reset();
  });

  it('reset sonrasi initialized false doner', async () => {
    await i18n.init();
    expect(i18n.isInitialized()).toBe(true);
    i18n.reset();
    expect(i18n.isInitialized()).toBe(false);
  });

  it('reset sonrasi tekrar init edilebilir', async () => {
    await i18n.init();
    await i18n.changeLanguage('en');
    i18n.reset();
    await i18n.init();
    expect(i18n.isInitialized()).toBe(true);
  });

  it('reset yeni I18n instance ile ayni davranir', () => {
    const fresh = new I18n();
    i18n.reset();
    expect(i18n.isInitialized()).toBe(fresh.isInitialized());
    expect(i18n.getLocales()).toEqual(fresh.getLocales());
  });
});
