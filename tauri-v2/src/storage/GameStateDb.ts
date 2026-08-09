import Database from '@tauri-apps/plugin-sql';
import { GameStateDbError } from './GameStateDbError';

export interface GameStateDbOptions {
  /** SQLite dosya adi. Varsayilan 'game-state.db'. */
  path?: string;
}

export interface SaveGame<T = unknown> {
  slot: string;
  data: T;
  createdAt: string;
  updatedAt: string;
}

/**
 * SQLite tabanli oyun kayit yonetimi.
 * Offline-first tasarlanmistir; ileride cloud sync katmani eklenebilir.
 */
export class GameStateDb {
  private db: Database | null = null;
  private readonly path: string;
  private initialized = false;

  constructor(options: GameStateDbOptions = {}) {
    this.path = options.path ?? 'game-state.db';
  }

  /** Veritabanini yukler, tablolari ve schema version'u olusturur. Idempotent. */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      this.db = await Database.load(`sqlite:${this.path}`);

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY
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
      throw new GameStateDbError(`Oyun kayit veritabani yuklenemedi: "${this.path}"`, { cause: error });
    }
  }

  private async migrate(): Promise<void> {
    const result = await this.db!.select<{ version: number }[]>(
      'SELECT version FROM schema_version LIMIT 1'
    );
    const currentVersion = result[0]?.version ?? 0;

    if (currentVersion === 0) {
      await this.db!.execute('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [1]);
    }

    // Gelecek migration'lar buraya eklenir:
    // case 1: /* v1→v2 kolon ekleme/veri dönüşümü */ break;
    // await this.db!.execute('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [2]);
  }

  /** Veritabani baglantisini kapatir. init() sonrasi tekrar acilabilir. */
  async close(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.close();
    } catch (error) {
      throw new GameStateDbError(`Oyun kayit veritabani kapatilamadi: "${this.path}"`, { cause: error });
    } finally {
      this.db = null;
      this.initialized = false;
    }
  }

  /** Bir kayit slot'una veri kaydeder. Varolan slotun created_at'i korunur. */
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
        [slot, json, now, now]
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
        [slot]
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
        'SELECT slot FROM saves ORDER BY updated_at DESC'
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
        [slot]
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
        [slot]
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

  /** Tüm kayitlari siler. Dikkatli kullan. */
  async clear(): Promise<void> {
    await this.init();
    try {
      await this.db!.execute('DELETE FROM saves');
    } catch (error) {
      throw new GameStateDbError('Tüm kayitlar silinemedi', { cause: error });
    }
  }
}
