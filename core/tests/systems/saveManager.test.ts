import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalStorageAdapter, SaveManager } from '../../src/systems/SaveManager';

describe('LocalStorageAdapter', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('QuotaExceededError yakalanır ve çökmeden işlem tamamlanır', async () => {
    const adapter = new LocalStorageAdapter();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const error = new DOMException('Quota exceeded', 'QuotaExceededError');
      throw error;
    });

    await expect(adapter.set('kayit', { x: 1 })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('depoda null varsa varsayılan değere düşer', async () => {
    localStorage.setItem('kayit', 'null');
    const manager = new SaveManager(new LocalStorageAdapter());
    const result = await manager.load('kayit', { x: 42 });
    expect(result).toEqual({ x: 42 });
  });

  it('depoda geçersiz JSON varsa varsayılan değere düşer', async () => {
    localStorage.setItem('kayit', 'not-json');
    const manager = new SaveManager(new LocalStorageAdapter());
    const result = await manager.load('kayit', { x: 42 });
    expect(result).toEqual({ x: 42 });
  });
});
