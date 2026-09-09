import { describe, expect, it } from 'vitest';
import { SpatialIndex } from '../../src/spatial/SpatialIndex';
import { createRandom } from '../../src/random/random';

interface Unit {
  id: number;
  x: number;
  y: number;
  alive: boolean;
}

/**
 * İKİ GÜNCELLEME YOLUNUN DAVRANIŞ EŞİTLİĞİ.
 *
 * `SpatialIndex` iki modeli birden sunar ve ürün ikisini de kullanır:
 * `VolHellSimulation` artımlı yolu (`insert`/`update`/`remove`), Phaser
 * `GameScene` ise her kare `rebuild()` çağırır. İkisi aynı soruya aynı cevabı
 * vermezse, headless simülasyonda doğrulanan bir davranış sahnede başka türlü
 * çalışır ve fark yalnız oynarken görülür.
 *
 * Test bir DENKLİK iddiasıdır: aynı doğum/hareket/ölüm dizisinden sonra iki
 * indeks, her sorgu noktası için AYNI komşu kümesini vermelidir. Sıra önemli
 * değildir (sorgu sırası belgede garanti edilmez), küme önemlidir.
 */
function neighbourIds(index: SpatialIndex<Unit>, x: number, y: number): number[] {
  const found: Unit[] = [];
  index.queryInto(found, x, y);
  return found.map((unit) => unit.id).sort((a, b) => a - b);
}

const CELL = 64;
const PROBES = [
  { x: 0, y: 0 },
  { x: 120, y: 80 },
  { x: -200, y: 340 },
  { x: 512, y: -128 },
  { x: 999, y: 999 },
];

describe('SpatialIndex — rebuild ile artımlı yol', () => {
  it('aynı işlem dizisinde AYNI komşu kümesini verir', () => {
    const random = createRandom(0xc0ffee);
    const rebuilt = new SpatialIndex<Unit>(CELL);
    const incremental = new SpatialIndex<Unit>(CELL);
    const units: Unit[] = [];
    let nextId = 1;

    for (let step = 0; step < 240; step++) {
      // DOĞUM
      if (random.next() < 0.35) {
        const unit: Unit = {
          id: nextId++,
          x: random.bipolar() * 600,
          y: random.bipolar() * 600,
          alive: true,
        };
        units.push(unit);
        incremental.insert(unit);
      }

      // HAREKET — canlıların bir kısmı yer değiştirir.
      for (const unit of units) {
        if (!unit.alive || random.next() > 0.5) continue;
        unit.x += random.bipolar() * 40;
        unit.y += random.bipolar() * 40;
        incremental.update(unit);
      }

      // ÖLÜM — listeden tamamen düşen varlık.
      if (units.length > 4 && random.next() < 0.2) {
        const victim = units[Math.floor(random.next() * units.length)];
        if (victim.alive) {
          victim.alive = false;
          incremental.remove(victim);
        }
      }

      const living = units.filter((unit) => unit.alive);
      rebuilt.rebuild(living);

      for (const probe of PROBES) {
        expect(
          neighbourIds(incremental, probe.x, probe.y),
          `adım ${step}, sorgu (${probe.x},${probe.y})`,
        ).toEqual(neighbourIds(rebuilt, probe.x, probe.y));
      }
    }

    // Dizinin gerçekten yük ürettiğini doğrula; boş bir koşu denklik kanıtlamaz.
    expect(units.filter((unit) => unit.alive).length).toBeGreaterThan(5);
    expect(units.filter((unit) => !unit.alive).length).toBeGreaterThan(0);
  });

  /*
   * Artımlı yolun bilinen tuzağı: listeden düşen bir varlık `remove()`
   * çağrılmazsa indekste KALIR. Bu testin görevi tuzağın hâlâ tuzak olduğunu
   * göstermek — yani denklik testinin bir şey ölçtüğünü kanıtlamak.
   */
  it('remove ATLANIRSA iki yol ayrışır', () => {
    const rebuilt = new SpatialIndex<Unit>(CELL);
    const incremental = new SpatialIndex<Unit>(CELL);
    const unit: Unit = { id: 1, x: 10, y: 10, alive: true };

    incremental.insert(unit);
    unit.alive = false;
    rebuilt.rebuild([]);

    expect(neighbourIds(rebuilt, 10, 10)).toEqual([]);
    expect(neighbourIds(incremental, 10, 10)).toEqual([1]);
  });

  /* Hareket eden varlık `update()` almazsa ESKİ hücresinde kalır. */
  it('update ATLANIRSA iki yol ayrışır', () => {
    const rebuilt = new SpatialIndex<Unit>(CELL);
    const incremental = new SpatialIndex<Unit>(CELL);
    const unit: Unit = { id: 1, x: 10, y: 10, alive: true };

    incremental.insert(unit);
    unit.x = 400;
    rebuilt.rebuild([unit]);

    expect(neighbourIds(rebuilt, 400, 10)).toEqual([1]);
    expect(neighbourIds(incremental, 400, 10)).toEqual([]);
  });
});
