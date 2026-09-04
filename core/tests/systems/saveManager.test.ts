import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalStorageAdapter, SaveManager, StorageError } from '../../src/systems/SaveManager';

describe('LocalStorageAdapter', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('QuotaExceededError StorageError olarak fırlatılır', async () => {
    const adapter = new LocalStorageAdapter();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const error = new DOMException('Quota exceeded', 'QuotaExceededError');
      throw error;
    });

    await expect(adapter.set('kayit', { x: 1 })).rejects.toBeInstanceOf(StorageError);
  });

  it('depoda null varsa varsayılan değere düşer', async () => {
    localStorage.setItem('kayit', 'null');
    const manager = new SaveManager(new LocalStorageAdapter());
    const result = await manager.load('kayit', { x: 42 });
    expect(result).toEqual({ x: 42 });
  });

  it('depoda geçersiz JSON varsa varsayılan değere düşer', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('kayit', 'not-json');
    const manager = new SaveManager(new LocalStorageAdapter());
    const result = await manager.load('kayit', { x: 42 });
    expect(result).toEqual({ x: 42 });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  /*
   * `localStorage`a ERİŞİMİN kendisi fırlatabilir: özel mod, depolamayı
   * engelleyen gizlilik ayarları, bazı gömülü WebView'lar. Okuma orada
   * fırlatırsa ayarları paralel yükleyen açılış yolu reddedilir ve oyun hiç
   * açılmaz. Depolamanın erişilemez olması "kayıtlı değer yok" ile aynı şeydir.
   */
  it('depolama ERİŞİLEMEZ olduğunda okuma fırlatmaz, varsayılana döner', async () => {
    const blocked = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    const manager = new SaveManager(new LocalStorageAdapter());

    await expect(manager.load('engelli', { varsayilan: true })).resolves.toEqual({
      varsayilan: true,
    });
  });

  it('depolama ERİŞİLEMEZ olduğunda silme fırlatmaz', async () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    const manager = new SaveManager(new LocalStorageAdapter());

    await expect(manager.delete('engelli')).resolves.toBeUndefined();
  });

  it('YAZMA reddeder: kaydın gitmediğini çağıran bilmelidir', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    const manager = new SaveManager(new LocalStorageAdapter());

    await expect(manager.save('engelli', { a: 1 })).rejects.toBeInstanceOf(StorageError);
  });
});
