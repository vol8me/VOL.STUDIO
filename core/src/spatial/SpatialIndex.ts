/** Uzamsal indekse girebilecek en az koşul: bir konum. */
export interface SpatialEntity {
  x: number;
  y: number;
}

/** Negatif hücre indekslerini pozitife taşıyan offset. */
const CELL_OFFSET = 1_000_000;
/** Anahtar adımı — offset'in İKİ KATI olmalı ki cy terimi cx hanesine taşmasın. */
const CELL_STRIDE = CELL_OFFSET * 2;

/**
 * Hücre bazlı uzamsal indeks — "yakınımda ne var?" sorusunu O(N)'den O(k)'ya
 * düşürür: çarpışma, en yakın komşu, etki alanı, ayrım kuvveti.
 *
 * **İki güncelleme modeli vardır ve ayrım bilinçlidir:**
 *
 * 1. `rebuild(entities)` — tüm dünyayı yeniden indeksler, O(N). Birkaç yüz
 *    varlıkla maliyeti ölçülemez ve kodu basit tutar: hangi varlığın kimin
 *    elinde hareket ettiğini takip etmek gerekmez.
 * 2. `insert`/`remove`/`update` — yalnızca DEĞİŞEN varlığa dokunur. Hareket
 *    eden varlık sayısı toplamın küçük bir kısmıysa (binlerce sabit nesne,
 *    az sayıda hareketli birim) bu model O(hareket eden)'e düşer.
 *
 * `rebuild()` bir KOLAYLIK metodudur, ana model değil. "Her frame her şeyi
 * yeniden indeksle" varsayımını API'ye gömmek, binlerce varlık taşıyan bir
 * tüketiciyi baştan cezalandırırdı.
 *
 * Numeric key ve yeniden kullanılan sonuç tamponlarıyla sorgu başına sıfır
 * allocation çalışır.
 */
export class SpatialIndex<T extends SpatialEntity> {
  private readonly cells = new Map<number, T[]>();
  /** Varlık → içinde bulunduğu hücre anahtarı; artımlı güncelleme için. */
  private readonly cellOf = new Map<T, number>();
  /**
   * Yeniden kullanılan sonuç tamponları — iç içe `query` çağrılarında
   * birbirinin üzerine yazmaz. 4'lük halka, oyun mantığında görülebilecek
   * azami iç içe çağrıyı karşılar.
   */
  private readonly resultBuffers: T[][] = [[], [], [], []];
  private resultIndex = 0;

