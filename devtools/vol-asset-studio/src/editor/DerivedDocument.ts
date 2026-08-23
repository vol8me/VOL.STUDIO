import type { Rgba } from './RasterSurface';
import type { RasterBuffer } from './transform';

export interface UserPixelEdit {
  /** Piksel indeksi (`y * width + x`). */
  index: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * `.volpost.json` — türetilmiş varlığın üzerine yapılan kalıcı düzenlemeler.
 *
 * Tarif PİKSEL DELTASI tutar, tam görüntü değil: generator çıktısı yeniden
 * üretildiğinde delta yeni tabanın üzerine uygulanır ve kullanıcının işi
 * kaybolmaz. Tam görüntü saklansaydı yeniden üretim hiç görünmez, varlık
 * fiilen "manuel" olurdu.
 */
export interface PostProcessRecipeV1 {
  schemaVersion: 1;
  /** Deltanın oluşturulduğu generator çıktısının revizyonu. */
  baseRevision: string;
  canvas: { width: number; height: number };
  edits: UserPixelEdit[];
  createdAt: string;
}

export interface DerivedDocumentOptions {
  width: number;
  height: number;
  /** Generator çıktısı. */
  base: Uint8ClampedArray;
  baseRevision: string;
  recipe?: PostProcessRecipeV1;
}

function pixelsEqual(buffer: Uint8ClampedArray, index: number, color: Rgba): boolean {
  const offset = index * 4;
  return (
    buffer[offset] === color.r &&
    buffer[offset + 1] === color.g &&
    buffer[offset + 2] === color.b &&
    buffer[offset + 3] === color.a
  );
}

/**
 * Generator tabanı + kullanıcı katmanı.
 *
 * Kullanıcı doğrudan tabanı DEĞİŞTİRMEZ; her düzenleme delta olarak kaydedilir.
 * Böylece "yeniden üret" komutu tabanı tazeler, delta yeniden uygulanır ve
 * kullanıcının elle düzelttiği pikseller yerinde kalır.
 */
export class DerivedDocument {
  readonly width: number;
  readonly height: number;
  #base: Uint8ClampedArray;
  #baseRevision: string;
  #edits = new Map<number, Rgba>();

  public constructor(options: DerivedDocumentOptions) {
    if (options.base.length !== options.width * options.height * 4) {
      throw new RangeError('Taban tamponu boyutla uyuşmuyor');
    }
    this.width = options.width;
    this.height = options.height;
    this.#base = new Uint8ClampedArray(options.base);
    this.#baseRevision = options.baseRevision;
    if (options.recipe !== undefined) this.applyRecipe(options.recipe);
  }

  public get baseRevision(): string {
    return this.#baseRevision;
  }

  public get editCount(): number {
    return this.#edits.size;
  }

  /** Kullanıcı düzenlemesini kaydeder; tabanla aynıysa delta TEMİZLENİR. */
  public setPixel(x: number, y: number, color: Rgba): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const index = y * this.width + x;
    if (pixelsEqual(this.#base, index, color)) {
      // Tabanla aynı değeri delta olarak tutmak tarifi şişirir ve yeniden
      // üretimde gereksizce eski pikseli sabitler.
      return this.#edits.delete(index);
    }
    const existing = this.#edits.get(index);
    if (
      existing !== undefined &&
      existing.r === color.r &&
      existing.g === color.g &&
      existing.b === color.b &&
      existing.a === color.a
    ) {
      return false;
    }
    this.#edits.set(index, { ...color });
    return true;
  }

  public getPixel(x: number, y: number): Rgba {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const index = y * this.width + x;
    const edit = this.#edits.get(index);
    if (edit !== undefined) return { ...edit };
    const offset = index * 4;
    return {
      r: this.#base[offset],
      g: this.#base[offset + 1],
      b: this.#base[offset + 2],
      a: this.#base[offset + 3],
    };
  }

  /** Taban + delta birleşimi. */
  public compose(): RasterBuffer {
    const rgba = new Uint8ClampedArray(this.#base);
    for (const [index, color] of this.#edits) {
      const offset = index * 4;
      rgba[offset] = color.r;
      rgba[offset + 1] = color.g;
      rgba[offset + 2] = color.b;
      rgba[offset + 3] = color.a;
    }
    return { width: this.width, height: this.height, rgba };
  }

  /**
   * Generator yeniden ürettiğinde yeni tabanı alır.
   *
   * Delta KORUNUR; yalnız yeni tabanla aynı değere düşen düzenlemeler
   * temizlenir çünkü artık bir fark ifade etmezler.
   */
  public rebase(base: Uint8ClampedArray, revision: string): { kept: number; dropped: number } {
    if (base.length !== this.#base.length) throw new RangeError('Yeni taban boyutu uyuşmuyor');
    this.#base = new Uint8ClampedArray(base);
    this.#baseRevision = revision;
    let dropped = 0;
    for (const [index, color] of [...this.#edits]) {
      if (pixelsEqual(this.#base, index, color)) {
        this.#edits.delete(index);
        dropped += 1;
      }
    }
    return { kept: this.#edits.size, dropped };
  }

  public toRecipe(createdAt = new Date().toISOString()): PostProcessRecipeV1 {
    return {
      schemaVersion: 1,
      baseRevision: this.#baseRevision,
      canvas: { width: this.width, height: this.height },
      // Deterministik sıra: aynı düzenleme kümesi her zaman aynı dosyayı
      // üretir, böylece diff gürültüsü olmaz.
      edits: [...this.#edits.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([index, color]) => ({ index, r: color.r, g: color.g, b: color.b, a: color.a })),
      createdAt,
    };
  }

  public applyRecipe(recipe: PostProcessRecipeV1): void {
    if (recipe.canvas.width !== this.width || recipe.canvas.height !== this.height) {
      throw new RangeError('Tarif tuval boyutu belgeyle uyuşmuyor');
    }
    this.#edits.clear();
    for (const edit of recipe.edits) {
      if (edit.index < 0 || edit.index >= this.width * this.height) continue;
      this.#edits.set(edit.index, { r: edit.r, g: edit.g, b: edit.b, a: edit.a });
    }
  }

  public clearEdits(): void {
    this.#edits.clear();
  }
}

export const POST_PROCESS_SUFFIX = '.volpost.json';
