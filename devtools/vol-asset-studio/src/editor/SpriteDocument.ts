import type {
  SpriteFrameMeta,
  SpriteLayerMeta,
  SpritePivot,
  VolSpriteDocumentV1,
} from '../../shared/index';
import { blendBuffer } from './blend';
import { Layer, LayerStack } from './LayerStack';
import { RasterSurface } from './RasterSurface';
import type { RasterBuffer } from './transform';

export interface SpriteFrame {
  id: string;
  durationMs: number;
  tags: string[];
  /** Katman kimliği → o karedeki yüzey. */
  cels: Map<string, RasterSurface>;
}

export interface SpriteDocumentOptions {
  id: string;
  width: number;
  height: number;
  layers: SpriteLayerMeta[];
  frames: SpriteFrame[];
  palette?: string[];
  pivot?: SpritePivot;
  metadata?: Record<string, unknown>;
}

const DEFAULT_FRAME_MS = 100;

/**
 * Katmanlı ve kareli pixel belgesi.
 *
 * Tek katmanlı düz PNG için bu model KULLANILMAZ: doğrudan PNG kipi ek proje
 * dosyası yaratmaz. Belge ancak kullanıcı katman ya da kare eklediğinde bu
 * yapıya dönüşür.
 *
 * Katman ve kare kimlikleri STABİLDİR; sıralama değişince kimlik değişmez,
 * böylece cel eşlemeleri ve dış referanslar kopmaz.
 */
export class SpriteDocument {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  palette: string[];
  pivot: SpritePivot | null;
  metadata: Record<string, unknown>;
  #layerMeta: SpriteLayerMeta[];
  #frames: SpriteFrame[];
  #activeFrame = 0;
  /** Kare indeksi → { imza, tampon }. İmza katman metadata'sı + yüzey
   *  sürümlerinden türetilir; hiçbir şey değişmediyse bileşik yeniden
   *  hesaplanmaz. Önbelleksiz her fırça darbesi bütün katmanları yeniden
   *  karıştırıyordu ve 1024² belgede darbe 700 ms sürüyordu. */
  readonly #compositeCache = new Map<number, { signature: string; buffer: RasterBuffer }>();

  public constructor(options: SpriteDocumentOptions) {
    if (options.layers.length === 0) throw new Error('Sprite belgesi en az bir katman ister');
    if (options.frames.length === 0) throw new Error('Sprite belgesi en az bir kare ister');
    this.id = options.id;
    this.width = options.width;
    this.height = options.height;
    this.#layerMeta = options.layers.map((layer) => ({ ...layer }));
    this.#frames = options.frames;
    this.palette = [...(options.palette ?? [])];
    this.pivot = options.pivot ?? null;
    this.metadata = { ...(options.metadata ?? {}) };
  }

  /** Tek katmanlı, tek kareli belgeyi düz rasterdan kurar. */
  public static fromFlat(
    id: string,
    width: number,
    height: number,
    rgba: Uint8ClampedArray,
    layerName = 'Katman 1',
  ): SpriteDocument {
    const cels = new Map<string, RasterSurface>();
    cels.set('layer-1', RasterSurface.fromRgba(width, height, rgba));
    return new SpriteDocument({
      id,
      width,
      height,
      layers: [
        {
          id: 'layer-1',
          name: layerName,
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          alphaLocked: false,
        },
      ],
      frames: [{ id: 'frame-1', durationMs: DEFAULT_FRAME_MS, tags: [], cels }],
    });
  }

  public get layers(): readonly SpriteLayerMeta[] {
    return this.#layerMeta;
  }

  public get frames(): readonly SpriteFrame[] {
    return this.#frames;
  }

  public get frameCount(): number {
    return this.#frames.length;
  }

  public get activeFrameIndex(): number {
    return this.#activeFrame;
  }

  public setActiveFrame(index: number): void {
    this.#activeFrame = Math.max(0, Math.min(this.#frames.length - 1, Math.trunc(index)));
  }

  public frameAt(index: number): SpriteFrame | null {
    return this.#frames[index] ?? null;
  }

