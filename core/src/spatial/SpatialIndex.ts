import { requireFinite } from '../math/numeric';

/** Uzamsal indekse girebilecek en az koşul: bir konum. */
export interface SpatialEntity {
  x: number;
  y: number;
}

interface SpatialCell<T> {
  readonly column: number;
  readonly row: number;
  readonly entities: T[];
}

/**
 * Hücre bazlı uzamsal indeks — "yakınımda ne var?" sorusunu O(N)'den O(k)'ya
 * düşürür. Sorgu başına sıfır allocation çalışır (iki boyutlu hücre kaydı + yeniden
 * kullanılan sonuç tamponları).
 *
 * **İki güncelleme modeli vardır ve ayrım bilinçlidir:**
 *
 * 1. `rebuild(entities)` — tüm dünyayı yeniden indeksler, O(N). Birkaç yüz
 *    varlıkta maliyeti ölçülemez ve hangi varlığın kimin elinde hareket
 *    ettiğini takip etmeyi gerektirmez.
 * 2. `insert`/`remove`/`update` — yalnız DEĞİŞEN varlığa dokunur, yani
 *    O(hareket eden). Binlerce sabit nesne + az hareketli birimde bu kazanır.
 *
 * `rebuild()` bir KOLAYLIKTIR, ana model değil: "her frame her şeyi yeniden
 * indeksle" varsayımını API'ye gömmek binlerce varlıklı tüketiciyi baştan
 * cezalandırırdı.
 */
