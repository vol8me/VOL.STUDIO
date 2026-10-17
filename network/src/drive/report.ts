import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** JSONL satırının ortak alanları: `t` koşu başından bu yana ms, `ev` noktalı olay adı. */
export interface ReportRecord {
  readonly t: number;
  readonly ev: string;
  readonly [key: string]: unknown;
}

/**
 * Yük koşusunun makine-okunur kaydı: her satır bir JSON nesnesi. Dosyaya ya da belleğe yazılır
 * (testte). Yazım koşuyu düşürmez; dosya hatası sayılır ve `failed` ile görünür.
 */
export class JsonlReport {
  private stream: WriteStream | null = null;
  private lines: ReportRecord[] | null = null;
  private failures = 0;
  private readonly startedAt: number;

  private constructor(private readonly now: () => number) {
    this.startedAt = now();
  }

  /** Dosyaya ekler; üst dizin yoksa kurulur. */
  static toFile(path: string, now: () => number = () => performance.now()): JsonlReport {
    const report = new JsonlReport(now);
    mkdirSync(dirname(path), { recursive: true });
    report.stream = createWriteStream(path, { flags: 'a', encoding: 'utf8' });
    report.stream.on('error', () => report.failures++);
    return report;
  }

  /** Bellekte tutar (`records`); testler ve çağıran kodun kendi işlemesi içindir. */
  static toMemory(now: () => number = () => performance.now()): JsonlReport {
    const report = new JsonlReport(now);
    report.lines = [];
    return report;
  }

  get records(): readonly ReportRecord[] {
    return this.lines ?? [];
  }

  /** Dosya yazımı kaç kez hata verdi. */
  get failed(): number {
    return this.failures;
  }

  write(ev: string, data: Record<string, unknown> = {}): void {
    const record: ReportRecord = { t: Math.round(this.now() - this.startedAt), ev, ...data };
    this.lines?.push(record);
    this.stream?.write(`${JSON.stringify(record)}\n`);
  }

  close(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    if (!stream) return Promise.resolve();
    return new Promise((resolve) => stream.end(resolve));
  }
}
