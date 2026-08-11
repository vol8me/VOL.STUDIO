import i18next from 'i18next';
import coreTr from '../i18n/tr.json';
import coreEn from '../i18n/en.json';
import type { SaveManager } from './SaveManager';

export { i18next };

export interface I18nOptions {
  /** Bulunamayan key'lerde düşülecek yedek dil. Varsayılan 'tr'. */
  fallbackLocale?: string;
  /** SaveManager ile dil tercihini persist etmek için. Verilmezse localStorage kullanılır. */
  saveManager?: SaveManager | null;
  /** SaveManager'da dil tercihinin kaydedileceği key. Varsayılan 'vol-locale'. */
  saveKey?: string;
  /** detectLocale()'in tanıyacağı ek dil kodları. Resource yüklemez — sadece dil tespiti için. */
  preloadLocales?: string[];
  /** Ek dil kaynakları — mevcut tr/en üzerine ekler. Key: dil kodu, value: namespace → çeviri sözlüğü. Örn: { de: { core: deCore } } */
  resources?: Record<string, Record<string, Record<string, unknown>>>;
}

/** i18next lifecycle yöneticisi. Çeviri çağrıları için `i18next.t()` kullanın. */
export class I18n {
  private initialized = false;
  private fallbackLocale = 'tr';
  private saveManager: SaveManager | null = null;
  private saveKey = 'vol-locale';
  private locales = new Set<string>(['tr', 'en']);
  /** Devam eden init'in promise'i — escanli cagrilarda ikinci init()'i engeller. */
  private initPromise: Promise<void> | null = null;
  /** init() öncesi addResources() ile eklenen bundle'lar — init sonrası uygulanır. */
  private pendingResources: Array<{
    locale: string;
    ns: string;
    resources: Record<string, unknown>;
  }> = [];
  /** addResources() ile runtime'da eklenen bundle'lar — reset()'te temizlenir. */
  private addedResources: Array<{ locale: string; ns: string }> = [];

  /**
   * i18next'i başlatır. Birden fazla çağrılsa ilk çağrı geçerlidir.
   *
   * `initialized` bayragi tum await'lerden SONRA atandigi icin iki paralel
   * init() ikisi de guard'i gecip i18next.init()'i iki kez cagirirdi; devam
   * eden promise saklanarak escanlilik tekillestirilir.
   */
  async init(options?: I18nOptions): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.runInit(options).finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async runInit(options?: I18nOptions): Promise<void> {
    this.fallbackLocale = options?.fallbackLocale ?? 'tr';
    this.saveManager = options?.saveManager ?? null;
    this.saveKey = options?.saveKey ?? 'vol-locale';

    const preloadLocales = options?.preloadLocales ?? ['tr', 'en'];
    for (const lng of preloadLocales) {
      this.locales.add(lng);
    }

    const mergedResources: Record<string, Record<string, Record<string, unknown>>> = {
      tr: { core: coreTr },
      en: { core: coreEn },
      ...options?.resources,
    };

    for (const lng of Object.keys(mergedResources)) {
      this.locales.add(lng);
    }

    let initialLocale = this.fallbackLocale;
    if (this.saveManager) {
      initialLocale = await this.saveManager.load<string>(this.saveKey, this.detectLocale());
    } else {
      initialLocale = this.detectLocale();
    }

    await i18next.init({
      lng: initialLocale,
      fallbackLng: this.fallbackLocale,
      defaultNS: 'core',
      ns: ['core'],
      resources: mergedResources,
      interpolation: {
        escapeValue: false,
      },
      returnEmptyString: false,
    });

    // init öncesi queue'lanmış resource'ları uygula
    for (const pending of this.pendingResources) {
      i18next.addResourceBundle(pending.locale, pending.ns, pending.resources, true, true);
      this.addedResources.push({ locale: pending.locale, ns: pending.ns });
    }
    this.pendingResources = [];

    this.initialized = true;
  }

