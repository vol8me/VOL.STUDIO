import type { DocPath } from '../doc/path';
import { samePath } from '../doc/path';

export type ChannelView =
  | 'final'
  | 'coverage'
  | 'height'
  | 'material'
  | 'shade'
  | 'normal'
  | 'outline';

export type PreviewLayout = 'single' | 'tile3x3';

export type EditorListener = () => void;

/**
 * BELGEYE YAZILMAYAN editör durumu — §8.4.
 *
 * Seçim, yakınlaştırma, kanal ve **görünürlük/kilit** burada yaşar. Görünürlük
 * özellikle önemli: Tur 4'ün kanıtı "editörde kurulan belge CLI'dan birebir
 * aynı PNG'yi verir" olduğu için, gizlenen bir katman render'ı ETKİLEMEZ.
 * Kapatma niyeti belgede zaten `opacity: 0` ile ifade edilebiliyor.
 */
export class EditorState {
  private readonly listeners = new Set<EditorListener>();
  private readonly hidden = new Set<string>();
  private readonly locked = new Set<string>();

  selectedLayer = 0;
  selectedNode: DocPath | null = null;
  channel: ChannelView = 'final';
  layout: PreviewLayout = 'single';
  zoom = 4;
  /** Nicemleme öncesi ham gölgeyi göstermek için. */
  showPreQuantize = false;

  subscribe(listener: EditorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isHidden(layerId: string): boolean {
    return this.hidden.has(layerId);
  }

  isLocked(layerId: string): boolean {
    return this.locked.has(layerId);
  }

  get hiddenCount(): number {
    return this.hidden.size;
  }

  toggleHidden(layerId: string): void {
    if (!this.hidden.delete(layerId)) this.hidden.add(layerId);
    this.emit();
  }

  toggleLocked(layerId: string): void {
    if (!this.locked.delete(layerId)) this.locked.add(layerId);
    this.emit();
  }

  selectLayer(index: number): void {
    this.selectedLayer = index;
    this.selectedNode = null;
    this.emit();
  }

  selectNode(path: DocPath | null): void {
    if (path !== null && this.selectedNode !== null && samePath(path, this.selectedNode)) return;
    this.selectedNode = path;
    this.emit();
  }

  setChannel(channel: ChannelView): void {
    this.channel = channel;
    this.emit();
  }

  setLayout(layout: PreviewLayout): void {
    this.layout = layout;
    this.emit();
  }

  setZoom(zoom: number): void {
    // Piksel sanatı TAMSAYI ölçekte değerlendirilir; kesirli ölçek yanıltır
    // (§8.9).
    this.zoom = Math.max(1, Math.round(zoom));
    this.emit();
  }

  setShowPreQuantize(value: boolean): void {
    this.showPreQuantize = value;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
