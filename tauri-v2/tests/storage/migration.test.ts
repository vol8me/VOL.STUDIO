import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from '@tauri-apps/plugin-sql';
import { GameStateDb } from '../../src/storage/GameStateDb';

const mockExecute = vi.fn();
const mockSelect = vi.fn();
const mockClose = vi.fn();

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn(),
  },
}));

describe('GameStateDb migration', () => {
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

  it("v0 veritabanı v1'e yükseltilir", async () => {
    // schema_version boş — currentVersion 0 döner
    mockSelect.mockResolvedValueOnce([]);

    const db = new GameStateDb();
    await db.init();

    // v0 → v1: INSERT OR REPLACE ile version=1 yazılır
    expect(mockExecute).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO schema_version (version) VALUES (?)',
      [1],
    );
  });

  it('v1 veritabanı tekrar migrate edilmez', async () => {
    // schema_version'da version=1 var
    mockSelect.mockResolvedValueOnce([{ version: 1 }]);

    const db = new GameStateDb();
    await db.init();

    // v1 → v2 migration henüz yok, dolayısıyla ek INSERT çağrılmaz
    const insertCalls = mockExecute.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO schema_version'),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("init sonrası close + tekrar init migration'ı tekrarlamaz", async () => {
    mockSelect.mockResolvedValueOnce([{ version: 1 }]);

    const db = new GameStateDb();
    await db.init();
    await db.close();

    // Tekrar init — migration yine v1 görür, tekrar yazmaz
    mockSelect.mockResolvedValueOnce([{ version: 1 }]);
    await db.init();

    const insertCalls = mockExecute.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO schema_version'),
    );
    expect(insertCalls).toHaveLength(0);
  });
});
