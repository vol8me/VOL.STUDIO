import { describe, it, expect, vi } from 'vitest';
import { LocalStorageAdapter } from '../../src/systems/SaveManager';

describe('LocalStorageAdapter', () => {
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
});
