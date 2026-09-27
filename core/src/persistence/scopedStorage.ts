import type { IStorageAdapter } from './SaveManager';

/**
 * Kalıcılık kapsamı: `synced` kayıtlar Steam Cloud'a gider (ilerleme),
 * `device` kayıtlar cihazda kalır (grafik, pencere, ses). Kapsam anahtarın
 * önekidir — `synced.progress` Cloud'a giderken `device.video` gitmez.
 * Kapsamsız anahtar derleme zamanında reddedilir: `ScopedKey` olmayan bir
 * string'i `save`/`load` metoduna vermek tip hatasıdır.
 */
export type StorageScope = 'synced' | 'device';
export type ScopedKey = `${StorageScope}.${string}`;

export function isScopedKey(key: string): key is ScopedKey {
  return key.startsWith('synced.') || key.startsWith('device.');
}

export function scopeOfKey(key: ScopedKey): StorageScope {
  return key.startsWith('synced.') ? 'synced' : 'device';
}

/** Her kapsam kendi adapter'ına (kendi dosyasına) gider. */
export interface ScopedStores {
  readonly synced: IStorageAdapter;
  readonly device: IStorageAdapter;
}

/**
 * İki dosyalı SaveManager: `synced.*` ve `device.*` anahtarları ayrı
 * adapter'lara yönlenir. Tek dosyalı sözleşmeden farkı: anahtar her zaman
 * kapsamlıdır; kapsamsız anahtar yazılamaz (derleyici reddeder).
 */
export class ScopedSaveManager {
  constructor(private readonly stores: ScopedStores) {}

  private adapterFor(key: ScopedKey): IStorageAdapter {
    return this.stores[scopeOfKey(key)];
  }

  async load<T>(key: ScopedKey, defaultValue: T): Promise<T> {
    const value = await this.adapterFor(key).get<T>(key);
    return value ?? defaultValue;
  }

  async save<T>(key: ScopedKey, value: T): Promise<void> {
    await this.adapterFor(key).set(key, value);
  }

  async delete(key: ScopedKey): Promise<void> {
    await this.adapterFor(key).remove(key);
  }
}

/** Anahtarlarını sayabilen adapter (kayıpsız taşıma için). */
export interface KeyEnumerable {
  keys(): Promise<readonly string[]>;
}

/** Eski tek-dosya kaydındaki bir anahtarın hedef kapsamı. */
export interface LegacyKeyMapping {
  readonly key: string;
  readonly scope: StorageScope;
}

export interface MigrationReport {
  /** Taşınan anahtar adları (kayıpsız: okunan değer doğrulandıktan sonra silinir). */
  readonly moved: readonly string[];
  /** Kapsam eşlemesi olmayıp varsayılan kapsama giden anahtarlar. */
  readonly defaulted: readonly string[];
  /** Eski dosyada kalıp taşınmayan anahtarlar (adapter sayamıyorsa). */
  readonly unknownLeftBehind: boolean;
}

/**
 * Tek dosyalı eski kaydı kapsamlı store'lara kayıpsız taşır. Sıra: her
 * anahtar önce hedefe yazılır, geri okunup doğrulanır, ancak sonra eski
 * dosyadan silinir — yarım kalan taşıma tekrar çalıştırılabilir kalır
 * (aynı değer iki kez yazılsa da idempotent'tir).
 *
 * Eski dosyanın kendisi native tarafta `.bak` jenerasyonuyla korunur
 * (`store.rs`); ek kopya alınmaz.
 */
export async function migrateLegacyStore(options: {
  readonly legacy: IStorageAdapter & Partial<KeyEnumerable>;
  readonly scoped: ScopedSaveManager;
  /** Bilinen anahtar → kapsam eşlemesi. */
  readonly mappings: readonly LegacyKeyMapping[];
  /** Eşlemede olmayan ama sayımla bulunan anahtarların gideceği kapsam. */
  readonly defaultScope?: StorageScope;
}): Promise<MigrationReport> {
  const defaultScope = options.defaultScope ?? 'device';
  const table = new Map(options.mappings.map((m) => [m.key, m.scope]));

  let keys: readonly string[];
  let unknownLeftBehind = false;
  if (typeof options.legacy.keys === 'function') {
    keys = await options.legacy.keys();
  } else {
    keys = options.mappings.map((m) => m.key);
    unknownLeftBehind = true;
  }

  const moved: string[] = [];
  const defaulted: string[] = [];
  for (const key of keys) {
    const value = await options.legacy.get<unknown>(key);
    if (value === undefined) continue; // hiç yazılmamış ya da zaten taşınmış
    const scope = table.get(key) ?? defaultScope;
    if (!table.has(key)) defaulted.push(key);
    const target: ScopedKey = `${scope}.${key}`;
    await options.scoped.save(target, value);
    const back = await options.scoped.load(target, undefined);
    if (JSON.stringify(back) !== JSON.stringify(value)) {
      throw new Error(`Taşıma doğrulanamadı: ${key}`);
    }
    await options.legacy.remove(key);
    moved.push(key);
  }
  return { moved, defaulted, unknownLeftBehind };
}
