import { describe, it, expect, vi } from 'vitest';
import { RunEconomy } from '@/runtime/systems/RunEconomy';
import { economyConfig } from '@/config/economy';

describe('RunEconomy — Flux', () => {
  it('sıfırdan başlar', () => {
    expect(new RunEconomy().getFlux()).toBe(0);
  });

  it('toplanan Flux sayaca eklenir', () => {
    const economy = new RunEconomy();

    economy.addFlux(3);
    economy.addFlux(2);

    expect(economy.getFlux()).toBe(5);
  });

  it('sıfır ve negatif miktar yok sayılır', () => {
    const economy = new RunEconomy();

    economy.addFlux(0);
    economy.addFlux(-10);

    expect(economy.getFlux()).toBe(0);
  });

  it('yeterli bakiye varsa harcama başarılı', () => {
    const economy = new RunEconomy();
    economy.addFlux(10);

    expect(economy.spendFlux(4)).toBe(true);
    expect(economy.getFlux()).toBe(6);
  });

  it('bakiye yetmezse harcama reddedilir ve sayaç değişmez', () => {
    const economy = new RunEconomy();
    economy.addFlux(3);

    expect(economy.spendFlux(4)).toBe(false);
    expect(economy.getFlux()).toBe(3);
  });
});

describe('RunEconomy — Spark ve seviye', () => {
  it('1. seviyede ve sıfır Spark ile başlar', () => {
    const economy = new RunEconomy();
    expect(economy.getSpark()).toBe(0);
    expect(economy.getLevel()).toBe(1);
    expect(economy.getLevelSpan()).toBe(economyConfig.spark.baseThreshold);
  });

  it('eşik altında seviye atlamaz', () => {
    const onLevelUp = vi.fn();
    const economy = new RunEconomy({ onLevelUp });

    economy.addSpark(economyConfig.spark.baseThreshold - 1);

    expect(onLevelUp).not.toHaveBeenCalled();
    expect(economy.getLevel()).toBe(1);
  });

  it('eşiğe ulaşınca seviye atlar ve olay tetiklenir', () => {
    const onLevelUp = vi.fn();
    const economy = new RunEconomy({ onLevelUp });

    economy.addSpark(economyConfig.spark.baseThreshold);

    expect(onLevelUp).toHaveBeenCalledWith(2);
    expect(economy.getLevel()).toBe(2);
  });

  it('tek eklemede birden fazla eşik aşılırsa her seviye ayrı bildirilir', () => {
    const onLevelUp = vi.fn();
    const economy = new RunEconomy({ onLevelUp });

    economy.addSpark(economyConfig.spark.baseThreshold * 20);

    expect(onLevelUp.mock.calls.length).toBeGreaterThan(1);
    const levels = onLevelUp.mock.calls.map(([level]) => level as number);
    // Seviyeler atlanmadan sırayla bildirilir.
    expect(levels).toEqual(levels.map((_, i) => levels[0] + i));
  });

  it('eşik her seviyede büyür — sonraki seviye daha pahalı', () => {
    const economy = new RunEconomy();
    const first = economy.getLevelSpan(1);
    economy.addSpark(first);

    expect(economy.getLevelSpan()).toBeGreaterThan(first);
  });

  it('Spark yalnızca öldürmeden gelir — pasif artış yoktur', () => {
    const economy = new RunEconomy();
    economy.addSpark(0);
    economy.addSpark(-5);
    expect(economy.getSpark()).toBe(0);
  });

  it('getSparkInLevel mevcut seviye içindeki birikimi verir', () => {
    const economy = new RunEconomy();
    economy.addSpark(5);
    expect(economy.getSparkInLevel()).toBe(5);

    // Seviye atlayınca sayaç sıfırdan değil, eşiğin üstünden devam eder.
    const overflow = 3;
    economy.addSpark(economyConfig.spark.baseThreshold - 5 + overflow);
    expect(economy.getLevel()).toBe(2);
    expect(economy.getSparkInLevel()).toBe(overflow);
  });

  it('getLevelSpan bir seviyeyi tamamlamak için gereken Spark’ı verir', () => {
    const economy = new RunEconomy();
    expect(economy.getLevelSpan(1)).toBe(economyConfig.spark.baseThreshold);
    // Sonraki seviyeler daha pahalı.
    expect(economy.getLevelSpan(2)).toBeGreaterThan(economy.getLevelSpan(1));
  });

  it('bar değerleri tutarlı: seviye içi birikim, seviyenin aralığını aşmaz', () => {
    const economy = new RunEconomy();
    for (let i = 0; i < 40; i++) {
      economy.addSpark(7);
      expect(economy.getSparkInLevel()).toBeGreaterThanOrEqual(0);
      expect(economy.getSparkInLevel()).toBeLessThan(economy.getLevelSpan());
    }
  });

  it('reset tüm sayaçları başa alır', () => {
    const economy = new RunEconomy();
    economy.addFlux(20);
    economy.addSpark(economyConfig.spark.baseThreshold * 3);

    economy.reset();

    expect(economy.getFlux()).toBe(0);
    expect(economy.getSpark()).toBe(0);
    expect(economy.getLevel()).toBe(1);
    expect(economy.getLevelSpan()).toBe(economyConfig.spark.baseThreshold);
    expect(economy.getSparkInLevel()).toBe(0);
  });

  it('NaN ve Infinity Flux değerleri sayaca yansımaz', () => {
    const economy = new RunEconomy();
    economy.addFlux(NaN);
    economy.addFlux(Infinity);
    economy.addFlux(-Infinity);
    expect(economy.getFlux()).toBe(0);
  });

  it('NaN ve Infinity Spark değerleri sayacı bozmaz ve sonsuz döngü yapmaz', () => {
    const economy = new RunEconomy();
    economy.addSpark(NaN);
    economy.addSpark(Infinity);
    economy.addSpark(-Infinity);
    expect(economy.getSpark()).toBe(0);
    expect(economy.getLevel()).toBe(1);
  });

  it('tek seferde aşırı büyük Spark sınırlandırılır', () => {
    const onLevelUp = vi.fn();
    const economy = new RunEconomy({ onLevelUp });
    economy.addSpark(Number.MAX_SAFE_INTEGER);
    expect(economy.getLevel()).toBeGreaterThan(1);
    expect(onLevelUp).toHaveBeenCalledTimes(100);
  });

  it('harcama uç değerlerle reddedilir', () => {
    const economy = new RunEconomy();
    economy.addFlux(10);
    expect(economy.spendFlux(NaN)).toBe(false);
    expect(economy.spendFlux(Infinity)).toBe(false);
    expect(economy.getFlux()).toBe(10);
  });

  it('Flux değişimini yayınlar ve abonelik kaldırılabilir', () => {
    const economy = new RunEconomy();
    const listener = vi.fn();
    const unsubscribe = economy.onFluxChange(listener);

    economy.addFlux(10);
    economy.spendFlux(4);
    unsubscribe();
    economy.addFlux(2);

    expect(listener.mock.calls.map(([flux]) => flux as number)).toEqual([10, 6]);
  });

  describe('uç seviyelerde sayısal dayanıklılık', () => {
    it('doyurulmuş Spark ile seviye eşiği sonsuza kaçmaz', () => {
      const economy = new RunEconomy();
      // Geometrik eşik yüksek seviyede `Math.pow` ile Infinity üretebilir;
      // kapalı form bunu MAX_SAFE_INTEGER'a doyurmalı, NaN/Infinity sızdırmamalı.
      economy.addSpark(Number.MAX_SAFE_INTEGER);

      expect(Number.isFinite(economy.getLevel())).toBe(true);
      expect(Number.isFinite(economy.getSpark())).toBe(true);
      expect(Number.isFinite(economy.getSparkInLevel())).toBe(true);
      expect(Number.isFinite(economy.getLevelSpan())).toBe(true);
      expect(economy.getSparkInLevel()).toBeGreaterThanOrEqual(0);
      expect(economy.getLevelSpan()).toBeGreaterThan(0);
    });

    it('art arda doyurulmuş eklemeler sayaçları bozmaz', () => {
      const economy = new RunEconomy();
      for (let i = 0; i < 5; i++) economy.addSpark(Number.MAX_SAFE_INTEGER);

      expect(Number.isNaN(economy.getSparkInLevel())).toBe(false);
      expect(Number.isNaN(economy.getLevelSpan())).toBe(false);
      expect(economy.getSpark()).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    });

    it('istenen herhangi bir seviyenin aralığı sonlu ve pozitiftir', () => {
      const economy = new RunEconomy();
      for (const level of [1, 10, 100, 1_000, 100_000, 10_000_000]) {
        const span = economy.getLevelSpan(level);
        expect(Number.isFinite(span)).toBe(true);
        expect(span).toBeGreaterThan(0);
      }
    });

    it('geçersiz seviye isteği çökmez', () => {
      const economy = new RunEconomy();
      for (const level of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => economy.getLevelSpan(level)).not.toThrow();
        expect(Number.isNaN(economy.getLevelSpan(level))).toBe(false);
      }
    });

    it('doyurulmuş Flux artışında dinleyici sonsuz değer görmez', () => {
      const economy = new RunEconomy();
      const seen: number[] = [];
      economy.onFluxChange((flux) => seen.push(flux));

      economy.addFlux(Number.MAX_SAFE_INTEGER);
      // Doyuma ulaşıldıktan sonraki ekleme DEĞİŞİM üretmez, dinleyici de çağrılmaz.
      economy.addFlux(Number.MAX_SAFE_INTEGER);

      expect(seen).toHaveLength(1);
      expect(Number.isFinite(seen[0])).toBe(true);
    });

    it('dinleyici hata fırlatsa da ekonomi işlemi tamamlanır', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const economy = new RunEconomy();
      const healthy = vi.fn();
      economy.onFluxChange(() => {
        throw new Error('UI patladı');
      });
      economy.onFluxChange(healthy);

      economy.addFlux(25);

      expect(economy.getFlux()).toBe(25);
      expect(healthy).toHaveBeenCalledWith(25);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
