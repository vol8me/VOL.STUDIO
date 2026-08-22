import { describe, it, expect } from 'vitest';
import { Cooldown } from '../../src/time/Cooldown';
import { Clock } from '../../src/time/Clock';
import { RoundLoop } from '../../src/time/RoundLoop';
import { Scheduler } from '../../src/time/Scheduler';
import { ResourcePool } from '../../src/economy/ResourcePool';
import { SpatialIndex } from '../../src/spatial/SpatialIndex';
import { isFiniteNumber, requireFinite, finiteOr } from '../../src/math/numeric';
import { collectSpriteDocIssues, validateSpriteDoc } from '../../src/visual/validate';

/**
 * Sonlu sayı sözleşmesi — primitiflerin ORTAK giriş bariyeri.
 *
 * `NaN`/`Infinity` bir kez duruma girdiğinde her aritmetiği kirletir ve kaynağı
 * çok sonra, ilgisiz bir yerde fark edilir. Ölçülen eski davranış:
 * `Cooldown.update(NaN)` beklemeyi kalıcı `NaN` yapıyor ve bekleme sonsuza dek
 * bitmiyordu; `ResourcePool.add(NaN)` bakiyeyi zehirliyordu; `spend({x: NaN})`
 * `true` dönüp hiçbir şey düşmüyordu.
 *
 * İki politika vardır ve seçim bilinçlidir: yapılandırma değeri REDDEDİLİR
 * (hata çağıranındır), akış değeri (`deltaMs`) YOKSAYILIR (tek bozuk kare
 * yüzünden oyunu durdurmak orantısız olurdu).
 */
