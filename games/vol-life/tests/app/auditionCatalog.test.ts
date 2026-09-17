import { describe, expect, it, vi } from 'vitest';
import { describeSelection, loadAuditionSelection } from '@/app/auditionCatalog';
import { serializeAuditionCatalog } from '@/config/auditionCatalog';
import { sampleCatalog } from '../support/auditionCatalogFixture';

const serialized = serializeAuditionCatalog(sampleCatalog());
const readCatalog = (): Promise<string | null> => Promise.resolve(serialized);

describe('loadAuditionSelection', () => {
  /* Üretimde katalog OKUNMAZ bile; DEV kapısı fetch'ten önce gelir. */
  it('üretim derlemesinde katalogu okumaya kalkışmaz', async () => {
    const reader = vi.fn(readCatalog);
    expect(await loadAuditionSelection({ env: { DEV: false }, readCatalog: reader })).toBeNull();
    expect(reader).not.toHaveBeenCalled();
  });

  it('katalog yoksa açılışı engellemez', async () => {
    const selection = await loadAuditionSelection({
      env: { DEV: true },
      readCatalog: () => Promise.resolve(null),
    });
    expect(selection).toBeNull();
  });

  it('varsayılan seçim ilk aday ve ilk tohumdur', async () => {
    const selection = await loadAuditionSelection({ env: { DEV: true }, readCatalog });
    expect(selection?.entryIndex).toBe(0);
    expect(selection?.seed).toBe(11);
    expect(selection?.entryCount).toBe(3);
    expect(selection?.seedCount).toBe(3);
    expect(selection?.corpusId).toBe('corpus-v1');
  });

  it('sorgu parametresi adayı ve tohumu seçer', async () => {
    const selection = await loadAuditionSelection({
      env: { DEV: true },
      search: '?audition=2&seed=3',
      readCatalog,
    });
    expect(selection?.entryIndex).toBe(1);
    expect(selection?.seedIndex).toBe(2);
    expect(selection?.seed).toBe(33);
    expect(describeSelection(selection!)).toContain('2/3 · seed 3/3');
  });

  /*
   * Aralık dışı istek KIRPILMAZ. "aday 9" isteyip 1 numarayı izlemek,
   * ön-eleme notunu yanlış adaya yazmak demektir.
   */
  /*
   * Sorgu ENJEKTE EDİLMEDİĞİNDE adres çubuğu okunur. Bu yol canlı tarayıcıda
   * kırıktı: varsayılan boş dizeydi ve seçim hiç uygulanmıyordu.
   */
  it('sorgu verilmezse adres çubuğundan okunur', async () => {
    const original = window.location.search;
    window.history.replaceState({}, '', '/?audition=3&seed=2');
    try {
      const selection = await loadAuditionSelection({ env: { DEV: true }, readCatalog });
      expect(selection?.entryIndex).toBe(2);
      expect(selection?.seedIndex).toBe(1);
    } finally {
      window.history.replaceState({}, '', `/${original}`);
    }
  });

  it('aralık dışı ya da sayı olmayan seçim reddedilir', async () => {
    for (const search of ['?audition=0', '?audition=4', '?seed=4', '?audition=abc']) {
      await expect(
        loadAuditionSelection({ env: { DEV: true }, search, readCatalog }),
      ).rejects.toThrow(RangeError);
    }
  });

  it('bozuk katalog sessizce yutulmaz', async () => {
    await expect(
      loadAuditionSelection({ env: { DEV: true }, readCatalog: () => Promise.resolve('{}') }),
    ).rejects.toThrow();
  });

  /*
   * Katalog yokken `fetch`in kendisi fırlayabilir (file://, Tauri, çevrim
   * dışı). Bu YOKLUKTUR: açılış zinciri kırılmaz.
   */
  it('katalog okunamadığında açılış zinciri kırılmaz', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    try {
      await expect(loadAuditionSelection({ env: { DEV: true } })).resolves.toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('seçilen genom katalogdaki digest ile aynı adaydır', async () => {
    const selection = await loadAuditionSelection({ env: { DEV: true }, readCatalog });
    expect(selection?.entry.candidate.physics.dynamics.dampingPerReferenceTick).toBe(0.9);
    expect(selection?.entry.digest).toMatch(/^[0-9a-f]{16}$/);
  });
});
