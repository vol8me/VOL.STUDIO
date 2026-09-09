import { describe, expect, it, vi } from 'vitest';
import { KeyBindings } from '@/app/KeyBindings';
import { HELL_PC_BINDINGS } from '@/config/input';

function fakeSaveManager(initial: unknown = {}) {
  const store = new Map<string, unknown>();
  if (initial !== undefined) store.set('vol-hell:key-bindings', initial);
  return {
    saved: store,
    load: vi.fn((key: string, fallback: unknown) => Promise.resolve(store.get(key) ?? fallback)),
    save: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  };
}

describe('KeyBindings', () => {
  it('kayıt yokken varsayılanları kullanır', async () => {
    const bindings = new KeyBindings(fakeSaveManager() as never);
    await bindings.load();
    expect(bindings.getAll()).toEqual(HELL_PC_BINDINGS);
  });

  it('kayıtlı eşlemeyi geri yükler', async () => {
    const manager = fakeSaveManager({ dash: { source: 'key', keyCode: 81 } });
    const bindings = new KeyBindings(manager as never);
    await bindings.load();
    expect(bindings.getAll().dash).toEqual({ source: 'key', keyCode: 81 });
    // Kayıtta olmayan eylem varsayılanını korur.
    expect(bindings.getAll().fire).toEqual(HELL_PC_BINDINGS.fire);
  });

  /*
   * Elle düzenlenmiş bir kayıt `resolvePCActions`a ulaşırsa eylem sessizce
   * hiç basılı sayılmaz; oyuncu tuşunun neden çalışmadığını anlamaz.
   */
  it('bozuk kayıtlar varsayılana düşer', async () => {
    const manager = fakeSaveManager({
      dash: { source: 'key', keyCode: 'space' },
      fire: { source: 'gamepad', button: 'a' },
    });
    const bindings = new KeyBindings(manager as never);
    await bindings.load();
    expect(bindings.getAll()).toEqual(HELL_PC_BINDINGS);
  });

  it('çözülemeyecek bir pointer düğmesi kabul edilmez', async () => {
    const manager = fakeSaveManager({ fire: { source: 'pointerButton', button: 'right' } });
    const bindings = new KeyBindings(manager as never);
    await bindings.load();
    expect(bindings.getAll().fire).toEqual(HELL_PC_BINDINGS.fire);
  });

  it('yeniden atama kalıcıdır', async () => {
    const manager = fakeSaveManager();
    const bindings = new KeyBindings(manager as never);
    await bindings.load();

    await bindings.rebind('dash', { source: 'key', keyCode: 81 });

    expect(bindings.getAll().dash).toEqual({ source: 'key', keyCode: 81 });
    expect(manager.save).toHaveBeenCalledWith('vol-hell:key-bindings', bindings.getAll());
  });

  /*
   * TAKAS: bir tuşu başka eyleme vermek, o tuşu tutan eylemi BAĞSIZ bırakmaz.
   * Aksi halde oyuncu bir eylemi kazara erişilemez kılabilirdi.
   */
  it('çakışan eylem ESKİ bağı devralır', async () => {
    const bindings = new KeyBindings(fakeSaveManager() as never);
    await bindings.load();
    await bindings.rebind('dash', { source: 'key', keyCode: 81 });

    const swapped = await bindings.rebind('fire', { source: 'key', keyCode: 81 });

    expect(swapped).toEqual(['dash']);
    expect(bindings.getAll().fire).toEqual({ source: 'key', keyCode: 81 });
    expect(bindings.getAll().dash).toEqual(HELL_PC_BINDINGS.fire);
  });

  it('iki eylem HİÇBİR zaman aynı bağı paylaşmaz', async () => {
    const bindings = new KeyBindings(fakeSaveManager() as never);
    await bindings.load();
    await bindings.rebind('fire', { source: 'key', keyCode: 32 });

    const all = Object.values(bindings.getAll());
    expect(new Set(all.map((b) => JSON.stringify(b))).size).toBe(all.length);
  });

  it('sıfırlama da takas kuralından geçer', async () => {
    const bindings = new KeyBindings(fakeSaveManager() as never);
    await bindings.load();
    await bindings.rebind('fire', { source: 'key', keyCode: 32 });
    expect(bindings.getAll().dash).not.toEqual(HELL_PC_BINDINGS.dash);

    await bindings.reset('fire');

    expect(bindings.getAll().fire).toEqual(HELL_PC_BINDINGS.fire);
    expect(bindings.getAll().dash).toEqual(HELL_PC_BINDINGS.dash);
  });

  it('abone değişikliği görür ve çözülebilir', async () => {
    const bindings = new KeyBindings(fakeSaveManager() as never);
    const seen: unknown[] = [];
    const stop = bindings.subscribe((data) => seen.push(data));

    await bindings.load();
    await bindings.rebind('dash', { source: 'key', keyCode: 81 });
    stop();
    await bindings.rebind('dash', { source: 'key', keyCode: 82 });

    expect(seen).toHaveLength(2);
  });

  /* Kalıcılık hatası oyunu durdurmaz; ayar oturum boyunca geçerli kalır. */
  it('kayıt başarısız olsa da yeni bağ oturumda geçerlidir', async () => {
    const manager = fakeSaveManager();
    manager.save = vi.fn(() => Promise.reject(new Error('kota doldu')));
    const bindings = new KeyBindings(manager as never);
    await bindings.load();

    await expect(bindings.rebind('dash', { source: 'key', keyCode: 81 })).resolves.toEqual([]);
    expect(bindings.getAll().dash).toEqual({ source: 'key', keyCode: 81 });
  });

  it('resetAll varsayılanlara döner', async () => {
    const bindings = new KeyBindings(fakeSaveManager() as never);
    await bindings.load();
    await bindings.rebind('dash', { source: 'key', keyCode: 81 });

    await bindings.resetAll();

    expect(bindings.getAll()).toEqual(HELL_PC_BINDINGS);
  });
});