export class SpatialIndex<T extends SpatialEntity> {
  private readonly cells = new Map<number, Map<number, SpatialCell<T>>>();
  private cellCount = 0;
  /** Varlık → içinde bulunduğu hücre; artımlı güncelleme için. */
  private readonly cellOf = new Map<T, SpatialCell<T>>();
  /**
   * Yeniden kullanılan sonuç tamponları — iç içe `query` çağrılarında
   * birbirinin üzerine yazmaz. 4'lük halka, oyun mantığında görülebilecek
   * azami iç içe çağrıyı karşılar. 5 ve üzeri iç içe sorguda en eski tampon
   * overwrite edilir; çağıran tamponu kullanım süresi boyunca tutuyorsa
   * sonuç bozulur.
   */
  private readonly resultBuffers: T[][] = [[], [], [], []];
  /**
   * Her tamponun hangi sorguya ait olduğunu tutan devir damgası.
   *
   * Halka DÖRT tampon taşır: aynı anda saklanan beşinci sorgu birincinin
   * verisini üzerine yazar ve kendiliğinden hiçbir hata çıkmaz.
   * Damga, `assertQueryValid` ile bu bozulmayı gürültülü hâle getirir;
   * sonucu saklaması gereken çağıran ise `queryInto()` ile kendi dizisini
   * verir ve halkaya hiç girmez.
   */
  private readonly bufferStamps: number[] = [0, 0, 0, 0];
  private resultIndex = 0;
  private queryCounter = 0;
  /** Son sorgunun damgası — `queryStamp()` bunu döner. */
  private lastStamp = 0;

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
    requireFinite(cellSize, 'SpatialIndex cellSize');
    if (cellSize <= 0) {
      throw new Error(`SpatialIndex: cellSize pozitif olmalı (gelen: ${cellSize})`);
    }
  }

  private coordinate(value: number): number {
    if (!Number.isFinite(value)) throw new RangeError('SpatialIndex: konum sonlu olmalı');
    const cell = Math.floor(value / this.cellSize);
    this.requireCell(cell);
    return cell;
  }

  private requireCell(cell: number): void {
    if (!Number.isSafeInteger(cell)) {
      throw new RangeError('SpatialIndex: hücre koordinatı güvenli bir tamsayı olmalı');
    }
  }

  /**
   * Varlığı mevcut konumuna göre ekler. Zaten varsa konumu tazelenir.
   *
   * Sonlu olmayan konum REDDEDİLİR (atar). Kabul edilseydi varlık `size`'a
   * sayılır ama hiçbir hücreye düşmediği için hiçbir sorgu onu bulamazdı.
   */
  insert(entity: T): void {
    const column = this.coordinate(entity.x);
    const row = this.coordinate(entity.y);
    const existing = this.cellOf.get(entity);
    if (existing?.column === column && existing.row === row) return;
    if (existing) this.removeFromCell(entity, existing);

    let rows = this.cells.get(column);
    if (!rows) {
      rows = new Map();
      this.cells.set(column, rows);
    }
    let cell = rows.get(row);
    if (!cell) {
      cell = { column, row, entities: [] };
      rows.set(row, cell);
      this.cellCount++;
    }
    cell.entities.push(entity);
    this.cellOf.set(entity, cell);
  }

  /** Varlığı indeksten çıkarır. Kayıtlı değilse `false`. */
  remove(entity: T): boolean {
    const cell = this.cellOf.get(entity);
    if (cell === undefined) return false;
    this.removeFromCell(entity, cell);
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
    const column = this.coordinate(entity.x);
    const row = this.coordinate(entity.y);
    if (existing?.column === column && existing.row === row) return false;
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

  /**
   * Zaten indekste olan bir kümenin KONUMLARINI tazeler — `rebuild`in artımlı
   * kardeşi.
   *
   * `rebuild` her çağrıda indeksi boşaltıp her varlığı yeniden ekler: hücre
   * dizileri yeniden ayrılır ve maliyet hareket etmemiş varlıklara da yüklenir.
   * Bir simülasyon adımında varlık KÜMESİ değişmeyip yalnız konumlar
   * kayıyorsa (tipik olarak "hareket ettir, sonra çarpışmayı çöz" sırası)
   * doğru araç budur: `update()` hücre değişmediğinde hiçbir iş yapmaz, yani
   * maliyet O(N) yerine O(hücre değiştiren) olur.
   *
   * Pasif varlıklar indeksten ÇIKARILIR; `isActive` zaten sorguları
   * filtreliyor olsa da ölü varlığı hücrede tutmak taramayı gereksiz uzatır.
   *
   * Küme değiştiyse (yeni varlık doğduysa) `update()` upsert olduğu için yeni
   * gelenler de girer; yalnızca listeden TAMAMEN düşen bir varlık indekste
   * kalır — bu durumda çağıran `rebuild` kullanmalıdır.
   */
  refresh(entities: Iterable<T>): void {
    for (const entity of entities) {
      if (this.isActive && !this.isActive(entity)) {
        this.remove(entity);
        continue;
      }
      this.update(entity);
    }
  }

  /** Tüm kayıtları siler. */
  clear(): void {
    this.cells.clear();
    this.cellOf.clear();
    this.cellCount = 0;
  }

  /** İndekslenmiş varlık sayısı. */
  get size(): number {
    return this.cellOf.size;
  }

  /** Dolu hücre sayısı — teşhis için. */
  getCellCount(): number {
    return this.cellCount;
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
   * saklanacaksa kopyalanmalıdır. Sonlu konum ve güvenli tamsayı hücre
   * aralığı gerekir; geçersiz sorgu `RangeError` verir.
   */
  query(x: number, y: number): readonly T[] {
    this.validateWindow(x, y, 1);
    const result = this.nextBuffer();
    this.collectCells(result, x, y, 1);
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
   * dairedir; filtrelemeden köşelerdeki varlıklar da dönerdi. Sıfır yarıçap
   * boş sonuçtur; negatif veya sonlu olmayan yarıçap reddedilir.
   */
  queryRadius(x: number, y: number, radius: number): readonly T[] {
    const span = this.radiusSpan(x, y, radius);
    const result = this.nextBuffer();
    if (radius > 0) this.collectCells(result, x, y, span, radius);
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
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new RangeError('SpatialIndex: boyutlar sonlu olmalı');
    }
    const minX = Math.min(x, x + width);
    const maxX = Math.max(x, x + width);
    const minY = Math.min(y, y + height);
    const maxY = Math.max(y, y + height);
    const minCol = this.coordinate(minX);
    const maxCol = this.coordinate(maxX);
    const minRow = this.coordinate(minY);
    const maxRow = this.coordinate(maxY);
    const result = this.nextBuffer();
    this.collectRange(result, minCol, maxCol, minRow, maxRow);
    let count = 0;
    for (const entity of result) {
      if (entity.x < minX || entity.x > maxX || entity.y < minY || entity.y > maxY) continue;
      result[count++] = entity;
    }
    result.length = count;
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

  /** Sıradaki yeniden kullanılabilir tampon — ardışık sorgular çakışmasın diye. */
  private nextBuffer(): T[] {
    const slot = this.resultIndex;
    const result = this.resultBuffers[slot];
    this.resultIndex = (this.resultIndex + 1) % this.resultBuffers.length;
    this.lastStamp = ++this.queryCounter;
    this.bufferStamps[slot] = this.lastStamp;
    result.length = 0;
    return result;
  }

  /**
   * Bir sorgu sonucunun HÂLÂ GEÇERLİ olduğunu doğrular.
   *
   * Halka tampon 4 sorguda bir başa döner; arada saklanan bir sonuç sessizce
   * başka bir sorgunun verisine dönüşür. Uzun ömürlü bir sonuç tutan kod,
   * kullanmadan önce bunu çağırarak bozulmayı GÜRÜLTÜLÜ hâle getirebilir.
   *
   * Sonucu gerçekten saklamak gerekiyorsa doğru çözüm `queryInto()` ya da
   * `[...result]` kopyasıdır; bu metot bir teşhis aracıdır, çözüm değil.
   *
   * @param stamp `queryStamp()` ile alınan damga.
   */
  assertQueryValid(stamp: number): void {
    if (!this.bufferStamps.includes(stamp)) {
      throw new Error(
        'SpatialIndex: sorgu sonucu geçersiz — halka tampon devretti. ' +
          'Sonucu saklamak için queryInto() kullan ya da kopyala.',
      );
    }
  }

  /** Son sorgunun damgası; `assertQueryValid` ile birlikte kullanılır. */
  queryStamp(): number {
    return this.lastStamp;
  }

  /**
   * `query` ile aynı, ama sonucu ÇAĞIRANIN dizisine yazar — halka tampona
   * hiç dokunmaz, dolayısıyla süresiz saklanabilir.
   *
   * Dizi önce temizlenir ve geri döndürülür (zincirleme kullanım için).
   */
  queryInto(out: T[], x: number, y: number): T[] {
    this.validateWindow(x, y, 1);
    out.length = 0;
    this.collectCells(out, x, y, 1);
    return out;
  }

  /** `queryRadius` ile aynı, sonucu çağıranın dizisine yazar. */
  queryRadiusInto(out: T[], x: number, y: number, radius: number): T[] {
    const span = this.radiusSpan(x, y, radius);
    out.length = 0;
    if (radius > 0) this.collectCells(out, x, y, span, radius);
    return out;
  }

  private radiusSpan(x: number, y: number, radius: number): number {
    if (!Number.isFinite(radius) || radius < 0) {
      throw new RangeError('SpatialIndex: yarıçap sonlu ve negatif olmayan bir sayı olmalı');
    }
    const span = Math.ceil(radius / this.cellSize);
    this.validateWindow(x, y, span);
    return span;
  }

  private validateWindow(x: number, y: number, span: number): void {
    const column = this.coordinate(x);
    const row = this.coordinate(y);
    this.requireCell(column - span);
    this.requireCell(column + span);
    this.requireCell(row - span);
    this.requireCell(row + span);
  }

  private collectCells(out: T[], x: number, y: number, span: number, radius?: number): void {
    const column = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    const start = out.length;
    this.collectRange(out, column - span, column + span, row - span, row + span);
    if (radius === undefined) return;
    const radiusSq = radius * radius;
    let count = start;
    for (let i = start; i < out.length; i++) {
      const entity = out[i];
      const dx = entity.x - x;
      const dy = entity.y - y;
      const inside = Number.isFinite(radiusSq)
        ? dx * dx + dy * dy <= radiusSq
        : Math.hypot(dx, dy) <= radius;
      if (inside) out[count++] = entity;
    }
    out.length = count;
  }

  private collectRange(
    out: T[],
    minCol: number,
    maxCol: number,
    minRow: number,
    maxRow: number,
  ): void {
    const area = (maxCol - minCol + 1) * (maxRow - minRow + 1);
    // Seyrek ve geniş alan, boş hücre sayısına bağlı sınırsız tarama yapmaz.
    if (area > Math.max(1024, this.cellCount * 4)) {
      for (const rows of this.cells.values()) {
        for (const cell of rows.values()) {
          if (cell.column < minCol || cell.column > maxCol) continue;
          if (cell.row >= minRow && cell.row <= maxRow) this.collectCell(out, cell);
        }
      }
      return;
    }
    for (let column = minCol; column <= maxCol; column++) {
      const rows = this.cells.get(column);
      if (!rows) continue;
      for (let row = minRow; row <= maxRow; row++) {
        const cell = rows.get(row);
        if (cell) this.collectCell(out, cell);
      }
    }
  }

  private collectCell(out: T[], cell: SpatialCell<T>): void {
    for (const entity of cell.entities) {
      if (this.isActive && !this.isActive(entity)) continue;
      out.push(entity);
    }
  }

  private removeFromCell(entity: T, cell: SpatialCell<T>): void {
    const index = cell.entities.indexOf(entity);
    if (index >= 0) cell.entities.splice(index, 1);
    if (cell.entities.length === 0) {
      const rows = this.cells.get(cell.column)!;
      rows.delete(cell.row);
      if (rows.size === 0) this.cells.delete(cell.column);
      this.cellCount--;
    }
  }
}
