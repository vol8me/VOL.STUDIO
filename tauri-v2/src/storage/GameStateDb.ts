import Database from '@tauri-apps/plugin-sql';
import { GameStateDbError } from './GameStateDbError';

/** Mevcut şema sürümü. Migration eklendiğinde artırılır. */
const CURRENT_SCHEMA_VERSION = 1;

export interface GameStateDbOptions {
  /** SQLite dosya adı. Varsayılan 'game-state.db'. */
  path?: string;
}

export interface SaveGame<T = unknown> {
  slot: string;
  data: T;
  createdAt: string;
  updatedAt: string;
}

/**
 * SQLite tabanlı oyun kayıt yönetimi.
 * Offline-first tasarlanmıştır; ileride cloud sync katmanı eklenebilir.
 */
export class GameStateDb {
  private db: Database | null = null;
  private readonly path: string;
  private initialized = false;
  /**
   * Devam eden init'in promise'i. Her public metot başında `await this.init()`
   * çağrıldığı için eşzamanlılık istisna değil normal durum; bu olmadan
   * `Promise.all([saveGame(a), saveGame(b)])` veritabanını iki kez yükler ve
   * migrate()'i iki kez calistirirdi.
   */
  private initPromise: Promise<void> | null = null;

  constructor(options: GameStateDbOptions = {}) {
    this.path = options.path ?? 'game-state.db';
  }

  /** Veritabanini yükler, tabloları ve schema version'u oluşturur. Idempotent. */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    // Basarisizlikta initPromise temizlenir; sonraki cagri yeniden denesin.
    this.initPromise = this.runInit().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  private async runInit(): Promise<void> {
    try {
      this.db = await Database.load(`sqlite:${this.path}`);

      // `id` PK + CHECK(id = 1): tabloda YALNIZCA tek satır olabilir.
      // Önceki şema `version`'i PK yapıyordu; ileride VALUES (2) eklenince
      // versiyon 1 ile çakışmayacağı için tabloda iki satır birden oluşur,
      // `SELECT ... LIMIT 1` de ORDER BY'siz olduğu için hangi satırın geleceği
      // belirsiz kalırdı.
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS schema_version (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          version INTEGER NOT NULL
        )
      `);

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS saves (
          slot TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      await this.migrate();
      this.initialized = true;
    } catch (error) {
      throw new GameStateDbError(`Oyun kayit veritabani yuklenemedi: "${this.path}"`, {
        cause: error,
      });
    }
  }

  private async migrate(): Promise<void> {
    const result = await this.db!.select<{ version: number }[]>(
      'SELECT version FROM schema_version WHERE id = 1',
    );
    const currentVersion = result[0]?.version ?? 0;

    if (currentVersion >= CURRENT_SCHEMA_VERSION) return;

    // Gelecek migration'lar buraya eklenir:
    // if (currentVersion < 2) { await this.db!.execute('ALTER TABLE saves ADD COLUMN ...'); }

    await this.setSchemaVersion(CURRENT_SCHEMA_VERSION);
  }

  /** Şema versiyonunu yazar. `id = 1` sabit olduğu için her zaman tek satır kalır. */
  private async setSchemaVersion(version: number): Promise<void> {
    await this.db!.execute(
      'INSERT INTO schema_version (id, version) VALUES (1, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET version = excluded.version',
      [version],
    );
  }

  /** Veritabani baglantisini kapatır. init() sonrası tekrar açılabilir. */
  async close(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.close();
    } catch (error) {
      throw new GameStateDbError(`Oyun kayit veritabani kapatilamadi: "${this.path}"`, {
        cause: error,
      });
    } finally {
      this.db = null;
      this.initialized = false;
      this.initPromise = null;
    }
  }

  /** Bir kayıt slot'una veri kaydeder. Varolan slotun created_at'i korunur. */
  async saveGame<T>(slot: string, data: T): Promise<void> {
    await this.init();
    try {
      const now = new Date().toISOString();
      const json = JSON.stringify(data);

      await this.db!.execute(
        `INSERT INTO saves (slot, data, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(slot) DO UPDATE SET
           data = excluded.data,
           updated_at = excluded.updated_at`,
        [slot, json, now, now],
      );
    } catch (error) {
      throw new GameStateDbError(`Kayit kaydedilemedi: "${slot}"`, { cause: error });
    }
  }

  async loadGame<T>(slot: string): Promise<T | undefined> {
    await this.init();
    try {
      const result = await this.db!.select<{ data: string }[]>(
        'SELECT data FROM saves WHERE slot = ?',
        [slot],
      );
      const first = result[0] as { data: string } | undefined;
      if (!first) return undefined;
      return JSON.parse(first.data) as T;
    } catch (error) {
      throw new GameStateDbError(`Kayit yuklenemedi: "${slot}"`, { cause: error });
    }
  }

  async deleteGame(slot: string): Promise<void> {
    await this.init();
    try {
      await this.db!.execute('DELETE FROM saves WHERE slot = ?', [slot]);
    } catch (error) {
      throw new GameStateDbError(`Kayit silinemedi: "${slot}"`, { cause: error });
    }
  }

  async listSaves(): Promise<string[]> {
    await this.init();
    try {
      const result = await this.db!.select<{ slot: string }[]>(
        'SELECT slot FROM saves ORDER BY updated_at DESC',
      );
      return result.map((row: { slot: string }) => row.slot);
    } catch (error) {
      throw new GameStateDbError('Kayit listesi alinamadi', { cause: error });
    }
  }

  async hasSave(slot: string): Promise<boolean> {
    await this.init();
    try {
      const result = await this.db!.select<{ count: number }[]>(
        'SELECT COUNT(*) as count FROM saves WHERE slot = ?',
        [slot],
      );
      return ((result[0] as { count: number } | undefined)?.count ?? 0) > 0;
    } catch (error) {
      throw new GameStateDbError(`Kayit kontrolu yapilamadi: "${slot}"`, { cause: error });
    }
  }

  async getSaveMeta<T = unknown>(slot: string): Promise<SaveGame<T> | undefined> {
    await this.init();
    try {
      const result = await this.db!.select<SaveGame<string>[]>(
        'SELECT slot, data, created_at as createdAt, updated_at as updatedAt FROM saves WHERE slot = ?',
        [slot],
      );
      if (result.length === 0) return undefined;
      const row = result[0];
      return {
        slot: row.slot,
        data: JSON.parse(row.data) as T,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    } catch (error) {
      throw new GameStateDbError(`Kayit metadata alinamadi: "${slot}"`, { cause: error });
    }
  }

  /**
   * Tüm kayıtları siler. Bu islem geri alınamaz; yanlışlıkla çağrılmaması
   * için `{ confirm: true }` zorunludur.
   */
  async clear(options?: { confirm?: boolean }): Promise<void> {
    if (options?.confirm !== true) {
      throw new GameStateDbError(
        'Tüm kayitlari silmek için `clear({ confirm: true })` çağrılmalı.',
      );
    }
    await this.init();
    try {
      await this.db!.execute('DELETE FROM saves');
    } catch (error) {
      throw new GameStateDbError('Tüm kayitlar silinemedi', { cause: error });
    }
  }
}
