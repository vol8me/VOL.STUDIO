import { CommandHistory, type HistoryCommand } from '@volstudio/core/ui';
import { Layer, LayerStack, type LayerState } from './LayerStack';
import { RasterSurface, TILE_BYTES, type Rgba } from './RasterSurface';
import { StrokeRecorder } from './StrokeRecorder';
import type { RasterBuffer } from './transform';

export interface DocumentSessionOptions {
  assetId: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  revision: string;
  t: (key: string, options?: Record<string, unknown>) => string;
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
  layers: LayerState[];
  activeLayerId: string;
  conflictRevision?: string;
}

/**
 * PNG düzenleme oturumu. Katmanlar oturumda yaşar; kayıt görünür bileşiği yazar.
 * Her geçmiş durumu tekil damgalıdır: undo ile diskteki duruma dönmek belgeyi
 * temizler. Yapısal komutlar yüzey kimliğini korur; fırça geçmişi aynı yüzeye
 * bağlı kalır. Kaydın damgası PNG kodlaması başlamadan alınmalıdır.
 */
export class DocumentSession {
  readonly assetId: string;
  readonly document: LayerStack;
  readonly #history: CommandHistory;
  readonly #t: DocumentSessionOptions['t'];
  readonly #onChange: DocumentSessionOptions['onChange'];
  #revision: string;
  #conflictRevision: string | null = null;
  #savedStateToken = 0;
  #nextLayerNumber = 2;

