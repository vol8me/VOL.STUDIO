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
  /** Hedefte yazılıp doğrulanan anahtar adları. */
  readonly moved: readonly string[];
  /** Kapsam eşlemesi olmayıp varsayılan kapsama giden anahtarlar. */
  readonly defaulted: readonly string[];
  /** Eski dosyada kalıp taşınmayan anahtarlar (adapter sayamıyorsa). */
  readonly unknownLeftBehind: boolean;
}

/**
 * Tek dosyalı eski kaydı kapsamlı store'lara kayıpsız taşır. Sıra: her
 * anahtar önce hedefe yazılır, geri okunup doğrulanır; `retainSource` yoksa
 * eski kaynak anahtar kaldırılır. Kaynağı koruma kipi mevcut hedef değeri
 * yeniden yazmaz; yarım kalan taşıma tekrar çalıştırılabilir kalır.
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
  /** Kaynağı saklar; mevcut hedef anahtarları yeniden yazmaz. */
  readonly retainSource?: boolean;
  /** Kaynak hedeflerle aynı depoyu paylaşırsa kapsamlı anahtarları atlar (varsayılan). */
  readonly skipScopedKeys?: boolean;
  /** Paylaşılan kaynakta yalnız bu öneke ait anahtarlar taşınır. */
  readonly keyPrefix?: string;
}): Promise<MigrationReport> {
  const { legacy, scoped, mappings, keyPrefix, skipScopedKeys, retainSource } = options;
  const defaultScope = options.defaultScope ?? 'device';
  const table = new Map(mappings.map((m) => [m.key, m.scope]));
  const unknownLeftBehind = typeof legacy.keys !== 'function';
  const keys = unknownLeftBehind ? mappings.map((m) => m.key) : await legacy.keys!();

  const moved: string[] = [];
  const defaulted: string[] = [];
  for (const key of keys) {
    if (keyPrefix && !key.startsWith(keyPrefix)) continue;
    // Tarayıcı yolunda eski ve yeni kayıtlar aynı localStorage'ı paylaşır;
    // kapsamlı anahtarlar zaten hedef düzendir, `device.device.x` üretilemez.
    const scopedKey = isScopedKey(key);
    if (scopedKey && skipScopedKeys !== false) continue;
    const value = await legacy.get<unknown>(key);
    if (value === undefined) continue; // hiç yazılmamış ya da zaten taşınmış
    const scope = table.get(key);
    if (!scopedKey && scope === undefined) defaulted.push(key);
    const target: ScopedKey = scopedKey ? key : `${scope ?? defaultScope}.${key}`;
    if (retainSource && (await scoped.load(target, undefined)) !== undefined) continue;
    await scoped.save(target, value);
    const back = await scoped.load(target, undefined);
    if (JSON.stringify(back) !== JSON.stringify(value)) {
      throw new Error(`Taşıma doğrulanamadı: ${key}`);
    }
    if (!retainSource) await legacy.remove(key);
    moved.push(key);
  }
  return { moved, defaulted, unknownLeftBehind };
}
