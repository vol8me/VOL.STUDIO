import { describe, it, expect } from 'vitest';
import { SpatialIndex } from '../../src/spatial/SpatialIndex';

interface Unit {
  x: number;
  y: number;
  alive: boolean;
}

const unit = (x: number, y: number, alive = true): Unit => ({ x, y, alive });

describe('SpatialIndex', () => {
  it('cellSize pozitif olmalı', () => {
    expect(() => new SpatialIndex<Unit>(0)).toThrow(/pozitif/);
    expect(() => new SpatialIndex<Unit>(-5)).toThrow(/pozitif/);
  });

  it('yakındaki varlıkları döner, uzaktakini dönmez', () => {
    const index = new SpatialIndex<Unit>(50);
    const near = unit(10, 10);
    const far = unit(5000, 5000);
    index.insert(near);
    index.insert(far);

    const result = index.query(12, 12);
    expect(result).toContain(near);
    expect(result).not.toContain(far);
  });

  it('komşu hücrelerdeki varlıklar da dönerimlanır', () => {
    const index = new SpatialIndex<Unit>(50);
    const neighbour = unit(60, 60); // yan hücre
    index.insert(neighbour);

    expect(index.query(40, 40)).toContain(neighbour);
  });

  it('NEGATİF koordinatlar farklı hücrelere düşer (anahtar taşması yok)', () => {
    // Hatalı bir anahtar formülünde key(cx, cy) === key(cx+1, cy-OFFSET)
    // olabiliyordu; negatif koordinatlar bu hatayı açığa çıkarır.
    const index = new SpatialIndex<Unit>(10);
    const a = unit(-1000, -1000);
    const b = unit(1000, 1000);
    index.insert(a);
    index.insert(b);

    expect(index.query(-1000, -1000)).toEqual([a]);
    expect(index.query(1000, 1000)).toEqual([b]);
  });

  it('remove varlığı çıkarır', () => {
    const index = new SpatialIndex<Unit>(50);
    const u = unit(10, 10);
    index.insert(u);

    expect(index.remove(u)).toBe(true);
    expect(index.query(10, 10)).toEqual([]);
    expect(index.remove(u)).toBe(false);
  });

  it('update hareket eden varlığı yeni hücreye taşır', () => {
    const index = new SpatialIndex<Unit>(50);
    const u = unit(10, 10);
    index.insert(u);

    u.x = 500;
    u.y = 500;
    index.update(u);

    expect(index.query(10, 10)).toEqual([]);
    expect(index.query(500, 500)).toEqual([u]);
  });

  it('kayıtlı olmayan varlıkta update EKLER (upsert)', () => {
    // "İndekste olduğundan emin ol ve konumunu tazele" tek çağrıyla ifade
    // edilir; çağıran her karede has() ile ön kontrol yapmak zorunda kalmaz.
    const index = new SpatialIndex<Unit>(50);
    const u = unit(0, 0);

    expect(index.update(u)).toBe(true);
    expect(index.query(0, 0)).toEqual([u]);
  });

  it('aynı hücrede kalan hareket ERKEN ÇIKAR (false döner, iş yapılmaz)', () => {
    // Artımlı modelin asıl kazancı bu: hareketin çoğu hücre değiştirmez.
    const index = new SpatialIndex<Unit>(100);
    const u = unit(10, 10);
    index.insert(u);

    u.x = 20;
    expect(index.update(u)).toBe(false);
    expect(index.query(20, 20)).toEqual([u]);
  });

  it('hücre değiştiren hareket true döner', () => {
    const index = new SpatialIndex<Unit>(50);
    const u = unit(10, 10);
    index.insert(u);

    u.x = 500;
    expect(index.update(u)).toBe(true);
  });

  it('ARTIMLI ve REBUILD modelleri AYNI sonucu verir', () => {
    // İki modelin eşdeğerliği bu sınıfın temel sözleşmesi; ayrışırlarsa
    // tüketici hangi modeli seçtiğine göre farklı oyun davranışı görür.
    const units = [unit(5, 5), unit(55, 5), unit(5, 55), unit(200, 200), unit(-30, -30)];

    const incremental = new SpatialIndex<Unit>(50);
    for (const u of units) incremental.insert(u);

    const rebuilt = new SpatialIndex<Unit>(50);
    rebuilt.rebuild(units);

    for (const probe of [
      [0, 0],
      [55, 5],
      [200, 200],
      [-30, -30],
      [999, 999],
    ] as const) {
      expect([...incremental.query(probe[0], probe[1])].sort()).toEqual(
        [...rebuilt.query(probe[0], probe[1])].sort(),
      );
    }
  });

  it('hareketten sonra artımlı güncelleme rebuild ile aynı sonucu verir', () => {
    const units = [unit(5, 5), unit(55, 55)];
    const incremental = new SpatialIndex<Unit>(50);
    incremental.rebuild(units);

    units[0].x = 300;
    units[0].y = 300;
    incremental.update(units[0]);

    const rebuilt = new SpatialIndex<Unit>(50);
    rebuilt.rebuild(units);

    expect([...incremental.query(300, 300)]).toEqual([...rebuilt.query(300, 300)]);
    expect(incremental.query(5, 5)).toEqual(rebuilt.query(5, 5));
  });

  it('isActive false dönen varlıklar sorgudan elenir', () => {
    const index = new SpatialIndex<Unit>(50, (u) => u.alive);
    const dead = unit(10, 10, false);
    const live = unit(12, 12);
    index.insert(dead);
    index.insert(live);

    expect(index.query(10, 10)).toEqual([live]);
  });

  it('rebuild pasif varlıkları hiç indekslemez', () => {
    const index = new SpatialIndex<Unit>(50, (u) => u.alive);
    index.rebuild([unit(10, 10, false), unit(12, 12)]);

    expect(index.size).toBe(1);
  });

  it('boşalan hücre haritadan düşer (hücre birikmez)', () => {
    const index = new SpatialIndex<Unit>(50);
    const u = unit(10, 10);
    index.insert(u);
    expect(index.getCellCount()).toBe(1);

    index.remove(u);
    expect(index.getCellCount()).toBe(0);
  });

  it('iç içe sorgular birbirinin sonucunu bozmaz', () => {
    const index = new SpatialIndex<Unit>(50);
    const a = unit(10, 10);
    const b = unit(500, 500);
    index.insert(a);
    index.insert(b);

    const first = index.query(10, 10);
    const second = index.query(500, 500);

    expect(first).toEqual([a]);
    expect(second).toEqual([b]);
  });

  it('clear her şeyi siler', () => {
    const index = new SpatialIndex<Unit>(50);
    index.rebuild([unit(1, 1), unit(2, 2)]);
    index.clear();

    expect(index.size).toBe(0);
    expect(index.getCellCount()).toBe(0);
  });
});