  /**
   * @param cellSize Hücre kenarı. Sorgu yarıçapına yakın seçilmelidir: çok
   *   küçükse çok hücre taranır, çok büyükse hücre başına çok varlık düşer.
   * @param isActive Verilirse `false` dönen varlıklar sorgu sonucundan
   *   çıkarılır — ölü/pasif varlığı indeksten silmeden atlamak için.
   */
  constructor(
    private readonly cellSize: number,
    private readonly isActive?: (entity: T) => boolean,
  ) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new Error(`SpatialIndex: cellSize pozitif olmalı (gelen: ${cellSize})`);
    }
  }

  /**
   * Numeric key — string allocation yok. cx/cy negatif olabildiği için offset
   * eklenir; çarpan offset'in İKİ KATI olmak zorunda, aksi halde cy terimi
   * cx hanesine taşar ve `key(cx, cy) === key(cx + 1, cy - OFFSET)` olur.
   */
  private key(cx: number, cy: number): number {
    return (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET);
  }

  private cellKeyFor(entity: T): number {
    return this.key(Math.floor(entity.x / this.cellSize), Math.floor(entity.y / this.cellSize));
  }

  /** Varlığı mevcut konumuna göre ekler. Zaten varsa konumu tazelenir. */
  insert(entity: T): void {
    const existing = this.cellOf.get(entity);
    const target = this.cellKeyFor(entity);
    if (existing === target) return;
    if (existing !== undefined) this.removeFromCell(entity, existing);

    let cell = this.cells.get(target);
    if (!cell) {
      cell = [];
      this.cells.set(target, cell);
    }
    cell.push(entity);
    this.cellOf.set(entity, target);
  }

  /** Varlığı indeksten çıkarır. Kayıtlı değilse `false`. */
  remove(entity: T): boolean {
    const cellKey = this.cellOf.get(entity);
    if (cellKey === undefined) return false;
    this.removeFromCell(entity, cellKey);
    this.cellOf.delete(entity);
    return true;
  }

  /**
   * Hareket etmiş bir varlığın hücresini tazeler.
   *
   * Kayıtlı değilse EKLER (upsert): "indekste olduğundan emin ol ve
   * konumunu tazele" tek bir çağrıyla ifade edilir; çağıranın her karede
   * `has()` ile ön kontrol yapması gerekmez.
   *
   * @returns İndeks bu çağrı sonucu DEĞİŞTİ mi. Hücre aynı kaldıysa `false`
   *   döner ve hiçbir iş yapılmaz — hareketli varlıkların çoğu karede aynı
   *   hücrede kalır, bu erken çıkış artımlı modelin asıl kazancıdır. Dönüş
   *   değeri tek bir anlam taşır ("indeks değişti mi?"), üyelik sorgusu için
   *   `has()` vardır.
   */
  update(entity: T): boolean {
    const existing = this.cellOf.get(entity);
    if (existing !== undefined && existing === this.cellKeyFor(entity)) return false;
    this.insert(entity);
    return true;
  }

  has(entity: T): boolean {
    return this.cellOf.has(entity);
  }

  /**
   * İndeksi verilen kümeyle sıfırdan kurar — kolaylık metodu.
   * Artımlı güncelleme takip etmek istemeyen tüketici her karede bunu çağırır.
   */
  rebuild(entities: Iterable<T>): void {
    this.clear();
    for (const entity of entities) {
      if (this.isActive && !this.isActive(entity)) continue;
      this.insert(entity);
    }
  }

  /** Tüm kayıtları siler. */
  clear(): void {
    this.cells.clear();
    this.cellOf.clear();
  }

  /** İndekslenmiş varlık sayısı. */
  get size(): number {
    return this.cellOf.size;
  }

  /** Dolu hücre sayısı — teşhis için. */
  getCellCount(): number {
    return this.cells.size;
  }

  /**
   * Verilen noktanın hücresi + 8 komşu hücredeki varlıklar.
   *
   * **SÖZLEŞME:** yalnızca arama yarıçapı `cellSize`'ı AŞMADIĞINDA eksiksizdir.
   * 3×3 hücrelik pencere `cellSize` kadar uzağı garanti eder; daha uzaktaki
   * bir varlık pencerenin dışında kalır ve SESSİZCE bulunamaz. Daha geniş bir
   * arama için `queryRadius`/`queryBounds` kullanılmalıdır — onlar gereken
   * kadar hücre tarar.
   *
   * Dönen dizi YENİDEN KULLANILIR: bir sonraki sorguya kadar geçerlidir,
   * saklanacaksa kopyalanmalıdır.
   */
  query(x: number, y: number): readonly T[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const result = this.nextBuffer();

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.cells.get(this.key(cx + dx, cy + dy));
        if (!cell) continue;
        for (const entity of cell) {
          if (this.isActive && !this.isActive(entity)) continue;
          result.push(entity);
        }
      }
    }

    return result;
  }

  /**
   * Verilen yarıçap içindeki varlıklar — yarıçap `cellSize`'dan büyük olsa da
   * DOĞRU sonuç verir.
   *
   * `query()` sabit 3×3 pencere tarar ve `cellSize`'ı aşan bir aramada
   * uzaktaki varlıkları sessizce kaçırır; bu, ölçü değiştiğinde (menzil artıran
   * bir etki, farklı bir birim tipi) ortaya çıkan ve fark edilmesi çok zor bir
   * hata biçimidir. Burada taranacak hücre sayısı yarıçaptan HESAPLANIR.
   *
   * Sonuç yarıçapa göre de FİLTRELENİR: hücre penceresi kare, arama alanı
   * dairedir; filtrelemeden köşelerdeki varlıklar da dönerdi.
   */
  queryRadius(x: number, y: number, radius: number): readonly T[] {
    const result = this.nextBuffer();
    if (!(radius > 0) || !Number.isFinite(radius)) return result;

    const span = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const radiusSq = radius * radius;

    for (let dx = -span; dx <= span; dx++) {
      for (let dy = -span; dy <= span; dy++) {
        const cell = this.cells.get(this.key(cx + dx, cy + dy));
        if (!cell) continue;
        for (const entity of cell) {
          if (this.isActive && !this.isActive(entity)) continue;
          const ex = entity.x - x;
          const ey = entity.y - y;
          if (ex * ex + ey * ey <= radiusSq) result.push(entity);
        }
      }
    }
    return result;
  }

  /**
   * Eksen hizalı bir dikdörtgen içindeki varlıklar — seçim kutusu, görünür
   * alan kırpma, bölge etkisi.
   *
   * Dikdörtgen sol-üst köşe + boyut ile verilir; negatif genişlik/yükseklik
   * normalize edilir (sürükleyerek çizilen seçim kutusu her yöne açılabilir).
   */
  queryBounds(x: number, y: number, width: number, height: number): readonly T[] {
    const result = this.nextBuffer();
    if (!Number.isFinite(width) || !Number.isFinite(height)) return result;

    const minX = Math.min(x, x + width);
    const maxX = Math.max(x, x + width);
    const minY = Math.min(y, y + height);
    const maxY = Math.max(y, y + height);

    const minCol = Math.floor(minX / this.cellSize);
    const maxCol = Math.floor(maxX / this.cellSize);
    const minRow = Math.floor(minY / this.cellSize);
    const maxRow = Math.floor(maxY / this.cellSize);

    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const cell = this.cells.get(this.key(col, row));
        if (!cell) continue;
        for (const entity of cell) {
          if (this.isActive && !this.isActive(entity)) continue;
          if (entity.x < minX || entity.x > maxX || entity.y < minY || entity.y > maxY) continue;
          result.push(entity);
        }
      }
    }
    return result;
  }

  /**
   * Verilen noktaya EN YAKIN varlık — yarıçap içinde arar.
   *
   * `queryRadius` sonucunu tarayarak bulur; ayrı bir tarama yapmaz, böylece
   * çağıranın "en yakını" bulmak için sonucu tekrar gezmesi gerekmez.
   */
  findNearest(x: number, y: number, radius: number, exclude?: T): T | null {
    let best: T | null = null;
    let bestSq = Infinity;

    for (const entity of this.queryRadius(x, y, radius)) {
      if (entity === exclude) continue;
      const ex = entity.x - x;
      const ey = entity.y - y;
      const distSq = ex * ex + ey * ey;
      if (distSq < bestSq) {
        bestSq = distSq;
        best = entity;
      }
    }
    return best;
  }

  /** Sıradaki yeniden kullanılabilir tampon — iç içe sorgular çakışmasın diye. */
  private nextBuffer(): T[] {
    const result = this.resultBuffers[this.resultIndex];
    this.resultIndex = (this.resultIndex + 1) % this.resultBuffers.length;
    result.length = 0;
    return result;
  }

  private removeFromCell(entity: T, cellKey: number): void {
    const cell = this.cells.get(cellKey);
    if (!cell) return;
    const index = cell.indexOf(entity);
    if (index >= 0) cell.splice(index, 1);
    if (cell.length === 0) this.cells.delete(cellKey);
  }
}
