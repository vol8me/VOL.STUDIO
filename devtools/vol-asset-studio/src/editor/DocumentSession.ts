import {
  CommandHistory,
  type CommandHistorySnapshot,
  type HistoryCommand,
} from '@volstudio/core/ui';
import type { SpriteLayerMeta } from '../../shared/index';
import type { RasterSurface, Rgba } from './RasterSurface';
import { SpriteDocument } from './SpriteDocument';
import type { RasterBuffer } from './transform';

export interface DocumentSessionOptions {
  assetId: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** Belgenin açıldığı andaki disk revizyonu. */
  revision: string;
  maxHistoryBytes?: number;
  onChange?: (state: DocumentSessionState) => void;
}

export interface DocumentSessionState {
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  historyBytes: number;
  layers: SpriteLayerMeta[];
  activeLayerId: string;
  frameCount: number;
  activeFrameIndex: number;
  /** Diskteki revizyon harici olarak değiştiyse dolu olur. */
  conflictRevision?: string;
}

/**
 * Tek bir açık belgenin yaşam döngüsü: sprite belgesi, geçmiş ve kirlilik.
 *
 * Kirlilik "geçmişte adım var mı" ile ÖLÇÜLMEZ. Her belge durumuna tekil bir
 * damga verilir ve kaydedilen damga saklanır; kullanıcı undo ile kaydedilmiş
 * duruma geri dönerse belge yeniden TEMİZ sayılır. Adım saymak bunu yapamaz:
 * iki edit + iki undo, adım sayısına göre "kirli" görünürken belge diskteki
 * içerikle birebir aynıdır ve sahte bir kaydedilmemiş uyarısı gösterilirdi.
 */
export class DocumentSession {
  readonly assetId: string;
  readonly document: SpriteDocument;
  readonly #history: CommandHistory;
  readonly #onChange?: (state: DocumentSessionState) => void;
  #revision: string;
  #conflictRevision: string | null = null;
  #activeLayerId: string;
  #nextStamp = 1;
  #stamp = 0;
  #savedStamp = 0;
  #undoStamps: number[] = [];
  #redoStamps: number[] = [];
  #nextLayerNumber = 2;

