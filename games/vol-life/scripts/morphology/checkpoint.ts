import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * İş birimi başına JSONL checkpoint (E12). Yarıda kesilen koşu kaldığı yerden
 * devam eder; kesintisiz koşuyla AYNI sonucu vermelidir.
 *
 * Config digest'i her satırda taşınır: farklı bir yapılandırmadan kalan kayıt
 * sessizce kullanılırsa koşu kendi sonucunu kirletir.
 */
export interface CheckpointRecord<TPayload> {
  readonly workId: string;
  readonly configDigest: string;
  readonly payload: TPayload;
}

export class CheckpointStore<TPayload> {
  private readonly completed = new Map<string, TPayload>();

  constructor(
    private readonly filePath: string,
    private readonly configDigest: string,
  ) {
    this.load();
  }

  /** Digest'i tutmayan satırlar YOK SAYILIR, sessizce kabul edilmez. */
  private load(): void {
    if (!existsSync(this.filePath)) return;
    for (const line of readFileSync(this.filePath, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      const record = JSON.parse(line) as CheckpointRecord<TPayload>;
      if (record.configDigest !== this.configDigest) continue;
      this.completed.set(record.workId, record.payload);
    }
  }

  has(workId: string): boolean {
    return this.completed.has(workId);
  }

  get(workId: string): TPayload | undefined {
    return this.completed.get(workId);
  }

  get completedCount(): number {
    return this.completed.size;
  }

  record(workId: string, payload: TPayload): void {
    this.completed.set(workId, payload);
    mkdirSync(dirname(this.filePath), { recursive: true });
    const record: CheckpointRecord<TPayload> = { workId, configDigest: this.configDigest, payload };
    appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }
}

export interface ProgressEstimate {
  readonly completed: number;
  readonly total: number;
  readonly meanMsPerUnit: number;
  readonly remainingMs: number;
}

/** ETA ölçülen birim maliyetinden çıkar; sabit bir tahmin yazılmaz. */
export function estimateProgress(
  completed: number,
  total: number,
  elapsedMs: number,
): ProgressEstimate {
  const meanMsPerUnit = completed > 0 ? elapsedMs / completed : 0;
  const remaining = Math.max(0, total - completed);
  return { completed, total, meanMsPerUnit, remainingMs: meanMsPerUnit * remaining };
}

export function formatEta(estimate: ProgressEstimate): string {
  if (estimate.completed === 0) return 'ETA: ölçülmedi';
  const seconds = Math.round(estimate.remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `ETA: ~${minutes} dk ${seconds % 60} sn (${estimate.completed}/${estimate.total})`;
}
