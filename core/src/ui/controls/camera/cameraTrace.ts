export interface CameraTraceEntry {
  readonly kind: 'event' | 'frame';
  readonly timeMs: number;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * DEV iz kaydedici (D1). Halka tampon: uzun oturumda bellek büyümez. Üretimde
 * ÇAĞRILMAZ — kaydedici yalnız açıkça etkinleştirilirse yazar, bu yüzden
 * bundle maliyeti kapalı hâlde bir boolean kontrolüdür.
 */
export class CameraTrace {
  private readonly entries: CameraTraceEntry[] = [];
  private cursor = 0;
  private enabled = false;

  constructor(private readonly capacity = 512) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  record(entry: CameraTraceEntry): void {
    if (!this.enabled) return;
    if (this.entries.length < this.capacity) {
      this.entries.push(entry);
      return;
    }
    this.entries[this.cursor] = entry;
    this.cursor = (this.cursor + 1) % this.capacity;
  }

  /** Kayıt sırası KORUNUR: halka tamponun okuma sırası yazma sırasıdır. */
  snapshot(): CameraTraceEntry[] {
    if (this.entries.length < this.capacity) return [...this.entries];
    return [...this.entries.slice(this.cursor), ...this.entries.slice(0, this.cursor)];
  }

  toJson(): string {
    return JSON.stringify(this.snapshot());
  }

  clear(): void {
    this.entries.length = 0;
    this.cursor = 0;
  }
}
