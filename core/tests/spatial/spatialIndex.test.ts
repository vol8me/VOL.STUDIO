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

  describe('geniş yarıçap sözleşmesi', () => {
    it('query() cellSize ötesindeki varlığı KAÇIRIR — sözleşmesi budur', () => {
      // Bu kasıtlı bir sınırdır ve belgelenmiştir; testin amacı sınırın
      // farkında olunduğunu kilitlemek, aksi halde queryRadius'un neden var
      // olduğu bir sonraki okuyucuya kaybolur.
      const index = new SpatialIndex<Unit>(50);
      const far = unit(200, 0);
      index.insert(far);

      expect(index.query(0, 0)).not.toContain(far);
    });

    it('queryRadius cellSize ötesini DOĞRU bulur', () => {
      const index = new SpatialIndex<Unit>(50);
      const far = unit(200, 0);
      index.insert(far);

      expect(index.queryRadius(0, 0, 250)).toContain(far);
    });

    it('queryRadius sonucu daireye göre filtreler (köşe sızıntısı yok)', () => {
      // Taranan hücre penceresi KARE, arama alanı DAİREdir; filtrelemeden
      // köşedeki varlıklar da dönerdi.
      const index = new SpatialIndex<Unit>(10);
      const corner = unit(90, 90); // merkeze uzaklık ~127
      index.insert(corner);

      expect(index.queryRadius(0, 0, 100)).not.toContain(corner);
      expect(index.queryRadius(0, 0, 130)).toContain(corner);
    });

    it('queryRadius geçersiz yarıçapta boş döner', () => {
      const index = new SpatialIndex<Unit>(50);
      index.insert(unit(10, 10));

      expect(index.queryRadius(0, 0, 0)).toEqual([]);
      expect(index.queryRadius(0, 0, -5)).toEqual([]);
      expect(index.queryRadius(0, 0, NaN)).toEqual([]);
    });

    it('queryRadius pasif varlıkları eler', () => {
      const index = new SpatialIndex<Unit>(50, (u) => u.alive);
      index.insert(unit(10, 10, false));
      expect(index.queryRadius(0, 0, 100)).toEqual([]);
    });

    it('queryBounds dikdörtgen içindekileri döner', () => {
      const index = new SpatialIndex<Unit>(20);
      const inside = unit(50, 50);
      const outside = unit(500, 500);
      index.insert(inside);
      index.insert(outside);

      const result = index.queryBounds(0, 0, 100, 100);
      expect(result).toContain(inside);
      expect(result).not.toContain(outside);
    });

    it('queryBounds negatif genişlik/yükseklik normalize eder', () => {
      // Sürükleyerek çizilen seçim kutusu her yöne açılabilir.
      const index = new SpatialIndex<Unit>(20);
      const target = unit(50, 50);
      index.insert(target);

      expect(index.queryBounds(100, 100, -100, -100)).toContain(target);
    });

    it('queryBounds hücre sınırına yakın varlıkları kesin olarak filtreler', () => {
      const index = new SpatialIndex<Unit>(20);
      const justOutside = unit(101, 50);
      index.insert(justOutside);

      expect(index.queryBounds(0, 0, 100, 100)).not.toContain(justOutside);
    });

    it('findNearest en yakını verir ve kendini hariç tutabilir', () => {
      const index = new SpatialIndex<Unit>(50);
      const self = unit(0, 0);
      const near = unit(30, 0);
      const far = unit(120, 0);
      index.rebuild([self, near, far]);

      expect(index.findNearest(0, 0, 200)).toBe(self);
      expect(index.findNearest(0, 0, 200, self)).toBe(near);
    });

    it('findNearest yarıçap içinde hiçbir şey yoksa null döner', () => {
      const index = new SpatialIndex<Unit>(50);
      index.insert(unit(500, 500));
      expect(index.findNearest(0, 0, 100)).toBeNull();
    });

    it('geniş sorgular da yeniden kullanılan tamponu paylaşır ama çakışmaz', () => {
      const index = new SpatialIndex<Unit>(20);
      const a = unit(10, 10);
      const b = unit(500, 500);
      index.rebuild([a, b]);

      const first = index.queryRadius(10, 10, 30);
      const second = index.queryBounds(480, 480, 40, 40);

      expect(first).toEqual([a]);
      expect(second).toEqual([b]);
    });
  });

  describe('sonuç tamponu sözleşmesi', () => {
    function seeded(): SpatialIndex<Unit> {
      const index = new SpatialIndex<Unit>(20);
      for (let i = 0; i < 5; i++) index.insert(unit(i * 200, 0));
      return index;
    }

    it('halka tampon 4 sorgudan sonra devreder (belgelenmiş sınır)', () => {
      // Ölçülen davranış: 5 sonuç saklandığında birinci sonuç beşincinin
      // verisine dönüşüyor ve HİÇBİR hata çıkmıyordu. Test bu sınırın
      // farkında olunduğunu kilitler.
      const index = seeded();
      const held = [0, 1, 2, 3, 4].map((i) => index.query(i * 200, 0));

      expect(held[0]).toBe(held[4]);
    });

    it('queryStamp + assertQueryValid bozulmayı GÜRÜLTÜLÜ yapar', () => {
      const index = seeded();
      index.query(0, 0);
      const stamp = index.queryStamp();

      expect(() => index.assertQueryValid(stamp)).not.toThrow();

      for (let i = 1; i <= 4; i++) index.query(i * 200, 0);
      expect(() => index.assertQueryValid(stamp)).toThrow(/devretti/);
    });

    it('queryInto ÇAĞIRANIN dizisine yazar — halka tampona hiç girmez', () => {
      const index = seeded();
      const mine: Unit[] = [];
      index.queryInto(mine, 0, 0);
      const snapshot = [...mine];

      // Halkayı tamamen devret; saklanan sonuç etkilenmemeli.
      for (let i = 0; i < 10; i++) index.query(i * 200, 0);

      expect(mine).toEqual(snapshot);
      expect(mine).toHaveLength(1);
    });

    it('queryInto verilen diziyi önce temizler ve geri döner', () => {
      const index = seeded();
      const mine: Unit[] = [unit(-1, -1)];

      expect(index.queryInto(mine, 0, 0)).toBe(mine);
      expect(mine).toHaveLength(1);
      expect(mine[0].x).toBe(0);
    });

    it('queryRadiusInto geniş yarıçapta da çağıranın dizisine yazar', () => {
      const index = seeded();
      const mine: Unit[] = [];
      index.queryRadiusInto(mine, 0, 0, 450);

      expect(mine.length).toBeGreaterThan(1);
      for (let i = 0; i < 10; i++) index.query(i * 200, 0);
      expect(mine.length).toBeGreaterThan(1);
    });

    it('queryRadiusInto geçersiz yarıçapta boş dizi döner', () => {
      const index = seeded();
      const mine: Unit[] = [unit(9, 9)];

      expect(index.queryRadiusInto(mine, 0, 0, -1)).toEqual([]);
      expect(index.queryRadiusInto(mine, 0, 0, NaN)).toEqual([]);
    });

    it('queryInto ile query AYNI sonucu verir', () => {
      const index = seeded();
      const mine: Unit[] = [];

      expect(index.queryInto(mine, 200, 0)).toEqual([...index.query(200, 0)]);
    });
  });
});