  /**
   * Sarmalayici durumunu sifirlar ve runtime'da eklenen bundle'lari kaldirir.
   *
   * DIKKAT: i18next'in kendi ic durumu (baslatilmis olmasi, yuklu ana
   * kaynaklar) KORUNUR — i18next tekrar init edilebilir bir kutuphane degil.
   * Sadece test amaçlı; production'da kullanmayın.
   */
  reset(): void {
    this.initPromise = null;
    // Runtime'da eklenen resource bundle'ları i18next'ten temizle
    for (const { locale, ns } of this.addedResources) {
      i18next.removeResourceBundle(locale, ns);
    }
    this.addedResources = [];
    this.pendingResources = [];
    this.initialized = false;
    this.fallbackLocale = 'tr';
    this.saveManager = null;
    this.saveKey = 'vol-locale';
    this.locales = new Set<string>(['tr', 'en']);
  }

  /** Mevcut dil kodunu döndürür (ör. 'tr', 'en'). */
  getLocale(): string {
    return i18next.language ?? this.fallbackLocale;
  }

  /** Kayıtlı tüm dil kodlarını döndürür. */
  getLocales(): string[] {
    return [...this.locales];
  }

  /** i18next başlatıldı mı? */
  isInitialized(): boolean {
    return this.initialized;
  }

  /** Dili değiştirir. SaveManager varsa tercihi persist eder. 'languageChanged' olayı yayılır. */
  async changeLanguage(locale: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('[I18n] changeLanguage çağrıldı ama init() henüz yapılmadı');
    }
    await i18next.changeLanguage(locale);
    // Yalnizca gercekten kaynagi olan diller kayitli sayilir. Kosulsuz eklemek
    // detectLocale()'in cevirisi olmayan bir dili secmesine yol acardi.
    if (i18next.hasResourceBundle(locale, 'core')) {
      this.locales.add(locale);
    }
    if (this.saveManager) {
      await this.saveManager.save(this.saveKey, locale);
    }
  }

  /** Bir dile yeni bir namespace + çeviri sözlüğü ekler. Oyunlar kendi çevirilerini yüklemek için kullanır. init() öncesi çağrılırsa init sonrası uygulanır. */
  addResources<T extends Record<string, unknown>>(locale: string, ns: string, resources: T): void {
    if (!this.initialized) {
      this.pendingResources.push({ locale, ns, resources });
      this.locales.add(locale);
      return;
    }
    i18next.addResourceBundle(locale, ns, resources, true, true);
    this.addedResources.push({ locale, ns });
    this.locales.add(locale);
  }

  /** Bir key'in çevirisi var mı? */
  exists(key: string, options?: { locale?: string }): boolean {
    return i18next.exists(key, options);
  }

  /** Dinamik key'ler için debug assertion. Key bulunamazsa console.error ile uyarır. Key'i geri döndürür — `i18next.t(i18n.assertKey(dynamicKey))` şeklinde kullanılabilir. */
  assertKey(key: string): string {
    if (this.initialized && !i18next.exists(key)) {
      console.error(`[i18n] Dinamik key bulunamadı: "${key}"`);
    }
    return key;
  }

  /** Dinamik key'ler için tip güvenli çeviri. Strict key checking'i atlar, runtime'da key varlığını doğrular. Mapping tablosu + değişken key kullanan kodlar için. */
  tDynamic(key: string, options?: Record<string, unknown>): string {
    this.assertKey(key);
    return (i18next.t as (key: string, options?: Record<string, unknown>) => string)(key, options);
  }

  /** Metin yönünü döndürür — 'ltr' veya 'rtl' (Arapça, İbranice için). */
  dir(locale?: string): 'ltr' | 'rtl' {
    return i18next.dir(locale ?? i18next.language);
  }

  /** Dil değişiminde çağrılır. Aynı callback ile `off` çağırarak aboneliği kaldır. */
  on(event: 'languageChanged', callback: (locale: string) => void): void {
    i18next.on(event, callback);
  }

  /** Aboneliği kaldırır. */
  off(event: 'languageChanged', callback: (locale: string) => void): void {
    i18next.off(event, callback);
  }

  /** navigator.language'den dil tespiti yapar. navigator.languages[] listesini de kontrol eder. Kayıtlı değilse fallback döner. */
  detectLocale(): string {
    if (typeof navigator === 'undefined') return this.fallbackLocale;
    const candidates: string[] = [];
    if (navigator.languages && navigator.languages.length > 0) {
      candidates.push(...navigator.languages);
    }
    if (navigator.language) {
      candidates.push(navigator.language);
    }
    for (const candidate of candidates) {
      const base = candidate.split('-')[0];
      if (this.locales.has(base)) return base;
    }
    return this.fallbackLocale;
  }
}

export const i18n = new I18n();
