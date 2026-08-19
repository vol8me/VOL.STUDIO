import type { Enemy } from '@/runtime/entity/Enemy';

/** Negatif hucre indekslerini pozitife tasiyan offset. */
const CELL_OFFSET = 1_000_000;
/** Anahtar adimi — offset'in iki kati olmali ki cy terimi cx hanesine tasmasin. */
const CELL_STRIDE = CELL_OFFSET * 2;

/**
 * Hücre bazlı spatial partitioning — çarpışma kontrolünü O(N·M)'den O(N·k)'ya
 * düşürür. Numeric key ve reusable buffer ile sıfır allocation çalışır.
 *
 * **İki güncelleme modeli vardır ve bu ayrım bilinçlidir:**
 *
 * 1. `rebuild(entities)` — tüm dünyayı yeniden indeksler, O(N). VOL.HELL bunu
 *    kullanır: birkaç yüz düşmanla maliyeti ölçülemez ve kodu basit tutar
 *    (hangi entity'nin kimin elinde hareket ettiğini takip etmek gerekmez).
 * 2. `insert`/`remove`/`update` — yalnızca DEĞİŞEN entity'ye dokunur. Hareket
 *    eden entity sayısı toplamın küçük bir kısmıysa (binlerce duran yapı, az
 *    sayıda hareketli birim) bu model O(hareket eden)'e düşer.
 *
 * `rebuild()` bir KOLAYLIK metodudur, ana model değil. Bu sınıf ileride CORE'a
 * taşınırsa jenerik API `insert/remove/update/query` çevresinde kurulmalı;
 * "her frame her şeyi yeniden indeksle" varsayımını framework'e gömmek, ikinci
 * bir tüketiciyi (binlerce entity taşıyan bir oyun) baştan cezalandırır.
 *
 * Şu an CORE'da DEĞİLDİR ve ikinci somut tüketici çıkmadan taşınmayacaktır
 * (bkz. TODO.md — CORE capability yol haritası ertelemeleri).
 *
 * ---
 *
 * **DİKKAT — artımlı yolun ÜRETİMDE ÇAĞIRANI YOKTUR.** `insert`, `remove`,
 * `update`, `has` ve `getIndexedCount` yalnızca testlerden çağrılır; oyun
 * döngüsü (`GameScene.updateEntities`) iki kez `rebuild()` der. Yani bu yol
 * gerçek oynanışta hiç yürümez ve yalnızca `SpatialGrid.test.ts`'teki
 * eşdeğerlik testiyle korunur.
 *
 * Bu bilinçli bir durum, unutulmuş bir iş değil: artımlı modeli oyun döngüsüne
 * bağlamak `EnemyManager`'ın her hareket eden düşmanı bildirmesini gerektirir
 * ve bugünkü ölçekte ölçülebilir bir kazanç vermez — kanıtsız karmaşıklık
 * olurdu. API, tasarım kararını KAYIT ALTINA ALMAK ve ikinci tüketici geldiğinde
 * hazır olmak için yazıldı.
 *
 * Buraya dokunacak olan için sonuç şu: artımlı yolu bozan bir değişiklik
 * OYUNU BOZMAZ, yalnızca testi düşürür. Testi "alakasız" diye zayıflatma —
 * bu yolun tek koruması odur.
 */
export class SpatialGrid {
  private cellSize: number;
  private cells: Map<number, Enemy[]> = new Map();
  /**
   * Entity → içinde bulunduğu hücre anahtarı. Yalnızca artımlı yol için
   * tutulur: `remove`/`update`, entity'nin ESKİ hücresini bulmak zorunda ve
   * pozisyonundan hesaplamak güvenilmez (entity o pozisyondan çoktan taşınmış
   * olabilir — `update` tam olarak bu durumda çağrılır).
   */
  private readonly cellOf = new Map<Enemy, number>();
  /**
   * Reusable sonuç tamponları — iç içe `queryNearby` çağrılarında birbirinin
   * üzerine yazmaz. 4'lik halka oyun mantığında görülebilecek maksimum iç
   * içe çağrıyı karşılar; aşılırsa en eski tampon geri döndürülür.
   */
  private readonly resultBuffers: Enemy[][] = [[], [], [], []];
  private resultIndex = 0;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  /**
   * Numeric key — string allocation yok. cx/cy negatif olabildigi icin offset
   * eklenir; carpan offset'in IKI KATI olmak zorunda.
   *
   * Onceki hali `(cx + OFFSET) * OFFSET + (cy + OFFSET)` idi: cy >= 0 iken
   * ikinci terim OFFSET'i asip cx hanesine tasiyordu, yani
   * `key(cx, cy) === key(cx + 1, cy - OFFSET)`. Oyun alani sinirli oldugu icin
   * pratikte ulasilmazdi ama formul yanlisti.
   */
  private key(cx: number, cy: number): number {
    return (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET);
  }

