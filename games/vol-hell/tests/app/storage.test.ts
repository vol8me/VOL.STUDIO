import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { isTauri } from '@tauri-apps/api/core';
import { TauriStoreAdapter } from '@volstudio/tauri-v2';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
}));

vi.mock('@volstudio/tauri-v2', () => ({
  TauriStoreAdapter: vi.fn(),
}));

describe('createStorageAdapter', () => {
  /*
   * Modül grafiğini testlerin DIŞINDA ısıt.
   *
   * Testler `vi.resetModules()` + dinamik `import` ile izole çalışır; bunun
   * bedeli, `@volstudio/core` kök barrel'ının gerçek grafiğinin bir kez
   * dönüştürülmesidir. Ölçüm: ilk test 4009 ms, ikincisi 280 ms — yani süre
   * davranışa değil, tek seferlik yüklemeye ait. Varsayılan 5000 ms'lik test
   * sınırı bu değere fazlasıyla yakın olduğu için tam takım koşarken test,
   * üründe hiçbir şey bozulmadan kırmızıya dönüyordu.
   *
   * `beforeAll` maliyeti test sınırının dışına taşır (hook'un kendi bütçesi
   * vardır) ve TEST SINIRINI ZAYIFLATMAZ: 5000 ms hâlâ gerçek bir kilitlenmeyi
   * yakalar. Sınırı yükseltmek aynı sonucu vermez — 697 testin kilitlenme
   * tespitini de gevşetirdi.
   * Hook'un KENDİ bütçesi ayrıca verilir. Coverage koşusu sourcemap ürettiği
   * için aynı grafik ~4 kat yavaş yüklenir ve varsayılan 10 sn'lik hook
   * bütçesi de yetmez. Bir hook davranış değil KURULUMDUR: bütçesini açmak
   * hiçbir testin son tarihini zayıflatmaz — test gövdeleri 5000 ms'de kalır.
   */
  beforeAll(async () => {
    await import('@volstudio/core');
  }, 120_000);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('Tauri disi ortamda LocalStorageAdapter kullanir', async () => {
    vi.mocked(isTauri).mockReturnValue(false);

    const { createStorageAdapter } = await import('@/app/storage');
    const adapter = createStorageAdapter();

    expect(adapter.constructor.name).toBe('LocalStorageAdapter');
  });

  it('Tauri ortaminda TauriStoreAdapter kullanir ve oyun kimligi ile store acar', async () => {
    vi.mocked(isTauri).mockReturnValue(true);

    const { createStorageAdapter } = await import('@/app/storage');
    const adapter = createStorageAdapter();

    expect(adapter).toBeInstanceOf(TauriStoreAdapter);
    expect(TauriStoreAdapter).toHaveBeenCalledWith({ gameId: 'vol-hell' });
  });
});
