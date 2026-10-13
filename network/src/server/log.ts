import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Bir günlük satırı: makine ve ajan okur, alanlar sabittir. */
export interface LogRecord {
  /** Süreç içinde artan sıra numarası; `since` ile artımlı okuma bunu kullanır. */
  readonly seq: number;
  /** ISO-8601 UTC zaman damgası. */
  readonly t: string;
  readonly lvl: LogLevel;
  /** Kaynak: `room:lab`, `host`, `ops`. */
  readonly src: string;
  /** Olay adı: `join`, `leave`, `listening`. Boşluksuz, küçük harfli, noktalı. */
  readonly ev: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface LogSink {
  write(record: LogRecord, line: string): void;
  close?(): void;
}

export interface LoggerOptions {
  readonly src: string;
  readonly level?: LogLevel;
  readonly sinks?: readonly LogSink[];
  /** Bellekteki halka kapasitesi; HTTP üzerinden artımlı okuma buradan yapılır. */
  readonly capacity?: number;
  readonly now?: () => Date;
}

export interface LogPage {
  readonly records: readonly LogRecord[];
  /** Sonraki çağrıda `since` olarak verilecek sıra numarası. */
  readonly next: number;
  /** İstenen aralıkta halkadan düşmüş kayıt sayısı. */
  readonly dropped: number;
}

interface Shared {
  readonly sinks: readonly LogSink[];
  readonly ring: (LogRecord | undefined)[];
  readonly now: () => Date;
  level: LogLevel;
  seq: number;
}

/** Hata nesnesini günlüğe konabilir hale getirir; yığın ilk beş satırla sınırlıdır. */
export function errorData(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    };
  }
  return { message: String(error) };
}

function safeStringify(record: LogRecord): string {
  try {
    return JSON.stringify(record, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
  } catch {
    return JSON.stringify({ ...record, data: { unserializable: true } });
  }
}

/**
 * Yapılandırılmış JSONL günlüğü. Her kayıt bir satırdır; aynı kayıtlar sınırlı bir halkada da tutulur,
 * böylece sunucuyu başlatan ajan çıktıyı kuyruklamadan `/logs` ile artımlı okuyabilir.
 */
export class Logger {
  private constructor(
    private readonly shared: Shared,
    readonly src: string,
  ) {}

  static create(options: LoggerOptions): Logger {
    const capacity = options.capacity ?? 2000;
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new RangeError('Günlük halkası pozitif tam sayı olmalı.');
    return new Logger(
      {
        sinks: options.sinks ?? [],
        ring: new Array<LogRecord | undefined>(capacity).fill(undefined),
        now: options.now ?? (() => new Date()),
        level: options.level ?? 'info',
        seq: 0,
      },
      options.src,
    );
  }

  child(src: string): Logger {
    return new Logger(this.shared, src);
  }

  get lastSeq(): number {
    return this.shared.seq;
  }

  setLevel(level: LogLevel): void {
    this.shared.level = level;
  }

  log(lvl: LogLevel, ev: string, data?: Record<string, unknown>): void {
    const shared = this.shared;
    if (ORDER[lvl] < ORDER[shared.level]) return;
    const record: LogRecord = {
      seq: ++shared.seq,
      t: shared.now().toISOString(),
      lvl,
      src: this.src,
      ev,
      ...(data ? { data } : {}),
    };
    shared.ring[(record.seq - 1) % shared.ring.length] = record;
    const line = safeStringify(record);
    for (const sink of shared.sinks) {
      try {
        sink.write(record, line);
      } catch {
        // Günlük yazımı sunucuyu düşürmez.
      }
    }
  }

  debug(ev: string, data?: Record<string, unknown>): void {
    this.log('debug', ev, data);
  }

  info(ev: string, data?: Record<string, unknown>): void {
    this.log('info', ev, data);
  }

  warn(ev: string, data?: Record<string, unknown>): void {
    this.log('warn', ev, data);
  }

  error(ev: string, data?: Record<string, unknown>): void {
    this.log('error', ev, data);
  }

  /** `seq > since` olan kayıtlar, en çok `limit` tane; `minLevel` altındakiler elenir. */
  since(since = 0, limit = 200, minLevel: LogLevel = 'debug'): LogPage {
    const { ring, seq } = this.shared;
    const capacity = ring.length;
    const oldest = Math.max(1, seq - capacity + 1);
    const start = Math.max(since + 1, oldest);
    const dropped = Math.max(0, start - (since + 1));
    const records: LogRecord[] = [];
    let next = Math.min(since, seq);
    for (let index = start; index <= seq && records.length < limit; index++) {
      const record = ring[(index - 1) % capacity];
      next = index;
      if (record && ORDER[record.lvl] >= ORDER[minLevel]) records.push(record);
    }
    return { records, next, dropped };
  }

  close(): void {
    for (const sink of this.shared.sinks) sink.close?.();
  }
}

/** Her kaydı standart çıktıya bir satır olarak yazar. */
export function stdoutSink(
  write: (text: string) => void = (text) => process.stdout.write(text),
): LogSink {
  return { write: (_record, line) => write(`${line}\n`) };
}

/**
 * Kayıtları dosyaya ekler. Satırlar bellekte biriktirilir ve `flushMs` aralığında ya da kapanışta tek
 * yazımla diske verilir; süreç `SIGKILL` ile ölürse son aralığın satırları kaybolabilir.
 */
export function fileSink(path: string, flushMs = 250): LogSink {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'a');
  let buffer: string[] = [];
  let closed = false;
  const flush = (): void => {
    if (closed || buffer.length === 0) return;
    const text = buffer.join('');
    buffer = [];
    try {
      writeSync(fd, text);
    } catch {
      // Disk dolu ya da kapalıysa günlük sessizce düşer; sunucu çalışmaya devam eder.
    }
  };
  const timer = setInterval(flush, flushMs);
  timer.unref();
  return {
    write: (_record, line) => {
      if (!closed) buffer.push(`${line}\n`);
    },
    close: () => {
      if (closed) return;
      clearInterval(timer);
      flush();
      closed = true;
      closeSync(fd);
    },
  };
}
