import {
  CommandHistory,
  type CommandHistorySnapshot,
  type HistoryCommand,
} from '@volstudio/core/ui';
import { RasterSurface, type Rgba } from './RasterSurface';

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
  /** Diskteki revizyon harici olarak değiştiyse dolu olur. */
  conflictRevision?: string;
}

/**
 * Tek bir açık belgenin yaşam döngüsü: yüzey, geçmiş ve kirlilik durumu.
 *
 * Kirlilik "geçmişte adım var mı" ile ÖLÇÜLMEZ. Her belge durumuna tekil bir
 * damga verilir ve kaydedilen damga saklanır; kullanıcı undo ile kaydedilmiş
 * duruma geri dönerse belge yeniden TEMİZ sayılır. Adım saymak bunu yapamaz:
 * iki edit + iki undo, adım sayısına göre "kirli" görünürken belge diskteki
 * içerikle birebir aynıdır ve kullanıcıya sahte bir kaydedilmemiş uyarısı
 * gösterilirdi.
 */
export class DocumentSession {
  readonly assetId: string;
  readonly surface: RasterSurface;
  readonly #history: CommandHistory;
  readonly #onChange?: (state: DocumentSessionState) => void;
  #revision: string;
  #conflictRevision: string | null = null;
  #nextStamp = 1;
  #stamp = 0;
  #savedStamp = 0;
  #undoStamps: number[] = [];
  #redoStamps: number[] = [];

  public constructor(options: DocumentSessionOptions) {
    this.assetId = options.assetId;
    this.surface = RasterSurface.fromRgba(options.width, options.height, options.rgba);
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

  public getState(): DocumentSessionState {
    const snapshot: CommandHistorySnapshot = this.#history.getSnapshot();
    return {
      dirty: this.isDirty,
      canUndo: snapshot.canUndo,
      canRedo: snapshot.canRedo,
      ...(snapshot.undoLabel === undefined ? {} : { undoLabel: snapshot.undoLabel }),
      ...(snapshot.redoLabel === undefined ? {} : { redoLabel: snapshot.redoLabel }),
      historyBytes: snapshot.byteCost,
      ...(this.#conflictRevision === null ? {} : { conflictRevision: this.#conflictRevision }),
    };
  }

  /** Zaten uygulanmış bir gesture komutunu geçmişe alır. */
  public record(command: HistoryCommand): void {
    this.#history.record(command);
    this.#undoStamps.push(this.#stamp);
    this.#redoStamps = [];
    this.#stamp = this.#nextStamp++;
    this.#emit();
  }

  public undo(): boolean {
    if (!this.#history.undo()) return false;
    // Damga yığını yalnız BAŞARILI undo'da hareket eder; geçmiş bütçe yüzünden
    // kırpıldığında yığınlar sessizce ayrışmasın diye dönüş değeri beklenir.
    const previous = this.#undoStamps.pop();
    this.#redoStamps.push(this.#stamp);
    this.#stamp = previous ?? 0;
    this.#emit();
    return true;
  }

  public redo(): boolean {
    if (!this.#history.redo()) return false;
    const next = this.#redoStamps.pop();
    this.#undoStamps.push(this.#stamp);
    this.#stamp = next ?? this.#nextStamp++;
    this.#emit();
    return true;
  }

  /** Başarılı kayıttan sonra çağrılır: mevcut durum yeni temiz taban olur. */
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

  public getPixel(x: number, y: number): Rgba {
    return this.surface.getPixel(x, y);
  }

  /** Kaydedilecek tam RGBA tamponu. */
  public toRgba(): Uint8ClampedArray {
    return this.surface.toRgba();
  }

  #emit(): void {
    this.#onChange?.(this.getState());
  }
}
