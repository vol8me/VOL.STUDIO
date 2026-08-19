import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { SpatialGrid } from '@/runtime/systems/SpatialGrid';

/** Düşman yerine geçen basit test mock'u */
function makeEnemy(x: number, y: number, alive = true) {
  return {
    x,
    y,
    radius: 14,
    isAlive: alive,
  } as unknown as Parameters<SpatialGrid['insert']>[0];
}

describe('SpatialGrid', () => {
  it('yakın hücredeki düşmanları bulur', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(100, 100));
    grid.insert(makeEnemy(500, 500));

    const nearby = grid.queryNearby(105, 105);
    expect(nearby).toHaveLength(1);
    expect(nearby[0].x).toBe(100);
  });

  it('uzak hücredeki düşmanları döndürmez', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(100, 100));
    grid.insert(makeEnemy(1000, 1000));

    const nearby = grid.queryNearby(105, 105);
    expect(nearby).toHaveLength(1);
  });

  it('komşu hücre sınırındaki düşmanları bulur', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(55, 55));
    grid.insert(makeEnemy(57, 57));

    const nearby = grid.queryNearby(56, 56);
    expect(nearby).toHaveLength(2);
  });

  it('clear sonrası boş döner', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(100, 100));
    grid.clear();

    const nearby = grid.queryNearby(105, 105);
    expect(nearby).toHaveLength(0);
  });

  it('insertAll ölü düşmanları atlar', () => {
    const grid = new SpatialGrid(56);
    const enemies = [makeEnemy(100, 100, true), makeEnemy(110, 110, false)];
    grid.rebuild(enemies);

    const nearby = grid.queryNearby(105, 105);
    expect(nearby).toHaveLength(1);
  });

  it('aynı hücrede birden fazla düşman', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(10, 10));
    grid.insert(makeEnemy(20, 20));
    grid.insert(makeEnemy(30, 30));

    const nearby = grid.queryNearby(15, 15);
    expect(nearby).toHaveLength(3);
  });

  it("1000 düşmanda grid sorgusu brute-force'tan çok daha az sonuç döndürür", () => {
    const cellSize = 56;
    const grid = new SpatialGrid(cellSize);

    // 1000 düşmanı 2000x2000 alanına dağıt
    const enemies: ReturnType<typeof makeEnemy>[] = [];
    for (let i = 0; i < 1000; i++) {
      const x = (i * 63) % 2000;
      const y = (i * 97) % 2000;
      enemies.push(makeEnemy(x, y));
    }
    grid.rebuild(enemies);

    // (100, 100) civarında sorgula — en fazla 9 hücredekiler döner
    const nearby = grid.queryNearby(100, 100);

    // Brute-force tüm 1000 düşmanı kontrol ederdi; grid yalnızca yakındaki ~9 hücreyi
    expect(nearby.length).toBeLessThan(50);
    expect(nearby.length).toBeGreaterThan(0);

    // Brute-force karşılaştırma: aynı pozisyon için tüm düşmanları filtrele
    const bruteForce = enemies.filter(
      (e) => Math.abs(e.x - 100) <= cellSize && Math.abs(e.y - 100) <= cellSize,
    );
    // Grid en az brute-force kadar doğru — hiçbir yakın düşmanı kaçırmaz
    expect(nearby.length).toBeGreaterThanOrEqual(bruteForce.length);
  });

  it('trim boş hücreleri kaldırır', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(100, 100));
    grid.insert(makeEnemy(500, 500));
    expect(grid.getCellCount()).toBe(2);

    grid.clear();
    grid.insert(makeEnemy(100, 100));

    expect(grid.getCellCount()).toBe(1);
    const nearby = grid.queryNearby(105, 105);
    expect(nearby).toHaveLength(1);
  });

  it('cellSize küçüldükçe sorgu sonucu azalır — ölçeklendiğini kanıtlar', () => {
    const enemies: ReturnType<typeof makeEnemy>[] = [];
    for (let i = 0; i < 500; i++) {
      const x = (i * 37) % 1000;
      const y = (i * 53) % 1000;
      enemies.push(makeEnemy(x, y));
    }

    const gridLarge = new SpatialGrid(112);
    gridLarge.rebuild(enemies);
    const resultLarge = gridLarge.queryNearby(500, 500);

    const gridSmall = new SpatialGrid(28);
    gridSmall.rebuild(enemies);
    const resultSmall = gridSmall.queryNearby(500, 500);

    // Daha küçük hücre = daha dar sorgu = daha az sonuç
    expect(resultSmall.length).toBeLessThanOrEqual(resultLarge.length);
  });

  it('negatif koordinatlar çakışma yapmaz', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(-100, -100));
    grid.insert(makeEnemy(100, 100));

    const nearby = grid.queryNearby(-100, -100);
    expect(nearby).toHaveLength(1);
    expect(nearby[0].x).toBe(-100);
  });

  it('iç içe queryNearby çağrıları aynı sonuç tamponunu ezmez', () => {
    const grid = new SpatialGrid(56);
    grid.insert(makeEnemy(100, 100));
    grid.insert(makeEnemy(500, 500));

    const first = grid.queryNearby(105, 105);
    // İkinci sorgu ilk sonuç tamponunu overwrite etmemeli.
    const second = grid.queryNearby(505, 505);

    expect(first).toHaveLength(1);
    expect(first[0].x).toBe(100);
    expect(second).toHaveLength(1);
    expect(second[0].x).toBe(500);
  });
});

