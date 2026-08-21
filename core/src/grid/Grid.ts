/** Ayrık ızgara koordinatı. */
export interface GridPoint {
  col: number;
  row: number;
}

/** Dört yön komşuluğu (yukarı/aşağı/sol/sağ). */
export const ORTHOGONAL_NEIGHBOURS: readonly GridPoint[] = [
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
];

/** Sekiz yön komşuluğu (çaprazlar dahil). */
export const DIAGONAL_NEIGHBOURS: readonly GridPoint[] = [
  ...ORTHOGONAL_NEIGHBOURS,
  { col: 1, row: -1 },
  { col: 1, row: 1 },
  { col: -1, row: 1 },
  { col: -1, row: -1 },
];

/**
 * Sabit boyutlu, ayrık 2B ızgara.
 *
 * `SpatialIndex`ten farkı ölçek değil MODEL: `SpatialIndex` sürekli uzayda
 * "yakınımda ne var" sorusunu yanıtlar; `Grid` ayrık hücrelerde "şu hücrede ne
 * var" sorusunu. Hücreleri düz bir dizide tutar — satır/sütun erişimi O(1) ve
 * bellek bitişiktir.
 *
 * Sınır dışı erişim İSTİSNA FIRLATMAZ, `undefined` döner: ızgara kenarında
 * komşu taramak son derece yaygındır ve her çağrıyı `inBounds` ile sarmak
 * çağıranı gereksiz gürültüye boğardı.
 */
export class Grid<T> {
  private readonly cells: (T | undefined)[];

  constructor(
    readonly cols: number,
    readonly rows: number,
    fill?: (point: GridPoint) => T,
  ) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
      throw new Error(`Grid: cols/rows pozitif tam sayı olmalı (gelen: ${cols}x${rows})`);
    }
    this.cells = new Array<T | undefined>(cols * rows);
    if (fill) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          this.cells[row * cols + col] = fill({ col, row });
        }
      }
    }
  }

  /**
   * Koordinat ızgaranın içinde mi?
   *
   * TAM SAYI olması da şarttır. Eskiden yalnızca sınır kontrol ediliyordu ve
   * `set(1.5, 1, x)` `true` dönüyordu: değer dizide `"1.5"` adlı normal bir
   * ÖZELLİK olarak yazılıyor, `get(1.5, 1)` onu geri veriyor, ama
   * `forEach`/`filledCount`/`clear` hiç görmüyordu — görünmez, temizlenmeyen
   * veri.
   */
  inBounds(col: number, row: number): boolean {
    return (
      Number.isInteger(col) &&
      Number.isInteger(row) &&
      col >= 0 &&
      row >= 0 &&
      col < this.cols &&
      row < this.rows
    );
  }

  /** Hücre değeri; sınır dışında ya da boşsa `undefined`. */
  get(col: number, row: number): T | undefined {
    if (!this.inBounds(col, row)) return undefined;
    return this.cells[row * this.cols + col];
  }

  /**
   * Hücreyi yazar. Sınır dışıysa yazmaz ve `false` döner — sessiz taşma,
   * ızgaranın başka bir yerini bozan en sinsi hata biçimidir.
   */
  set(col: number, row: number, value: T | undefined): boolean {
    if (!this.inBounds(col, row)) return false;
    this.cells[row * this.cols + col] = value;
    return true;
  }

  /** Tüm hücreleri boşaltır. */
  clear(): void {
    this.cells.fill(undefined);
  }

  /** Dolu hücre sayısı. */
  get filledCount(): number {
    let count = 0;
    for (const cell of this.cells) if (cell !== undefined) count++;
    return count;
  }

  /**
   * Her hücre için sırayla (satır satır) çağırır.
   *
   * Koordinat, nesne yerine AYRI SAYILAR olarak verilir. Hücre başına
   * `{col,row}` üretmek 100×100'lük bir ızgarada tek gezinmede 10.000 tahsis
   * demektir; tek bir nesneyi yeniden kullanmak ise sessiz aliasing yaratır
   * (çağıran koordinatı saklarsa hepsi aynı nesneye bakar). Sayılar bu
   * ikilemin ikisini de ortadan kaldırır.
   */
  forEach(visit: (value: T | undefined, col: number, row: number) => void): void {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        visit(this.cells[row * this.cols + col], col, row);
      }
    }
  }

  /** Yalnızca DOLU hücreleri gezer. */
  forEachFilled(visit: (value: T, col: number, row: number) => void): void {
    this.forEach((value, col, row) => {
      if (value !== undefined) visit(value, col, row);
    });
  }

  /**
   * Komşuları TAHSİS ETMEDEN gezer — sıcak döngüler için.
   *
   * `neighbours()` her çağrıda bir dizi ve komşu başına bir nesne üretir;
   * kare başına binlerce kez çağrılan bir hesapta bu ölçülebilir çöp demektir.
   * Koordinat burada da nesne değil ayrı sayılardır — aliasing riski yok.
   */
  forEachNeighbour(
    col: number,
    row: number,
    visit: (col: number, row: number) => void,
    offsets: readonly GridPoint[] = ORTHOGONAL_NEIGHBOURS,
  ): void {
    for (const offset of offsets) {
      const nc = col + offset.col;
      const nr = row + offset.row;
      if (!this.inBounds(nc, nr)) continue;
      visit(nc, nr);
    }
  }

  /**
   * Komşu hücrelerin koordinatları — sınır dışındakiler elenir.
   *
   * Her çağrıda yeni dizi ve nesne üretir; sıcak döngülerde
   * `forEachNeighbour` tercih edilmelidir.
   */
  neighbours(
    col: number,
    row: number,
    offsets: readonly GridPoint[] = ORTHOGONAL_NEIGHBOURS,
  ): GridPoint[] {
    const result: GridPoint[] = [];
    for (const offset of offsets) {
      const next = { col: col + offset.col, row: row + offset.row };
      if (this.inBounds(next.col, next.row)) result.push(next);
    }
    return result;
  }

  /** Dünya koordinatını hücreye çevirir. */
  toCell(x: number, y: number, cellSize: number, originX = 0, originY = 0): GridPoint {
    return {
      col: Math.floor((x - originX) / cellSize),
      row: Math.floor((y - originY) / cellSize),
    };
  }

  /** Hücrenin MERKEZİNİN dünya koordinatı. */
  toWorld(
    col: number,
    row: number,
    cellSize: number,
    originX = 0,
    originY = 0,
  ): { x: number; y: number } {
    return {
      x: originX + (col + 0.5) * cellSize,
      y: originY + (row + 0.5) * cellSize,
    };
  }
}
