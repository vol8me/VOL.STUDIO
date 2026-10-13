import { open, readFile, type FileHandle } from 'node:fs/promises';
import { ByteReader, ByteWriter, crc32 } from '@/net/bytes';
import { readCommand, writeCommand, type FactoryCommand } from '@/sim/commands';

/**
 * Komut günlüğü: anlık görüntüden sonra gelen her kabul edilmiş komut ve düzenli kalp atışları.
 * Çerçeve `[uzunluk u32][crc32 u32][yük]`; kesik veya bozuk kuyruk okuyucuda ilk kötü çerçevede
 * durur. Ack, kayıt `commit()` ile kalıcı olduktan sonra gönderilir.
 */
const MAGIC = 0x4c4a4656; // "VFJL"
const VERSION = 1;
const HEADER_BYTES = 16;
const MAX_RECORD_BYTES = 1024;

export const RECORD = { command: 1, beat: 2 } as const;

export interface JournalHeader {
  readonly baseTick: number;
  readonly epoch: number;
}

export type JournalRecord =
  | {
      readonly kind: typeof RECORD.command;
      readonly tick: number;
      readonly key: string;
      readonly seq: number;
      readonly command: FactoryCommand;
    }
  | { readonly kind: typeof RECORD.beat; readonly tick: number; readonly hash: number };

export function encodeCommandRecord(
  tick: number,
  key: string,
  seq: number,
  command: FactoryCommand,
): Uint8Array {
  const out = new ByteWriter(64);
  out.u8(RECORD.command);
  out.u32(tick);
  out.u32(seq);
  const encoded = new TextEncoder().encode(key);
  out.u8(encoded.length);
  out.bytes(encoded);
  writeCommand(out, command);
  return out.finish();
}

export function encodeBeatRecord(tick: number, hash: number): Uint8Array {
  const out = new ByteWriter(9);
  out.u8(RECORD.beat);
  out.u32(tick);
  out.u32(hash);
  return out.finish();
}

function frame(payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_RECORD_BYTES) throw new RangeError('Günlük kaydı çok büyük.');
  const out = new ByteWriter(payload.length + 8);
  out.u32(payload.length);
  out.u32(crc32(payload));
  out.bytes(payload);
  return out.finish();
}

function decode(payload: Uint8Array): JournalRecord {
  const input = new ByteReader(payload);
  const kind = input.u8();
  const tick = input.u32();
  if (kind === RECORD.beat) {
    const hash = input.u32();
    if (input.remaining !== 0) throw new RangeError('Kalp atışı kaydında artık bayt var.');
    return { kind, tick, hash };
  }
  if (kind !== RECORD.command) throw new RangeError(`Bilinmeyen günlük kaydı: ${kind}`);
  const seq = input.u32();
  const key = new TextDecoder().decode(input.bytes(input.u8()));
  const command = readCommand(input);
  if (command === null) throw new RangeError('Günlükteki komut bilinmiyor.');
  if (input.remaining !== 0) throw new RangeError('Komut kaydında artık bayt var.');
  return { kind, tick, key, seq, command };
}

export interface JournalRead {
  readonly header: JournalHeader;
  readonly records: JournalRecord[];
  /** Geçerli çerçevelerin bittiği bayt konumu; bundan sonrası kesik/bozuk kuyruktur. */
  readonly validBytes: number;
  readonly torn: boolean;
}

/** Dosyayı okur. Başlığı bozuk dosya `null` verir; kesik kuyruk hata değil `torn` bayrağıdır. */
export async function readJournal(path: string): Promise<JournalRead | null> {
  const bytes = new Uint8Array(await readFile(path));
  if (bytes.length < HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== VERSION) return null;
  const header: JournalHeader = {
    baseTick: view.getUint32(8, true),
    epoch: view.getUint32(12, true),
  };
  const records: JournalRecord[] = [];
  let at = HEADER_BYTES;
  let torn = false;
  while (at < bytes.length) {
    if (at + 8 > bytes.length) {
      torn = true;
      break;
    }
    const length = view.getUint32(at, true);
    if (length === 0 || length > MAX_RECORD_BYTES || at + 8 + length > bytes.length) {
      torn = true;
      break;
    }
    const payload = bytes.subarray(at + 8, at + 8 + length);
    if (crc32(payload) !== view.getUint32(at + 4, true)) {
      torn = true;
      break;
    }
    try {
      records.push(decode(payload));
    } catch {
      torn = true;
      break;
    }
    at += 8 + length;
  }
  return { header, records, validBytes: at, torn };
}