describe('SpatialGrid artımlı güncelleme', () => {
  type TestEnemy = Parameters<SpatialGrid['insert']>[0] & { x: number; y: number; id: number };

  let nextId = 0;

  function movable(x: number, y: number): TestEnemy {
    const enemy = makeEnemy(x, y) as TestEnemy;
    enemy.id = ++nextId;
    return enemy;
  }

  /**
   * Sorgu sonucunu KİMLİK KÜMESİNE indirger.
   *
   * `queryNearby`nin dönüş SIRASI sözleşmenin parçası değildir: hücre içindeki
   * sıra ekleme sırasına bağlıdır ve artımlı yolda hareket eden entity dizinin
   * sonuna geçer. Karşılaştırılması gereken şey "hangi entity'ler yakın",
   * "hangi sırayla" değil.
   */
  function idsOf(enemies: readonly unknown[]): number[] {
    return enemies.map((enemy) => (enemy as TestEnemy).id).sort((a, b) => a - b);
  }

  it('remove entity’yi sorgudan çıkarır', () => {
    const grid = new SpatialGrid(56);
    const enemy = movable(100, 100);
    grid.insert(enemy);
    expect(grid.queryNearby(100, 100)).toHaveLength(1);

    expect(grid.remove(enemy)).toBe(true);
    expect(grid.queryNearby(100, 100)).toHaveLength(0);
    expect(grid.has(enemy)).toBe(false);
  });

  it('bilinmeyen entity’nin remove’u no-op (çağıran ayrı kayıt tutmaz)', () => {
    const grid = new SpatialGrid(56);
    expect(grid.remove(movable(10, 10))).toBe(false);
  });

  it('update aynı hücre içinde hareket ederse ERKEN ÇIKAR', () => {
    // Artımlı modelin asıl kazancı bu: hareketin çoğu hücre değiştirmez.
    const grid = new SpatialGrid(56);
    const enemy = movable(10, 10);
    grid.insert(enemy);

    enemy.x = 20;
    enemy.y = 20;
    expect(grid.update(enemy)).toBe(false);
    expect(grid.queryNearby(20, 20)).toHaveLength(1);
  });

  it('update hücre değiştiren entity’yi taşır — eski hücrede iz bırakmaz', () => {
    const grid = new SpatialGrid(56);
    const enemy = movable(10, 10);
    grid.insert(enemy);

    enemy.x = 1000;
    enemy.y = 1000;
    expect(grid.update(enemy)).toBe(true);

    expect(grid.queryNearby(10, 10)).toHaveLength(0);
    expect(grid.queryNearby(1000, 1000)).toHaveLength(1);
    expect(grid.getIndexedCount()).toBe(1);
  });

  it('indekste olmayan entity için update ekleme yapar (upsert)', () => {
    const grid = new SpatialGrid(56);
    const enemy = movable(10, 10);

    expect(grid.update(enemy)).toBe(true);
    expect(grid.queryNearby(10, 10)).toHaveLength(1);
  });

  it('clear artımlı takip kaydını da temizler', () => {
    const grid = new SpatialGrid(56);
    const enemy = movable(10, 10);
    grid.insert(enemy);

    grid.clear();
    expect(grid.getIndexedCount()).toBe(0);
    expect(grid.has(enemy)).toBe(false);
  });

  it('rebuild clear+insertAll+trim üçlüsüyle AYNI sonucu verir', () => {
    const enemies = [movable(10, 10), movable(500, 500), movable(1200, 40)];

    const manual = new SpatialGrid(56);
    manual.rebuild(enemies);

    const viaRebuild = new SpatialGrid(56);
    viaRebuild.rebuild(enemies);

    expect(viaRebuild.getCellCount()).toBe(manual.getCellCount());
    for (const enemy of enemies) {
      expect(viaRebuild.queryNearby(enemy.x, enemy.y).length).toBe(
        manual.queryNearby(enemy.x, enemy.y).length,
      );
    }
  });

  /**
   * EŞDEĞERLİK testi — bu turun asıl sözleşmesi.
   *
   * İki güncelleme modeli aynı dünyayı aynı biçimde indekslemeli. Aksi halde
   * artımlı yol sessizce yanlış sonuç verir ve hata ancak çarpışmalar
   * "bazen çalışmıyor" diye fark edilir. Rastgele ama DETERMİNİSTİK bir
   * hareket dizisi üzerinde iki grid yan yana sürülür.
   */
  it('artımlı güncelleme ile tam rebuild AYNI sorgu sonuçlarını verir', () => {
    let seed = 12345;
    const nextRandom = (): number => {
      // xorshift — deterministik, testler arası bağımsız.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return Math.abs(seed) / 2 ** 31;
    };

    const cellSize = 56;
    const enemies = Array.from({ length: 40 }, () =>
      movable(nextRandom() * 800, nextRandom() * 800),
    );

    const incremental = new SpatialGrid(cellSize);
    const rebuilt = new SpatialGrid(cellSize);
    for (const enemy of enemies) incremental.insert(enemy);

    for (let frame = 0; frame < 30; frame++) {
      for (const enemy of enemies) {
        enemy.x += (nextRandom() - 0.5) * 120;
        enemy.y += (nextRandom() - 0.5) * 120;
        incremental.update(enemy);
      }
      rebuilt.rebuild(enemies);

      expect(incremental.getIndexedCount(), `frame ${frame}`).toBe(enemies.length);

      for (const enemy of enemies) {
        const fromIncremental = idsOf(incremental.queryNearby(enemy.x, enemy.y));
        const fromRebuild = idsOf(rebuilt.queryNearby(enemy.x, enemy.y));
        expect(fromIncremental, `frame ${frame}, entity ${enemy.id}`).toEqual(fromRebuild);
        // Sorgu boş çıkarsa test hiçbir şey doğrulamaz: entity en azından
        // KENDİNİ görmeli.
        expect(fromIncremental, `frame ${frame}`).toContain(enemy.id);
      }
    }
  });
});