  public constructor(options: DocumentSessionOptions) {
    this.assetId = options.assetId;
    this.document = SpriteDocument.fromFlat(
      options.assetId,
      options.width,
      options.height,
      options.rgba,
    );
    this.#activeLayerId = this.document.layers[0].id;
    this.#revision = options.revision;
    this.#onChange = options.onChange;
    this.#history = new CommandHistory({
      ...(options.maxHistoryBytes === undefined ? {} : { maxBytes: options.maxHistoryBytes }),
    });
  }

  public get revision(): string {
    return this.#revision;
  }

  public get isDirty(): boolean {
    return this.#stamp !== this.#savedStamp;
  }

  public get activeLayerId(): string {
    return this.#activeLayerId;
  }

  /** Araçların yazdığı yüzey: aktif karedeki aktif katman. */
  public get surface(): RasterSurface {
    return this.document.celSurface(this.document.activeFrameIndex, this.#activeLayerId);
  }

  /** Ekrana çizilen bileşik. */
  public composite(): RasterBuffer {
    return this.document.compositeFrame(this.document.activeFrameIndex);
  }

  public getState(): DocumentSessionState {
    const snapshot: CommandHistorySnapshot = this.#history.getSnapshot();
    return {
      dirty: this.isDirty,
      canUndo: snapshot.canUndo,
      canRedo: snapshot.canRedo,
      ...(snapshot.undoLabel === undefined ? {} : { undoLabel: snapshot.undoLabel }),
      ...(snapshot.redoLabel === undefined ? {} : { redoLabel: snapshot.redoLabel }),
      historyBytes: snapshot.byteCost,
      layers: this.document.layers.map((layer) => ({ ...layer })),
      activeLayerId: this.#activeLayerId,
      frameCount: this.document.frameCount,
      activeFrameIndex: this.document.activeFrameIndex,
      ...(this.#conflictRevision === null ? {} : { conflictRevision: this.#conflictRevision }),
    };
  }

  /** Zaten uygulanmış bir gesture komutunu geçmişe alır. */
  public record(command: HistoryCommand): void {
    this.#history.record(command);
    this.#advanceStamp();
  }

  /** Komutu uygular ve geçmişe alır (yapısal işlemler bunu kullanır). */
  public execute(command: HistoryCommand): void {
    this.#history.execute(command);
    this.#advanceStamp();
  }

  public undo(): boolean {
    if (!this.#history.undo()) return false;
    // Damga yığını yalnız BAŞARILI undo'da hareket eder; geçmiş bütçe yüzünden
    // kırpıldığında yığınlar sessizce ayrışmasın diye dönüş değeri beklenir.
    const previous = this.#undoStamps.pop();
    this.#redoStamps.push(this.#stamp);
    this.#stamp = previous ?? 0;
    this.#clampSelection();
    this.#emit();
    return true;
  }

  public redo(): boolean {
    if (!this.#history.redo()) return false;
    const next = this.#redoStamps.pop();
    this.#undoStamps.push(this.#stamp);
    this.#stamp = next ?? this.#nextStamp++;
    this.#clampSelection();
    this.#emit();
    return true;
  }

  public markSaved(revision: string): void {
    this.#revision = revision;
    this.#savedStamp = this.#stamp;
    this.#conflictRevision = null;
    this.#emit();
  }

  /**
   * Diskteki revizyonun değiştiğini bildirir.
   *
   * Belge temizse çağıran içeriği sessizce yeniden yükleyebilir; kirliyse
   * otomatik yükleme YAPILMAZ, kullanıcıya seçenek sunulur.
   */
  public noteExternalRevision(revision: string): void {
    if (revision === this.#revision) {
      if (this.#conflictRevision === null) return;
      this.#conflictRevision = null;
      this.#emit();
      return;
    }
    this.#conflictRevision = revision;
    this.#emit();
  }

  public setActiveLayer(layerId: string): void {
    if (!this.document.layers.some((layer) => layer.id === layerId)) return;
    this.#activeLayerId = layerId;
    this.#emit();
  }

  public setActiveFrame(index: number): void {
    this.document.setActiveFrame(index);
    this.#emit();
  }

  /** Yeni boş katmanı aktif katmanın ÜSTÜNE ekler. */
  public addLayer(name?: string): void {
    const id = `layer-${Date.now().toString(36)}-${this.#nextLayerNumber}`;
    const meta: SpriteLayerMeta = {
      id,
      name: name ?? `Katman ${this.#nextLayerNumber}`,
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      alphaLocked: false,
    };
    this.#nextLayerNumber += 1;
    const index = this.document.layers.findIndex((layer) => layer.id === this.#activeLayerId) + 1;
    const previousActive = this.#activeLayerId;
    this.execute({
      label: 'Katman ekle',
      byteCost: 512,
      apply: () => {
        this.document.addLayer(meta, index);
        this.#activeLayerId = id;
      },
      revert: () => {
        this.document.removeLayer(id);
        this.#activeLayerId = previousActive;
      },
    });
  }

  public removeLayer(layerId: string): void {
    const index = this.document.layers.findIndex((layer) => layer.id === layerId);
    if (index < 0 || this.document.layers.length === 1) return;
    const meta = { ...this.document.layers[index] };
    // Silinen katmanın bütün karelerdeki cel içeriği saklanır; yoksa undo
    // katmanı boş geri getirir ve kullanıcının işi sessizce kaybolur.
    const cels = this.document.frames.map((frame) => frame.cels.get(layerId)?.clone() ?? null);
    const previousActive = this.#activeLayerId;
    this.execute({
      label: 'Katman sil',
      byteCost: cels.reduce(
        (sum, cel) => sum + (cel === null ? 0 : cel.residentTileCount * 16_384),
        0,
      ),
      apply: () => {
        this.document.removeLayer(layerId);
        this.#activeLayerId = this.document.layers[Math.max(0, index - 1)].id;
      },
      revert: () => {
        this.document.addLayer(meta, index);
        this.document.frames.forEach((frame, frameIndex) => {
          const cel = cels[frameIndex];
          if (cel !== null) frame.cels.set(layerId, cel.clone());
        });
        this.#activeLayerId = previousActive;
      },
    });
  }

  public updateLayer(layerId: string, patch: Partial<SpriteLayerMeta>, label: string): void {
    const current = this.document.layers.find((layer) => layer.id === layerId);
    if (current === undefined) return;
    const before: Partial<SpriteLayerMeta> = {};
    for (const key of Object.keys(patch) as (keyof SpriteLayerMeta)[]) {
      (before as Record<string, unknown>)[key] = current[key];
    }
    this.execute({
      label,
      byteCost: 128,
      // Metadata değişimi ucuzdur; byte bütçesinde yer kaplamaması için sabit
      // küçük bir maliyet verilir.
      apply: () => void this.document.updateLayer(layerId, patch),
      revert: () => void this.document.updateLayer(layerId, before),
    });
  }

  public moveLayer(layerId: string, direction: -1 | 1): void {
    const from = this.document.layers.findIndex((layer) => layer.id === layerId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= this.document.layers.length) return;
    const meta = { ...this.document.layers[from] };
    this.execute({
      label: 'Katman sırası',
      byteCost: 128,
      apply: () => {
        this.document.removeLayerMetaOnly(layerId);
        this.document.addLayer(meta, to);
      },
      revert: () => {
        this.document.removeLayerMetaOnly(layerId);
        this.document.addLayer(meta, from);
      },
    });
  }

  public mergeLayerDown(layerId: string): void {
    const index = this.document.layers.findIndex((layer) => layer.id === layerId);
    if (index <= 0) return;
    const upperMeta = { ...this.document.layers[index] };
    const lowerId = this.document.layers[index - 1].id;
    const upperCels = this.document.frames.map((frame) => frame.cels.get(layerId)?.clone() ?? null);
    const lowerCels = this.document.frames.map((frame) => frame.cels.get(lowerId)?.clone() ?? null);
    this.execute({
      label: 'Aşağı birleştir',
      byteCost: 4096,
      apply: () => {
        this.document.mergeLayerDown(layerId);
        this.#activeLayerId = lowerId;
      },
      revert: () => {
        this.document.addLayer(upperMeta, index);
        this.document.frames.forEach((frame, frameIndex) => {
          const upper = upperCels[frameIndex];
          const lower = lowerCels[frameIndex];
          if (upper !== null) frame.cels.set(layerId, upper.clone());
          if (lower !== null) frame.cels.set(lowerId, lower.clone());
        });
        this.#activeLayerId = layerId;
      },
    });
  }

  public addFrame(copyCurrent: boolean): void {
    const index = this.document.activeFrameIndex;
    this.execute({
      label: 'Kare ekle',
      byteCost: copyCurrent ? 4096 : 512,
      apply: () => {
        this.document.addFrame(index, copyCurrent ? index : undefined);
        this.document.setActiveFrame(index + 1);
      },
      revert: () => {
        this.document.removeFrame(index + 1);
        this.document.setActiveFrame(index);
      },
    });
  }

  public removeFrame(index: number): void {
    if (this.document.frameCount === 1) return;
    const frame = this.document.frameAt(index);
    if (frame === null) return;
    const snapshot = {
      id: frame.id,
      durationMs: frame.durationMs,
      tags: [...frame.tags],
      cels: new Map([...frame.cels].map(([id, surface]) => [id, surface.clone()])),
    };
    this.execute({
      label: 'Kare sil',
      byteCost: 4096,
      apply: () => void this.document.removeFrame(index),
      revert: () =>
        void this.document.insertFrame(index, {
          ...snapshot,
          cels: new Map([...snapshot.cels].map(([id, surface]) => [id, surface.clone()])),
        }),
    });
  }

  public setFrameDuration(index: number, durationMs: number): void {
    const frame = this.document.frameAt(index);
    if (frame === null) return;
    const before = frame.durationMs;
    this.execute({
      label: 'Kare süresi',
      byteCost: 128,
      apply: () => this.document.setFrameDuration(index, durationMs),
      revert: () => this.document.setFrameDuration(index, before),
    });
  }

  public getPixel(x: number, y: number): Rgba {
    return this.surface.getPixel(x, y);
  }

  /** Kaydedilecek tam RGBA tamponu (bileşik). */
  public toRgba(): Uint8ClampedArray {
    return this.composite().rgba;
  }

  #advanceStamp(): void {
    this.#undoStamps.push(this.#stamp);
    this.#redoStamps = [];
    this.#stamp = this.#nextStamp++;
    this.#emit();
  }

  /** Undo/redo yapısal bir işlemi geri aldıysa seçimler geçersizleşebilir. */
  #clampSelection(): void {
    if (!this.document.layers.some((layer) => layer.id === this.#activeLayerId)) {
      this.#activeLayerId = this.document.layers[0].id;
    }
    this.document.setActiveFrame(this.document.activeFrameIndex);
  }

  #emit(): void {
    this.#onChange?.(this.getState());
  }
}
