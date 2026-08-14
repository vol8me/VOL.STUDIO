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

export class LocalStorageAdapter implements IStorageAdapter {
  get<T>(key: string): Promise<T | undefined> {
    const raw = localStorage.getItem(key);
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
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        return Promise.reject(
          new StorageError(`Depolama kotası doldu; '${key}' kaydedilemedi.`, { cause: error }),
        );
      }
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  remove(key: string): Promise<void> {
    localStorage.removeItem(key);
    return Promise.resolve();
  }
}