  /** Hücre dizilerini yeniden tahsis etmeden temizler; sonraki insert eski dizileri kullanır. */
  clear(): void {
    for (const cell of this.cells.values()) {
      cell.length = 0;
    }
    this.cellOf.clear();
  }

  /** Entity'nin ŞU ANKİ pozisyonuna karşılık gelen hücre anahtarı. */
  private cellKeyFor(enemy: Enemy): number {
    return this.key(Math.floor(enemy.x / this.cellSize), Math.floor(enemy.y / this.cellSize));
  }

  insert(enemy: Enemy): void {
    const k = this.cellKeyFor(enemy);
    let cell = this.cells.get(k);
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    cell.push(enemy);
    this.cellOf.set(enemy, k);
  }

  /**
   * Entity'yi indeksten çıkarır. Bilinmeyen bir entity için no-op döner
   * (`false`) — çağıranın "indekste miydi?" diye ayrıca kayıt tutması gerekmez.
   */
  remove(enemy: Enemy): boolean {
    const k = this.cellOf.get(enemy);
    if (k === undefined) return false;

    const cell = this.cells.get(k);
    if (cell) {
      const index = cell.indexOf(enemy);
      if (index >= 0) cell.splice(index, 1);
    }
    this.cellOf.delete(enemy);
    return true;
  }

  /**
   * Hareket etmiş bir entity'nin hücresini tazeler.
   *
   * Hücre DEĞİŞMEDİYSE hiçbir şey yapılmaz — hareketin çoğu aynı hücre içinde
   * kalır, bu yüzden erken çıkış artımlı modelin asıl kazancıdır.
   *
   * @returns Entity gerçekten hücre değiştirdiyse `true`.
   */
  update(enemy: Enemy): boolean {
    const previous = this.cellOf.get(enemy);
    if (previous === undefined) {
      // Henüz indekste değil: ekle. `update`i "upsert" gibi kullanmak
      // çağıranın ekleme/güncelleme ayrımını takip etmesini gereksiz kılar.
      this.insert(enemy);
      return true;
    }

    const next = this.cellKeyFor(enemy);
    if (next === previous) return false;

    this.remove(enemy);
    this.insert(enemy);
    return true;
  }

  /** Entity indekste mi? */
  has(enemy: Enemy): boolean {
    return this.cellOf.has(enemy);
  }

  insertAll(enemies: readonly Enemy[]): void {
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      this.insert(enemy);
    }
  }

  /**
   * Tüm dünyayı yeniden indeksler — KOLAYLIK metodu (bkz. sınıf JSDoc'u).
   *
   * `clear` + `insertAll` + `trim` üçlüsünü tek çağrıda toplar; çağıranların
   * bu üçlüyü elle ve doğru sırada tekrarlaması, `trim`i unutmaya açıktı.
   */
  rebuild(enemies: readonly Enemy[]): void {
    this.clear();
    this.insertAll(enemies);
    this.trim();
  }

  /** Aktif hücre sayısını döndürür — diagnostic amaçlı. */
  getCellCount(): number {
    return this.cells.size;
  }

  /**
   * Boş kalan hücreleri kaldırır — `insertAll` sonrası çağrılır.
   * Böylece haritada düşmanı olmayan eski hücreler birikmez.
   */
  trim(): void {
    for (const [key, cell] of this.cells) {
      if (cell.length === 0) {
        this.cells.delete(key);
      }
    }
  }

  /** İndeksteki entity sayısı — artımlı yolun tutarlılığını doğrulamak için. */
  getIndexedCount(): number {
    return this.cellOf.size;
  }

  /**
   * Verilen pozisyona yakın düşmanları döndürür — kendi hücresi + 8 komşu hücre.
   * Ölü düşmanlar filtrelenir. Dönen array reusable'dır; halka tampon sayesinde
   * sınırlı iç içe çağrılarda birbirinin üzerine yazılmaz.
   */
  queryNearby(x: number, y: number): Enemy[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const result = this.resultBuffers[this.resultIndex];
    this.resultIndex = (this.resultIndex + 1) % this.resultBuffers.length;
    result.length = 0;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.cells.get(this.key(cx + dx, cy + dy));
        if (!cell) continue;
        for (const enemy of cell) {
          if (enemy.isAlive) result.push(enemy);
        }
      }
    }

    return result;
  }
}
