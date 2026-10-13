/** Laboratuvar günlüğü: sunucu günlüğüyle (`network` `LogRecord`) aynı alanlar, aynı artımlı okuma. */

export type LabLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Readonly<Record<LabLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Bir günlük satırı. Alanlar sabittir; ajan sunucu ve tarayıcı günlüğünü aynı dilbilgisiyle okur. */
export interface LabRecord {
  /** Oturum içinde artan sıra numarası; `since` ile artımlı okuma bunu kullanır. */
  readonly seq: number;
  /** ISO-8601 UTC zaman damgası. */
  readonly t: string;
  /** Sayfa açılışından beri geçen süre (ms): kare ölçümleriyle aynı saat. */
  readonly ms: number;
  readonly lvl: LabLevel;
  /** Kaynak: `lab`, `workload`, `page`, `net`. */
  readonly src: string;
  /** Olay adı: noktalı, küçük harfli (`run.start`, `sample`, `longtask`). */
  readonly ev: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface LabPage {
  readonly records: readonly LabRecord[];
  /** Sonraki çağrıda `since` olarak verilecek sıra numarası. */
  readonly next: number;
  /** İstenen aralıkta halkadan düşmüş kayıt sayısı. */
  readonly dropped: number;
}

/**
 * Sabit kapasiteli halka. Halka dolunca en eskisi düşer ama `counts` ömür boyu sayar: uyarı ve hata
 * sayısı halkadan düşen kayıtla kaybolmaz, yargı onlara dayanır.
 */
export class LabLog {
  private readonly ring: (LabRecord | undefined)[];
  private seq = 0;
  readonly counts: Record<LabLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };

  constructor(
    capacity = 4000,
    private readonly now: () => Date = () => new Date(),
    private readonly clock: () => number = () => performance.now(),
  ) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new RangeError('LabLog kapasitesi pozitif tamsayı olmalı');
    this.ring = new Array<LabRecord | undefined>(capacity);
  }

  /** Son verilen sıra numarası; hiç kayıt yoksa 0. */
  get head(): number {
    return this.seq;
  }

  log(lvl: LabLevel, src: string, ev: string, data?: Record<string, unknown>): LabRecord {
    this.seq++;
    this.counts[lvl]++;
    const record: LabRecord = {
      seq: this.seq,
      t: this.now().toISOString(),
      ms: Math.round(this.clock() * 10) / 10,
      lvl,
      src,
      ev,
      ...(data === undefined ? {} : { data }),
    };
    this.ring[(this.seq - 1) % this.ring.length] = record;
    return record;
  }

  info(src: string, ev: string, data?: Record<string, unknown>): LabRecord {
    return this.log('info', src, ev, data);
  }

  warn(src: string, ev: string, data?: Record<string, unknown>): LabRecord {
    return this.log('warn', src, ev, data);
  }

  error(src: string, ev: string, data?: Record<string, unknown>): LabRecord {
    return this.log('error', src, ev, data);
  }

  /** `seq > since` olan kayıtlar, en çok `limit` tane; `minLevel` altındakiler elenir. */
  since(since = 0, limit = 200, minLevel: LabLevel = 'debug'): LabPage {
    const capacity = this.ring.length;
    const oldest = Math.max(1, this.seq - capacity + 1);
    const start = Math.max(since + 1, oldest);
    const dropped = Math.max(0, start - (since + 1));
    const records: LabRecord[] = [];
    let next = Math.min(since, this.seq);
    for (let index = start; index <= this.seq && records.length < limit; index++) {
      const record = this.ring[(index - 1) % capacity];
      next = index;
      if (record && ORDER[record.lvl] >= ORDER[minLevel]) records.push(record);
    }
    return { records, next, dropped };
  }
}
