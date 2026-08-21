import { describe, it, expect, vi } from 'vitest';
import { ObjectPool } from '../../src/pool/ObjectPool';

interface Bullet {
  id: number;
  owner: object | null;
}

describe('ObjectPool', () => {
  function pool(overrides: Partial<{ prewarm: number; maxIdle: number }> = {}) {
    let next = 0;
    return new ObjectPool<Bullet>({
      create: () => ({ id: ++next, owner: null }),
      reset: (item) => {
        item.owner = null;
      },
      ...overrides,
    });
  }

  it('boşken yeni örnek üretir', () => {
    const p = pool();
    expect(p.acquire().id).toBe(1);
    expect(p.acquire().id).toBe(2);
  });

  it('iade edilen örnek YENİDEN kullanılır', () => {
    const p = pool();
    const first = p.acquire();
    p.release(first);

    expect(p.acquire()).toBe(first);
  });

  it('prewarm örnekleri önceden üretir', () => {
    const p = pool({ prewarm: 3 });
    expect(p.getIdleCount()).toBe(3);
  });

  it('reset iade sırasında çalışır — referans bırakılır', () => {
    // Boşta duran bir mermi hâlâ düşmana referans tutuyorsa o düşman da
    // serbest kalmaz; sızıntının klasik biçimi.
    const p = pool();
    const bullet = p.acquire();
    bullet.owner = { name: 'enemy' };

    p.release(bullet);
    expect(bullet.owner).toBeNull();
  });

  it('aynı örneği İKİ KEZ iade etmek hata verir', () => {
    // Sessiz geçerse aynı nesne iki farklı sahibe dağıtılır ve hata
    // ayıklanamaz hâle gelir.
    const p = pool();
    const bullet = p.acquire();
    p.release(bullet);

    expect(() => p.release(bullet)).toThrow(/iki kez iade/);
  });

  it('aktif ve boşta sayıları takip edilir', () => {
    const p = pool();
    const a = p.acquire();
    const b = p.acquire();
    expect(p.getActiveCount()).toBe(2);
    expect(p.getIdleCount()).toBe(0);

    p.release(a);
    expect(p.getActiveCount()).toBe(1);
    expect(p.getIdleCount()).toBe(1);

    p.release(b);
    expect(p.getActiveCount()).toBe(0);
  });

  it('maxIdle aşılırsa iade edilen örnek TUTULMAZ', () => {
    // Tepe anında şişen havuz o belleği koşu boyunca elinde tutmamalı.
    const p = pool({ maxIdle: 1 });
    const a = p.acquire();
    const b = p.acquire();

    p.release(a);
    p.release(b);
    expect(p.getIdleCount()).toBe(1);
  });

  it('clear boştakileri bırakır, aktifleri ETKİLEMEZ', () => {
    const p = pool({ prewarm: 2 });
    const active = p.acquire();

    p.clear();
    expect(p.getIdleCount()).toBe(0);
    expect(p.getActiveCount()).toBe(1);
    expect(() => p.release(active)).not.toThrow();
  });

  it('reset verilmezse iade yine çalışır', () => {
    const p = new ObjectPool<Bullet>({ create: () => ({ id: 0, owner: null }) });
    const item = p.acquire();
    expect(() => p.release(item)).not.toThrow();
  });

  it('create yalnızca gerektiğinde çağrılır', () => {
    const create = vi.fn(() => ({ id: 0, owner: null }));
    const p = new ObjectPool<Bullet>({ create, prewarm: 1 });

    p.release(p.acquire());
    p.acquire();
    expect(create).toHaveBeenCalledTimes(1);
  });

  describe('sahiplik', () => {
    it('havuzdan ALINMAMIŞ nesnenin iadesi REDDEDİLİR', () => {
      // Eskiden yabancı nesne havuza giriyor, activeCount'ı sahibi olmadığı
      // hâlde düşürüyor ve bir sonraki acquire() ile başka bir çağırana
      // dağıtılıyordu — iki sahip aynı örneği paylaşıyordu.
      const p = pool();
      p.acquire();
      const foreign = { id: 999, owner: null };

      expect(() => p.release(foreign)).toThrow(/alınmamış/);
      expect(p.getIdleCount()).toBe(0);
      expect(p.getActiveCount()).toBe(1);
    });

    it('reddedilen iade havuzun içeriğini kirletmez', () => {
      const p = pool();
      const owned = p.acquire();
      const foreign = { id: 999, owner: null };

      try {
        p.release(foreign);
      } catch {
        /* beklenen */
      }

      p.release(owned);
      expect(p.acquire()).toBe(owned);
    });

    it('aktif sayaç gerçek sahiplikten türer', () => {
      const p = pool();
      const a = p.acquire();
      const b = p.acquire();
      expect(p.getActiveCount()).toBe(2);

      p.release(a);
      expect(p.getActiveCount()).toBe(1);

      p.release(b);
      expect(p.getActiveCount()).toBe(0);
    });

    it('maxIdle yüzünden tutulmayan örnek yine de sahiplikten düşer', () => {
      const p = pool({ maxIdle: 0 });
      const item = p.acquire();
      p.release(item);

      expect(p.getActiveCount()).toBe(0);
      expect(p.getIdleCount()).toBe(0);
      // Havuz onu saklamadı; tekrar iade edilemez.
      expect(() => p.release(item)).toThrow(/alınmamış/);
    });

    it('clear sonrası aktif örnek HÂLÂ iade edilebilir', () => {
      // Havuz aktif örneklerin sahibi değildir; clear onları düşürmemeli.
      const p = pool({ prewarm: 2 });
      const active = p.acquire();
      p.clear();

      expect(() => p.release(active)).not.toThrow();
    });
  });
});
