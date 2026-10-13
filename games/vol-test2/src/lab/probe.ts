import { RingStats } from '@/app/ringStats';

/** Kare aralığı bu süreyi aşarsa kare değil duraklamadır (arka plan sekmesi, hata ayıklayıcı); ölçüme girmez. */
export const STALL_MS = 1000;

/** Bir ölçüm dizisinin özeti. Boş dizide hepsi 0'dır; `count` boşluğu ayırt eder. */
export interface Summary {
  readonly count: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export interface FrameSummary {
  /** Sıfırlamadan beri ölçülen kare sayısı. */
  readonly frames: number;
  /** `STALL_MS`i aşan, ölçüme alınmayan aralık sayısı. */
  readonly stalls: number;
  /** Kare aralığının ortalamasından: 1000 / ortalama aralık. Tavan (vsync) altında anlamlıdır. */
  readonly fps: number;
  /** Ardışık iki karenin başlangıcı arası. Ekran yenileme hızı bunu tavanlar. */
  readonly intervalMs: Summary;
  /** Kare başından çizim sonuna CPU süresi (güncelleme + çizim komutlarını hazırlama). */
  readonly workMs: Summary;
  /** Yalnız sahne güncellemesi. */
  readonly updateMs: Summary;
  /** Yalnız çizim komutlarının hazırlanması; GPU'nun yaptığı iş buraya girmez. */
  readonly renderMs: Summary;
  /** Eşiği aşan kare aralığı sayıları (toplamdan, pencereden bağımsız). */
  readonly longFrames: {
    readonly over33: number;
    readonly over50: number;
    readonly over100: number;
  };
}

function summarize(ring: RingStats): Summary {
  return {
    count: ring.count,
    mean: ring.mean(),
    p50: ring.percentile(0.5),
    p95: ring.percentile(0.95),
    p99: ring.percentile(0.99),
    max: ring.percentile(1),
  };
}

/**
 * Kare başına ölçüm: Phaser'ın `prestep`, `prerender` ve `postrender` olaylarından beslenir.
 * Yüzdelikler son `windowSamples` kareden gelir; sayaçlar sıfırlamadan beri toplamdır.
 * Tahsis yapmaz: ölçüm aracı ölçtüğü kareyi bozmamalı.
 */
export class FrameProbe {
  private readonly interval: RingStats;
  private readonly work: RingStats;
  private readonly update: RingStats;
  private readonly render: RingStats;
  private lastBegin: number | null = null;
  private renderAt: number | null = null;
  private beginAt: number | null = null;
  private frames = 0;
  private stalls = 0;
  private over33 = 0;
  private over50 = 0;
  private over100 = 0;

  constructor(windowSamples = 4096) {
    this.interval = new RingStats(windowSamples);
    this.work = new RingStats(windowSamples);
    this.update = new RingStats(windowSamples);
    this.render = new RingStats(windowSamples);
  }

  /** Kare başlangıcı (`prestep`). */
  begin(now: number): void {
    if (this.lastBegin !== null) {
      const gap = now - this.lastBegin;
      if (gap > STALL_MS) {
        this.stalls++;
      } else {
        this.interval.push(gap);
        if (gap > 33.4) this.over33++;
        if (gap > 50) this.over50++;
        if (gap > 100) this.over100++;
      }
    }
    this.lastBegin = now;
    this.beginAt = now;
    this.renderAt = null;
  }

  /** Güncelleme bitti, çizim başlıyor (`prerender`). */
  renderStart(now: number): void {
    if (this.beginAt === null) return;
    this.renderAt = now;
  }

  /** Kare bitti (`postrender`). Başlangıcı görülmemiş kare sayılmaz. */
  end(now: number): void {
    if (this.beginAt === null) return;
    this.frames++;
    this.work.push(now - this.beginAt);
    if (this.renderAt !== null) {
      this.update.push(this.renderAt - this.beginAt);
      this.render.push(now - this.renderAt);
    }
    this.beginAt = null;
    this.renderAt = null;
  }

  /** Ölçümü sıfırlar: ısınma bitince ya da yeni koşuda çağrılır. Duraklama sayacı da sıfırlanır. */
  reset(): void {
    this.interval.clear();
    this.work.clear();
    this.update.clear();
    this.render.clear();
    this.lastBegin = null;
    this.beginAt = null;
    this.renderAt = null;
    this.frames = 0;
    this.stalls = 0;
    this.over33 = 0;
    this.over50 = 0;
    this.over100 = 0;
  }

  summary(): FrameSummary {
    const intervalMs = summarize(this.interval);
    return {
      frames: this.frames,
      stalls: this.stalls,
      fps: intervalMs.mean > 0 ? 1000 / intervalMs.mean : 0,
      intervalMs,
      workMs: summarize(this.work),
      updateMs: summarize(this.update),
      renderMs: summarize(this.render),
      longFrames: { over33: this.over33, over50: this.over50, over100: this.over100 },
    };
  }
}
