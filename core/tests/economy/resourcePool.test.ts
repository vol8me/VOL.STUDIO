import { describe, it, expect } from 'vitest';
import { ResourcePool } from '../../src/economy/ResourcePool';

/**
 * Testin KENDİ kaynak sözlüğü — CORE hiçbir kaynak adı bilmez, bu yüzden
 * VOL.HELL'in Flux/Spark'ı yerine yabancı bir küme kullanılır.
 */
type Resource = 'gold' | 'energy' | 'research';

const initial = (): Record<Resource, number> => ({ gold: 100, energy: 5, research: 0 });

describe('ResourcePool', () => {
  it('başlangıç miktarlarını taşır ve kopyalar (dışarıdaki mutasyon sızmaz)', () => {
    const base = initial();
    const pool = new ResourcePool<Resource>(base);
    base.gold = 9999;

    expect(pool.get('gold')).toBe(100);
  });

  it('add miktarı artırır, negatif/sıfır yok sayılır', () => {
    const pool = new ResourcePool<Resource>(initial());
    pool.add('gold', 50);
    expect(pool.get('gold')).toBe(150);

    pool.add('gold', -30);
    pool.add('gold', 0);
    expect(pool.get('gold')).toBe(150);
  });

  it('canAfford çok kaynaklı maliyeti kontrol eder', () => {
    const pool = new ResourcePool<Resource>(initial());
    expect(pool.canAfford({ gold: 100, energy: 5 })).toBe(true);
    expect(pool.canAfford({ gold: 100, energy: 6 })).toBe(false);
  });

  it('spend YA HEPSİ YA HİÇBİRİ — bir kaynak yetmezse hiçbiri düşmez', () => {
    // Kısmi harcama "altını gitti ama enerjisi yetmediği için kule kurulamadı"
    // gibi geri alınamaz bir duruma yol açardı.
    const pool = new ResourcePool<Resource>(initial());

    expect(pool.spend({ gold: 50, energy: 99 })).toBe(false);
    expect(pool.get('gold')).toBe(100);
    expect(pool.get('energy')).toBe(5);
  });

  it('yeterli bakiyede spend tüm kalemleri düşer', () => {
    const pool = new ResourcePool<Resource>(initial());
    expect(pool.spend({ gold: 40, energy: 2 })).toBe(true);
    expect(pool.get('gold')).toBe(60);
    expect(pool.get('energy')).toBe(3);
  });

  it('boş maliyet her zaman karşılanır', () => {
    const pool = new ResourcePool<Resource>(initial());
    expect(pool.spend({})).toBe(true);
  });

  it('üst sınır add sırasında kelepçeler', () => {
    const pool = new ResourcePool<Resource>(initial(), { energy: 10 });
    pool.add('energy', 100);
    expect(pool.get('energy')).toBe(10);
  });

  it('başlangıç değeri sınırı aşıyorsa constructor kelepçeler', () => {
    const pool = new ResourcePool<Resource>({ gold: 100, energy: 50, research: 0 }, { energy: 10 });
    expect(pool.get('energy')).toBe(10);
  });

  it('setCap mevcut miktarı da kelepçeler', () => {
    const pool = new ResourcePool<Resource>(initial());
    pool.setCap('gold', 40);
    expect(pool.get('gold')).toBe(40);

    pool.setCap('gold', undefined);
    pool.add('gold', 1000);
    expect(pool.get('gold')).toBe(1040);
  });

  it('miktar sıfırın altına inmez', () => {
    const pool = new ResourcePool<Resource>(initial());
    pool.set('gold', -50);
    expect(pool.get('gold')).toBe(0);
  });

  it('snapshot tüm kaynakları verir ve kopyadır', () => {
    const pool = new ResourcePool<Resource>(initial());
    const snap = pool.snapshot();
    snap.gold = 0;

    expect(pool.get('gold')).toBe(100);
  });
});