describe('sonlu sayı sözleşmesi', () => {
  describe('yardımcılar', () => {
    it('isFiniteNumber yalnızca gerçek sayıya true der', () => {
      expect(isFiniteNumber(1)).toBe(true);
      expect(isFiniteNumber(NaN)).toBe(false);
      expect(isFiniteNumber(Infinity)).toBe(false);
      expect(isFiniteNumber('1')).toBe(false);
      expect(isFiniteNumber(null)).toBe(false);
    });

    it('requireFinite alan adıyla birlikte fırlatır', () => {
      expect(() => requireFinite(NaN, 'test alanı')).toThrow(/test alanı/);
      expect(requireFinite(5, 'x')).toBe(5);
    });

    it('finiteOr bozuk değeri yedekle değiştirir', () => {
      expect(finiteOr(NaN, 0)).toBe(0);
      expect(finiteOr(Infinity, 7)).toBe(7);
      expect(finiteOr(3, 0)).toBe(3);
    });
  });

  describe('yapılandırma REDDEDİLİR', () => {
    it('Cooldown sonlu olmayan süreyi reddeder', () => {
      // Eskiden kabul ediliyordu ve trigger() sonrası bekleme HİÇ bitmiyordu.
      expect(() => new Cooldown(NaN)).toThrow(/sonlu/);
      expect(() => new Cooldown(Infinity)).toThrow(/sonlu/);
      expect(() => new Cooldown(100).setDuration(NaN)).toThrow(/sonlu/);
    });

    it('RoundLoop sonlu olmayan mola/başlangıç turunu reddeder', () => {
      expect(() => new RoundLoop({ breakMs: NaN })).toThrow(/sonlu/);
      expect(() => new RoundLoop({ breakMs: 100, startRound: NaN })).toThrow(/sonlu/);
    });

    it('Scheduler sonlu olmayan gecikme/periyodu reddeder', () => {
      const scheduler = new Scheduler();
      expect(() => scheduler.after(NaN, () => {})).toThrow(/sonlu/);
      expect(() => scheduler.every(NaN, () => {})).toThrow(/sonlu/);
    });

    it('ResourcePool sonlu olmayan başlangıç/sınır/miktarı reddeder', () => {
      expect(() => new ResourcePool<'g'>({ g: NaN })).toThrow(/sonlu/);
      expect(() => new ResourcePool<'g'>({ g: 1 }, { g: Infinity })).toThrow(/sonlu/);

      const pool = new ResourcePool<'g'>({ g: 100 });
      expect(() => pool.add('g', NaN)).toThrow(/sonlu/);
      expect(() => pool.set('g', NaN)).toThrow(/sonlu/);
      expect(() => pool.setCap('g', NaN)).toThrow(/sonlu/);
    });

    it('SpatialIndex sonlu olmayan konumu reddeder', () => {
      // Eskiden indekse giriyor (size artıyor) ama hiçbir sorgu bulamıyordu:
      // indekste görünen ama erişilemeyen bir kara delik.
      const index = new SpatialIndex<{ x: number; y: number }>(50);
      expect(() => index.insert({ x: NaN, y: 0 })).toThrow(/sonlu/);
      expect(() => index.insert({ x: 0, y: Infinity })).toThrow(/sonlu/);
      expect(index.size).toBe(0);
    });

    it('SpatialIndex sonlu olmayan cellSize reddeder', () => {
      expect(() => new SpatialIndex<{ x: number; y: number }>(NaN)).toThrow(/sonlu/);
    });

    it('görsel belgede size/seed/freq reddedilir', () => {
      // Görsel sentez yapılandırmadır, akış değil: bozuk bir `size` sessizce
      // düzeltilirse hata render'a kadar ertelenir ve çıktı sessizce yanlış
      // çözünürlükte üretilir.
      const doc = {
        schemaVersion: 1,
        size: [32, 32],
        seed: 1,
        palette: { colors: ['#000000'], ramps: [{ id: 0, indices: [0] }] },
        layers: [{ id: 'a', source: { kind: 'noise.value', freq: 4 }, material: 0 }],
      };

      expect(() => validateSpriteDoc({ ...doc, size: [NaN, 32] })).toThrow(/sonlu/);
      expect(() => validateSpriteDoc({ ...doc, seed: Infinity })).toThrow(/sonlu/);
      expect(
        collectSpriteDocIssues({
          ...doc,
          layers: [{ id: 'a', source: { kind: 'noise.value', freq: NaN }, material: 0 }],
        }).some((issue) => /freq.*sonlu/.test(issue)),
      ).toBe(true);

      // Sağlam belge geçmeye devam eder.
      expect(collectSpriteDocIssues(doc)).toEqual([]);
    });
  });

  describe('akış değeri YOKSAYILIR', () => {
    it('Cooldown.update(NaN) beklemeyi bozmaz', () => {
      const cd = new Cooldown(100);
      cd.trigger();
      cd.update(NaN);

      expect(cd.getRemaining()).toBe(100);
      expect(Number.isFinite(cd.getProgress())).toBe(true);
    });

    it('Clock.update(NaN) geçen süreyi bozmaz', () => {
      const clock = new Clock();
      clock.update(100);
      clock.update(NaN);
      clock.update(Infinity);

      expect(clock.getElapsed()).toBe(100);
    });

    it('Scheduler.update(NaN) zamanı ilerletmez', () => {
      const scheduler = new Scheduler();
      let calls = 0;
      scheduler.every(10, () => calls++);

      scheduler.update(NaN);
      expect(calls).toBe(0);

      scheduler.update(10);
      expect(calls).toBe(1);
    });
  });

  describe('sonlu olmayan maliyet BEDAVA ALIŞVERİŞ olmaz', () => {
    it('spend sonlu olmayan kalemi karşılanamaz sayar', () => {
      // Eskiden `NaN > 0` yanlış olduğu için kalem atlanıyor, spend true
      // dönüyor ve hiçbir şey düşülmüyordu.
      const pool = new ResourcePool<'g'>({ g: 100 });

      expect(pool.canAfford({ g: NaN })).toBe(false);
      expect(pool.spend({ g: NaN })).toBe(false);
      expect(pool.get('g')).toBe(100);
    });

    it('geçerli kalemler normal çalışmaya devam eder', () => {
      const pool = new ResourcePool<'g'>({ g: 100 });
      expect(pool.spend({ g: 40 })).toBe(true);
      expect(pool.get('g')).toBe(60);
    });
  });
});
