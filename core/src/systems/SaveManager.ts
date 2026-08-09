export interface IStorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class SaveManager {
  constructor(private readonly adapter: IStorageAdapter) {}

  async load<T>(key: string, defaultValue: T): Promise<T> {
    const value = await this.adapter.get<T>(key);
    return value !== undefined ? value : defaultValue;
  }

  async save<T>(key: string, value: T): Promise<void> {
    await this.adapter.set<T>(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.adapter.remove(key);
  }
}

export class LocalStorageAdapter implements IStorageAdapter {
  get<T>(key: string): Promise<T | undefined> {
    const raw = localStorage.getItem(key);
    if (raw === null) return Promise.resolve(undefined);
    try {
      return Promise.resolve(JSON.parse(raw) as T);
    } catch {
      return Promise.resolve(undefined);
    }
  }

  set<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return Promise.resolve();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn(`[LocalStorageAdapter] Depolama kotası doldu: ${key}`);
        return Promise.resolve();
      }
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  remove(key: string): Promise<void> {
    localStorage.removeItem(key);
    return Promise.resolve();
  }
}
