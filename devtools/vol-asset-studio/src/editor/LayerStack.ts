import { blendBuffer, type BlendMode } from './blend';
import { RasterSurface } from './RasterSurface';

export interface LayerOptions {
  id: string;
  name: string;
  visible?: boolean;
  opacity?: number;
  blendMode?: BlendMode;
  /** Alfa kilidi: var olan piksellerin şeffaflığı korunur. */
  alphaLocked?: boolean;
}

export interface LayerState {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  alphaLocked: boolean;
}

export class Layer {
  readonly id: string;
  readonly surface: RasterSurface;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  alphaLocked: boolean;

  public constructor(surface: RasterSurface, options: LayerOptions) {
    this.id = options.id;
    this.surface = surface;
    this.name = options.name;
    this.visible = options.visible ?? true;
    this.opacity = Math.max(0, Math.min(1, options.opacity ?? 1));
    this.blendMode = options.blendMode ?? 'normal';
    this.alphaLocked = options.alphaLocked ?? false;
  }

  public getState(): LayerState {
    return {
      id: this.id,
      name: this.name,
      visible: this.visible,
      opacity: this.opacity,
      blendMode: this.blendMode,
      alphaLocked: this.alphaLocked,
    };
  }
}

/**
 * Sıralı katman yığını ve bileşik (composite) üretimi.
 *
 * Yığın ALTTAN ÜSTE sıralıdır: `layers[0]` en alttaki katmandır ve bileşik
 * onun üzerine kurulur. Sıra, kullanıcının panelde gördüğünün tersi olabilir
 * (paneller genelde üstteni başa koyar); dönüşüm sunum katmanının işidir,
 * model tek bir yönde kalır ki blend matematiği belirsizleşmesin.
 */
export class LayerStack {
  readonly width: number;
  readonly height: number;
  #layers: Layer[] = [];
  #activeId: string | null = null;
  #composite: Uint8ClampedArray;
  #dirty = true;

  public constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.#composite = new Uint8ClampedArray(width * height * 4);
  }

  public get layers(): readonly Layer[] {
    return this.#layers;
  }

  public get activeLayer(): Layer | null {
    return this.#layers.find((layer) => layer.id === this.#activeId) ?? null;
  }

  public get length(): number {
    return this.#layers.length;
  }

  /** Yığının ÜSTÜNE katman ekler. */
  public add(options: LayerOptions, rgba?: Uint8ClampedArray): Layer {
    if (this.#layers.some((layer) => layer.id === options.id)) {
      throw new Error(`Yinelenen katman kimliği: ${options.id}`);
    }
    const surface =
      rgba === undefined
        ? new RasterSurface(this.width, this.height)
        : RasterSurface.fromRgba(this.width, this.height, rgba);
    const layer = new Layer(surface, options);
    this.#layers.push(layer);
    this.#activeId ??= layer.id;
    this.invalidate();
    return layer;
  }

  public insertAt(index: number, layer: Layer): void {
    const clamped = Math.max(0, Math.min(this.#layers.length, index));
    this.#layers.splice(clamped, 0, layer);
    this.#activeId ??= layer.id;
    this.invalidate();
  }

  public remove(id: string): Layer | null {
    const index = this.#layers.findIndex((layer) => layer.id === id);
    if (index < 0) return null;
    // Son katman silinemez: belgenin hiç yüzeyi kalmazsa araçların yazacağı
    // bir hedef olmaz ve editör kullanılamaz duruma düşer.
    if (this.#layers.length === 1) return null;
    const [removed] = this.#layers.splice(index, 1);
    if (this.#activeId === id) {
      this.#activeId = (this.#layers[index] ?? this.#layers[index - 1] ?? null)?.id ?? null;
    }
    this.invalidate();
    return removed;
  }

  public indexOf(id: string): number {
    return this.#layers.findIndex((layer) => layer.id === id);
  }

  public get(id: string): Layer | null {
    return this.#layers.find((layer) => layer.id === id) ?? null;
  }

  public setActive(id: string): void {
    if (this.#layers.some((layer) => layer.id === id)) this.#activeId = id;
  }

  /** Katmanı yeni indekse taşır ve taşındıysa `true` döner. */
  public move(id: string, targetIndex: number): boolean {
    const from = this.indexOf(id);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(this.#layers.length - 1, targetIndex));
    if (from === to) return false;
    const [layer] = this.#layers.splice(from, 1);
    this.#layers.splice(to, 0, layer);
    this.invalidate();
    return true;
  }

  /** Bileşiğin yeniden hesaplanması gerektiğini bildirir. */
  public invalidate(): void {
    this.#dirty = true;
  }

  /** Görünür katmanların alttan üste karıştırılmış sonucu. */
  public composite(): Uint8ClampedArray {
    if (!this.#dirty) return this.#composite;
    this.#composite.fill(0);
    for (const layer of this.#layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      blendBuffer(this.#composite, layer.surface.toRgba(), layer.blendMode, layer.opacity);
    }
    this.#dirty = false;
    return this.#composite;
  }

  /** Katmanı bir altındakiyle birleştirir; alttaki hedeftir. */
  public mergeDown(id: string): boolean {
    const index = this.indexOf(id);
    if (index <= 0) return false;
    const upper = this.#layers[index];
    const lower = this.#layers[index - 1];
    const merged = lower.surface.toRgba();
    blendBuffer(merged, upper.surface.toRgba(), upper.blendMode, upper.opacity);
    const rebuilt = RasterSurface.fromRgba(this.width, this.height, merged);
    // Alt katmanın yüzeyi yerinde güncellenir; kimliği korunur ki referanslar
    // ve seçili katman kaybolmasın.
    for (let tile = 0; tile < lower.surface.tilesX * lower.surface.tilesY; tile += 1) {
      lower.surface.restoreTile(tile, rebuilt.copyTile(tile));
    }
    this.#layers.splice(index, 1);
    if (this.#activeId === id) this.#activeId = lower.id;
    this.invalidate();
    return true;
  }

  public getStates(): LayerState[] {
    return this.#layers.map((layer) => layer.getState());
  }
}