  public constructor(options: DocumentSessionOptions) {
    this.#t = options.t;
    this.#onChange = options.onChange;
    this.assetId = options.assetId;
    this.document = new LayerStack(options.width, options.height);
    this.document.add(
      { id: 'layer-1', name: options.t('editor.layerName', { index: 1 }) },
      options.rgba,
    );
    this.#revision = options.revision;
    this.#history = new CommandHistory({
      ...(options.maxHistoryBytes === undefined ? {} : { maxBytes: options.maxHistoryBytes }),
    });
    this.#savedStateToken = this.stateToken;
  }

  public get revision(): string {
    return this.#revision;
  }
  public get stateToken(): number {
    return this.#history.getStateToken();
  }
  public get isDirty(): boolean {
    return this.stateToken !== this.#savedStateToken;
  }
  public get activeLayerId(): string {
    return this.#activeLayer().id;
  }
  public get surface(): RasterSurface {
    return this.#activeLayer().surface;
  }

  public composite(): RasterBuffer {
    return {
      width: this.document.width,
      height: this.document.height,
      rgba: this.document.composite(),
    };
  }

  public getState(): DocumentSessionState {
    const snapshot = this.#history.getSnapshot();
    return {
      dirty: this.isDirty,
      canUndo: snapshot.canUndo,
      canRedo: snapshot.canRedo,
      ...(snapshot.undoLabel === undefined ? {} : { undoLabel: snapshot.undoLabel }),
      ...(snapshot.redoLabel === undefined ? {} : { redoLabel: snapshot.redoLabel }),
      historyBytes: snapshot.byteCost,
      layers: this.document.getStates(),
      activeLayerId: this.activeLayerId,
      ...(this.#conflictRevision === null ? {} : { conflictRevision: this.#conflictRevision }),
    };
  }

  public record(command: HistoryCommand): void {
    this.#history.record(command);
    this.#emit();
  }

  public execute(command: HistoryCommand): void {
    this.#history.execute(command);
    this.#emit();
  }

  public undo(): boolean {
    if (!this.#history.undo()) return false;
    this.#emit();
    return true;
  }

  public redo(): boolean {
    if (!this.#history.redo()) return false;
    this.#emit();
    return true;
  }

  /** Yalnız diske yazılmış görüntünün damgasını temiz taban yapar. */
  public markSaved(revision: string, stateToken = this.stateToken): void {
    this.#revision = revision;
    this.#savedStateToken = stateToken;
    this.#conflictRevision = null;
    this.#emit();
  }

  public noteExternalRevision(revision: string): void {
    const conflict = revision === this.#revision ? null : revision;
    if (this.#conflictRevision === conflict) return;
    this.#conflictRevision = conflict;
    this.#emit();
  }

  public setActiveLayer(layerId: string): void {
    if (this.document.get(layerId) === null) return;
    this.document.setActive(layerId);
    this.#emit();
  }

  public addLayer(name?: string): void {
    const number = this.#nextLayerNumber++;
    const layer = new Layer(new RasterSurface(this.document.width, this.document.height), {
      id: `layer-${number}`,
      name: name ?? this.#t('editor.layerName', { index: number }),
    });
    const previous = this.activeLayerId;
    const index = this.document.indexOf(previous) + 1;
    this.execute({
      label: this.#t('editor.layerAdd'),
      byteCost: 512,
      apply: () => {
        this.document.insertAt(index, layer);
        this.document.setActive(layer.id);
      },
      revert: () => {
        this.document.remove(layer.id);
        this.document.setActive(previous);
      },
    });
  }

  public removeLayer(layerId: string): void {
    const layer = this.document.get(layerId);
    if (layer === null || this.document.length === 1) return;
    const index = this.document.indexOf(layerId);
    const previous = this.activeLayerId;
    this.execute({
      label: this.#t('editor.layerRemove'),
      byteCost: layer.surface.residentTileCount * TILE_BYTES + 128,
      apply: () => {
        this.document.remove(layerId);
      },
      revert: () => {
        this.document.insertAt(index, layer);
        this.document.setActive(previous);
      },
    });
  }

  public updateLayer(layerId: string, patch: Partial<Omit<LayerState, 'id'>>, label: string): void {
    const layer = this.document.get(layerId);
    if (layer === null) return;
    const before = layer.getState();
    this.execute({
      label,
      byteCost: 128,
      apply: () => {
        Object.assign(layer, patch, { id: layer.id });
      },
      revert: () => {
        Object.assign(layer, before);
      },
    });
  }

  public moveLayer(layerId: string, direction: -1 | 1): void {
    const from = this.document.indexOf(layerId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= this.document.length) return;
    this.execute({
      label: this.#t(direction === 1 ? 'editor.layerUp' : 'editor.layerDown'),
      byteCost: 128,
      apply: () => {
        this.document.move(layerId, to);
      },
      revert: () => {
        this.document.move(layerId, from);
      },
    });
  }

  public mergeLayerDown(layerId: string): void {
    const index = this.document.indexOf(layerId);
    if (index <= 0) return;
    const upper = this.document.layers[index];
    const lower = this.document.layers[index - 1];
    const previous = this.activeLayerId;
    const recorder = new StrokeRecorder(lower.surface);
    for (let tile = 0; tile < lower.surface.tilesX * lower.surface.tilesY; tile++)
      recorder.captureTile(tile);
    this.document.mergeDown(layerId);
    const pixels = recorder.toCommand({ label: this.#t('editor.layerMerge') });
    this.record({
      label: this.#t('editor.layerMerge'),
      byteCost: (pixels?.byteCost ?? 0) + upper.surface.residentTileCount * TILE_BYTES + 128,
      apply: () => {
        pixels?.apply();
        this.document.remove(layerId);
        this.document.setActive(lower.id);
      },
      revert: () => {
        pixels?.revert();
        this.document.insertAt(index, upper);
        this.document.setActive(previous);
      },
    });
  }

  public getPixel(x: number, y: number): Rgba {
    return this.surface.getPixel(x, y);
  }
  public toRgba(): Uint8ClampedArray {
    return this.document.composite();
  }

  #activeLayer(): Layer {
    const layer = this.document.activeLayer;
    if (layer === null) throw new Error('PNG belgesi en az bir katman gerektirir');
    return layer;
  }

  #emit(): void {
    this.document.invalidate();
    this.#onChange?.(this.getState());
  }
}