export interface JournalStats {
  appended: number;
  writes: number;
  fsyncs: number;
  bytes: number;
  lastFsyncMs: number;
  maxFsyncMs: number;
}

export function emptyJournalStats(): JournalStats {
  return { appended: 0, writes: 0, fsyncs: 0, bytes: 0, lastFsyncMs: 0, maxFsyncMs: 0 };
}

/**
 * Tek yazarlı, grup onaylı günlük. `append` anında döner; `commit` o ana kadar eklenenlerin
 * kalıcı olduğunu bekler. Eşzamanlı çağrılar tek `write`+`fsync` çevrimini paylaşır.
 */
export class JournalWriter {
  private pending: Uint8Array[] = [];
  private appended = 0;
  private durable = 0;
  private flushing: Promise<void> | null = null;
  private failure: Error | null = null;
  private closed = false;

  private constructor(
    private readonly opening: Promise<FileHandle>,
    readonly path: string,
    private readonly clock: () => number,
    /** Verilen sayaç nesnesi günlük değişimlerinde paylaşılır; sayılar dosya başına sıfırlanmaz. */
    readonly stats: JournalStats,
  ) {
    // Açılış hatası ilk `commit`te görünür; burada yutulmuş bir reddedilmiş söz kalmaz.
    opening.catch((error: unknown) => {
      this.failure ??= error instanceof Error ? error : new Error(String(error));
    });
  }

  /**
   * Günlüğü eşzamanlı olarak kurar, dosyayı arka planda açar. Kayıtlar dosya açılana kadar
   * bellekte bekler; böylece simülasyon bir adım sınırında günlük değiştirirken beklemez.
   */
  static begin(
    path: string,
    header: JournalHeader,
    clock: () => number = () => performance.now(),
    stats: JournalStats = emptyJournalStats(),
  ): JournalWriter {
    const opening = (async () => {
      const handle = await open(path, 'wx');
      const out = new ByteWriter(HEADER_BYTES);
      out.u32(MAGIC);
      out.u32(VERSION);
      out.u32(header.baseTick);
      out.u32(header.epoch);
      await handle.write(out.finish());
      await handle.sync();
      return handle;
    })();
    return new JournalWriter(opening, path, clock, stats);
  }

  /** `begin` ve başlığın kalıcı olmasını bekler. */
  static async create(
    path: string,
    header: JournalHeader,
    clock: () => number = () => performance.now(),
  ): Promise<JournalWriter> {
    const writer = JournalWriter.begin(path, header, clock);
    await writer.opening;
    return writer;
  }

  get error(): Error | null {
    return this.failure;
  }

  append(payload: Uint8Array): void {
    if (this.closed) throw new Error('Günlük kapalı.');
    if (this.failure) throw this.failure;
    const framed = frame(payload);
    this.pending.push(framed);
    this.appended++;
    this.stats.appended++;
    this.stats.bytes += framed.length;
  }

  /** Şimdiye kadar eklenenler kalıcı olunca çözülür; yazma hatasında reddeder. */
  commit(): Promise<void> {
    const target = this.appended;
    if (this.failure) return Promise.reject(this.failure);
    if (this.durable >= target) return Promise.resolve();
    this.flushing ??= this.drain();
    return this.flushing.then(() => {
      if (this.failure) throw this.failure;
      if (this.durable < target) return this.commit();
    });
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending.length > 0) {
        const batch = this.pending;
        const upTo = this.appended;
        this.pending = [];
        const size = batch.reduce((sum, part) => sum + part.length, 0);
        const joined = new Uint8Array(size);
        let at = 0;
        for (const part of batch) {
          joined.set(part, at);
          at += part.length;
        }
        const handle = await this.opening;
        await handle.write(joined);
        this.stats.writes++;
        const started = this.clock();
        await handle.sync();
        const elapsed = this.clock() - started;
        this.stats.fsyncs++;
        this.stats.lastFsyncMs = elapsed;
        this.stats.maxFsyncMs = Math.max(this.stats.maxFsyncMs, elapsed);
        this.durable = upTo;
      }
    } catch (error) {
      this.failure = error instanceof Error ? error : new Error(String(error));
    } finally {
      this.flushing = null;
    }
  }

  /** Bekleyenleri kalıcı yapıp dosyayı kapatır. */
  async close(): Promise<void> {
    if (this.closed) return;
    try {
      if (!this.failure) await this.commit();
    } finally {
      this.closed = true;
      await (await this.opening).close().catch(() => undefined);
    }
  }
}