  /** Karedeki katman yüzeyi; yoksa saydam olarak oluşturulur. */
  public celSurface(frameIndex: number, layerId: string): RasterSurface {
    const frame = this.#frames[frameIndex];
    if (frame === undefined) throw new RangeError('Kare bulunamadı');
    let surface = frame.cels.get(layerId);
    if (surface === undefined) {
      surface = new RasterSurface(this.width, this.height);
      frame.cels.set(layerId, surface);
    }
    return surface;
  }

  public addLayer(meta: SpriteLayerMeta, atIndex = this.#layerMeta.length): void {
    if (this.#layerMeta.some((layer) => layer.id === meta.id)) {
      throw new Error(`Yinelenen katman kimliği: ${meta.id}`);
    }
    const index = Math.max(0, Math.min(this.#layerMeta.length, atIndex));
    this.#layerMeta.splice(index, 0, { ...meta });
  }

  /**
   * Katman metadata'sını kaldırır, cel verisine DOKUNMAZ.
   *
   * Sıralama değişimi için gerekli: `removeLayer` celleri de silseydi
   * yeniden ekleme boş bir katman geri getirir ve kullanıcının işi kaybolurdu.
   */
  public removeLayerMetaOnly(layerId: string): boolean {
    const index = this.#layerMeta.findIndex((layer) => layer.id === layerId);
    if (index < 0) return false;
    this.#layerMeta.splice(index, 1);
    return true;
  }

  /** Kareyi verilen indekse geri koyar (undo yolu). */
  public insertFrame(index: number, frame: SpriteFrame): void {
    this.#frames.splice(Math.max(0, Math.min(this.#frames.length, index)), 0, frame);
  }

  /** Katmanı bir altındakiyle birleştirir; alttaki hedeftir. */
  public mergeLayerDown(layerId: string): boolean {
    const index = this.#layerMeta.findIndex((layer) => layer.id === layerId);
    if (index <= 0) return false;
    const upper = this.#layerMeta[index];
    const lower = this.#layerMeta[index - 1];
    for (const frame of this.#frames) {
      const upperSurface = frame.cels.get(upper.id);
      if (upperSurface === undefined) continue;
      const merged = (
        frame.cels.get(lower.id) ?? new RasterSurface(this.width, this.height)
      ).toRgba();
      blendBuffer(merged, upperSurface.toRgba(), upper.blendMode, upper.opacity);
      frame.cels.set(lower.id, RasterSurface.fromRgba(this.width, this.height, merged));
      frame.cels.delete(upper.id);
    }
    this.#layerMeta.splice(index, 1);
    return true;
  }

  public removeLayer(layerId: string): boolean {
    if (this.#layerMeta.length === 1) return false;
    const index = this.#layerMeta.findIndex((layer) => layer.id === layerId);
    if (index < 0) return false;
    this.#layerMeta.splice(index, 1);
    for (const frame of this.#frames) frame.cels.delete(layerId);
    return true;
  }

  public updateLayer(layerId: string, patch: Partial<SpriteLayerMeta>): boolean {
    const layer = this.#layerMeta.find((entry) => entry.id === layerId);
    if (layer === undefined) return false;
    Object.assign(layer, patch, { id: layer.id });
    return true;
  }

  public addFrame(afterIndex = this.#frames.length - 1, copyFrom?: number): SpriteFrame {
    const cels = new Map<string, RasterSurface>();
    const source = copyFrom === undefined ? undefined : this.#frames[copyFrom];
    if (source !== undefined) {
      for (const [layerId, surface] of source.cels) cels.set(layerId, surface.clone());
    }
    const frame: SpriteFrame = {
      id: `frame-${Date.now().toString(36)}-${this.#frames.length + 1}`,
      durationMs: source?.durationMs ?? DEFAULT_FRAME_MS,
      tags: [],
      cels,
    };
    this.#frames.splice(Math.max(0, Math.min(this.#frames.length, afterIndex + 1)), 0, frame);
    return frame;
  }

  public removeFrame(index: number): boolean {
    // Son kare silinemez: karesiz belge render edilemez.
    if (this.#frames.length === 1) return false;
    if (index < 0 || index >= this.#frames.length) return false;
    this.#frames.splice(index, 1);
    this.#activeFrame = Math.min(this.#activeFrame, this.#frames.length - 1);
    return true;
  }

  public moveFrame(from: number, to: number): boolean {
    if (from < 0 || from >= this.#frames.length) return false;
    const target = Math.max(0, Math.min(this.#frames.length - 1, to));
    if (from === target) return false;
    const [frame] = this.#frames.splice(from, 1);
    this.#frames.splice(target, 0, frame);
    return true;
  }

  public setFrameDuration(index: number, durationMs: number): void {
    const frame = this.#frames[index];
    if (frame === undefined) return;
    // Sıfır süre sonsuz döngüde takılan bir oynatıcı demektir.
    frame.durationMs = Math.max(1, Math.trunc(durationMs));
  }

  /** Kareyi katman sırasına ve blend kiplerine göre düzleştirir. */
  public compositeFrame(index: number): RasterBuffer {
    const frame = this.#frames[index];
    if (frame === undefined) {
      return {
        width: this.width,
        height: this.height,
        rgba: new Uint8ClampedArray(this.width * this.height * 4),
      };
    }
    const signature = this.#frameSignature(frame);
    const cached = this.#compositeCache.get(index);
    if (cached !== undefined && cached.signature === signature) return cached.buffer;

    const rgba = new Uint8ClampedArray(this.width * this.height * 4);
    for (const meta of this.#layerMeta) {
      if (!meta.visible || meta.opacity <= 0) continue;
      const surface = frame.cels.get(meta.id);
      if (surface === undefined) continue;
      blendBuffer(rgba, surface.toRgba(), meta.blendMode, meta.opacity);
    }
    const buffer = { width: this.width, height: this.height, rgba };
    this.#compositeCache.set(index, { signature, buffer });
    return buffer;
  }

  /** Karenin görsel durumunu tek dizede özetler. */
  #frameSignature(frame: SpriteFrame): string {
    const parts: string[] = [];
    for (const meta of this.#layerMeta) {
      const surface = frame.cels.get(meta.id);
      parts.push(
        `${meta.id}:${meta.visible ? 1 : 0}:${meta.opacity}:${meta.blendMode}:${
          surface?.version ?? -1
        }`,
      );
    }
    return parts.join('|');
  }

  /** Katman yığınını AKTİF kare üzerinden kurar (araçlar bunu düzenler). */
  public buildLayerStack(frameIndex = this.#activeFrame): LayerStack {
    const stack = new LayerStack(this.width, this.height);
    for (const meta of this.#layerMeta) {
      const surface = this.celSurface(frameIndex, meta.id);
      stack.insertAt(stack.length, new Layer(surface, meta));
    }
    return stack;
  }

  /** `.volsprite.json` gövdesi; cel dosya adları çağıran tarafından verilir. */
  public toJson(celFileFor: (frameIndex: number, layerId: string) => string): VolSpriteDocumentV1 {
    const frames: SpriteFrameMeta[] = this.#frames.map((frame, index) => ({
      id: frame.id,
      durationMs: frame.durationMs,
      ...(frame.tags.length > 0 ? { tags: [...frame.tags] } : {}),
      cels: this.#layerMeta
        .filter((meta) => frame.cels.has(meta.id))
        .map((meta) => ({ layerId: meta.id, file: celFileFor(index, meta.id) })),
    }));
    return {
      schemaVersion: 1,
      id: this.id,
      canvas: { width: this.width, height: this.height },
      palette: [...this.palette],
      layers: this.#layerMeta.map((layer) => ({ ...layer })),
      frames,
      ...(this.pivot === null ? {} : { pivot: { ...this.pivot } }),
      ...(Object.keys(this.metadata).length === 0 ? {} : { metadata: { ...this.metadata } }),
    };
  }
}
