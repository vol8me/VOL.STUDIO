import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from '@tauri-apps/plugin-sql';
import { GameStateDb } from '../../src/storage/GameStateDb';
import { GameStateDbError } from '../../src/storage/GameStateDbError';

const mockExecute = vi.fn();
const mockSelect = vi.fn();
const mockClose = vi.fn();

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn(),
  },
}));

describe('GameStateDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(undefined);
    mockSelect.mockResolvedValue([]);
    mockClose.mockResolvedValue(true);
    vi.mocked(Database.load).mockResolvedValue({
      execute: mockExecute,
      select: mockSelect,
      close: mockClose,
    } as unknown as Database);
  });

  it('init tablolari ve schema version olusturur', async () => {
    const db = new GameStateDb();
    await db.init();

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_version'),
    );
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS saves'),
    );
    expect(mockExecute).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO schema_version (version) VALUES (?)',
      [1],
    );
  });

  it('init idempotent calisir', async () => {
    const db = new GameStateDb();
    await db.init();
    await db.init();

    expect(Database.load).toHaveBeenCalledTimes(1);
  });

  it('saveGame veri kaydeder', async () => {
    const db = new GameStateDb();
    const data = { level: 5, health: 100, inventory: ['sword'] };

    await db.saveGame('slot-1', data);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO saves'),
      expect.arrayContaining(['slot-1', JSON.stringify(data)]),
    );
  });

  it('loadGame kayitli veriyi dondurur', async () => {
    const db = new GameStateDb();
    await db.init();

    const data = { level: 5, health: 100 };
    mockSelect.mockResolvedValueOnce([{ data: JSON.stringify(data) }]);

    const result = await db.loadGame<{ level: number; health: number }>('slot-1');

    expect(result).toEqual(data);
    expect(mockSelect).toHaveBeenCalledWith('SELECT data FROM saves WHERE slot = ?', ['slot-1']);
  });

  it('loadGame bulunamayan slot icin undefined dondurur', async () => {
    const db = new GameStateDb();
    await db.init();
    mockSelect.mockResolvedValueOnce([]);

    const result = await db.loadGame('missing-slot');

    expect(result).toBeUndefined();
  });

  it('deleteGame slot siler', async () => {
    const db = new GameStateDb();
    await db.deleteGame('slot-1');

    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM saves WHERE slot = ?', ['slot-1']);
  });

  it('listSaves slot listesini dondurur', async () => {
    const db = new GameStateDb();
    await db.init();
    mockSelect.mockResolvedValueOnce([{ slot: 'slot-2' }, { slot: 'slot-1' }]);

    const saves = await db.listSaves();

    expect(saves).toEqual(['slot-2', 'slot-1']);
  });

  it('hasSave varligi kontrol eder', async () => {
    const db = new GameStateDb();
    await db.init();
    mockSelect.mockResolvedValueOnce([{ count: 1 }]);

    const exists = await db.hasSave('slot-1');

    expect(exists).toBe(true);
  });

  it('hasSave bos sonuc icin false dondurur', async () => {
    const db = new GameStateDb();
    mockSelect.mockResolvedValueOnce([{ count: 0 }]);

    const exists = await db.hasSave('slot-1');

    expect(exists).toBe(false);
  });

  it('getSaveMeta kayit metadata dondurur ve generic tip calisir', async () => {
    const db = new GameStateDb();
    await db.init();
    const data = { level: 5, health: 100 };
    mockSelect.mockResolvedValueOnce([
      {
        slot: 'slot-1',
        data: JSON.stringify(data),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);

    const meta = await db.getSaveMeta<{ level: number; health: number }>('slot-1');

    expect(meta).toEqual({
      slot: 'slot-1',
      data,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('close veritabani baglantisini kapatir ve init tekrar baglanir', async () => {
    const db = new GameStateDb();
    await db.init();
    await db.close();

    expect(mockClose).toHaveBeenCalled();
    expect(Database.load).toHaveBeenCalledTimes(1);

    await db.init();
    expect(Database.load).toHaveBeenCalledTimes(2);
  });

  it('init basarisiz olursa GameStateDbError fırlatir', async () => {
    vi.mocked(Database.load).mockRejectedValue(new Error('connection failed'));

    const db = new GameStateDb();

    await expect(db.init()).rejects.toBeInstanceOf(GameStateDbError);
    await expect(db.init()).rejects.toThrow(/yuklenemedi/);
  });

  it('clear tum kayitlari siler', async () => {
    const db = new GameStateDb();
    await db.clear();

    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM saves');
  });

  it('custom path ile calisir', async () => {
    const db = new GameStateDb({ path: 'custom-game.db' });
    await db.init();

    expect(Database.load).toHaveBeenCalledWith('sqlite:custom-game.db');
  });
});
