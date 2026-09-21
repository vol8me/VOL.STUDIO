export interface IStorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class SaveManager {
  constructor(private readonly adapter: IStorageAdapter) {}

  async load<T>(key: string, defaultValue: T): Promise<T> {
    const value = await this.adapter.get<T>(key);
    // `null` depolanmış geçersiz kayıt olarak varsayılan değere düş.
    return value ?? defaultValue;
  }

  async save<T>(key: string, value: T): Promise<void> {
    await this.adapter.set<T>(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.adapter.remove(key);
  }
}

/** Depolama katmanında oluşan hataları ayırt etmek için. */
export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'StorageError';
    this.cause = options?.cause;
  }
}

/**
 * `localStorage` üstünde depolama.
 *
 * OKUMA ve SİLME hiçbir koşulda fırlatmaz. `localStorage`a erişimin kendisi
 * bir `SecurityError` fırlatabilir (özel mod, depolamayı engelleyen gizlilik
 * ayarları, bazı gömülü WebView'lar); okuma orada fırlatırsa ayarları paralel
 * yükleyen açılış yolu reddedilir ve oyun HİÇ AÇILMAZ. Depolamanın erişilemez
 * olması "kayıtlı değer yok" ile aynı şeydir.
 *
 * YAZMA reddeder: bir kaydın diske gitmediğini çağıran bilmelidir.
 */
export class LocalStorageAdapter implements IStorageAdapter {
  get<T>(key: string): Promise<T | undefined> {
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch (error) {
      console.warn(
        `[LocalStorageAdapter] Depolama okunamadı ('${key}'); varsayılana dönülüyor.`,
        error,
      );
      return Promise.resolve(undefined);
    }
    if (raw === null) return Promise.resolve(undefined);
    try {
      return Promise.resolve(JSON.parse(raw) as T);
    } catch (error) {
      // Bozuk kaydı sessizce kaybetmemek için logla; çağıran `SaveManager.load`
      // sayesinde varsayılan değere dönecek.
      console.warn(
        `[LocalStorageAdapter] '${key}' için bozuk kayıt okundu; varsayılan değere dönülüyor.`,
        error,
      );
      return Promise.resolve(undefined);
    }
  }

  set<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return Promise.resolve();
    } catch (error) {
      const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
      return Promise.reject(
        new StorageError(
          quota
            ? `Depolama kotası doldu; '${key}' kaydedilemedi.`
            : `Depolamaya yazılamadı; '${key}' kaydedilemedi.`,
          { cause: error },
        ),
      );
    }
  }

  remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      // Erişilemeyen bir depodan silmek zaten istenen sonucu verir.
      console.warn(`[LocalStorageAdapter] Depolamadan silinemedi ('${key}').`, error);
    }
    return Promise.resolve();
  }
}