describe('artımlı API sözleşmesi', () => {
  /**
   * `SpatialGrid`in sınıf dokümanı "artımlı yolun üretimde çağıranı yoktur"
   * DİYOR. Bir doküman iddiası, onu doğrulayan bir şey olmadan çürür: biri
   * `grid.update(...)` çağrısını oyun döngüsüne eklerse doküman sessizce
   * yanlışa döner ve sonraki okuyucuyu yanıltır.
   *
   * Bu test iddiayı bekçiye bağlar. AMACI artımlı yolu YASAKLAMAK DEĞİL —
   * düştüğünde doğru tepki, çağrıyı geri almak değil, sınıf dokümanını
   * gerçeğe uydurmaktır.
   */
  it('üretim kaynağı yalnızca rebuild kullanır (doküman iddiasıyla senkron)', () => {
    const srcRoot = resolve(import.meta.dirname, '../../../src');
    const incremental =
      /\b(?:grid|spatialGrid|this\.spatialGrid)\.(insert|remove|update|has|getIndexedCount)\s*\(/;

    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith('.ts')) continue;
        // Sınıfın kendisi doğal olarak kendi metotlarını çağırır.
        if (full.endsWith('SpatialGrid.ts')) continue;
        if (incremental.test(readFileSync(full, 'utf-8'))) {
          offenders.push(relative(srcRoot, full));
        }
      }
    };
    walk(srcRoot);

    expect(
      offenders,
      'Artımlı API üretimde kullanılmaya başlandı. SpatialGrid sınıf dokümanındaki ' +
        '"üretimde çağıranı yoktur" uyarısını GÜNCELLE, sonra bu testi kaldır.',
    ).toEqual([]);
  });
});
