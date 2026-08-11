import '../ui/debug.css';
import type {
  DiagnosticsSnapshot,
  DiagnosticsOptions,
  InputSnapshot,
  DiagnosticsEvent,
  StatsSummary,
  ScreenInfo,
} from './types';

/** Kayan istatistik penceresinin ornek sayisi. */
const SAMPLE_WINDOW = 60;

interface RollingStats {
  values: number[];
  min: number;
  max: number;
  sum: number;
}

/**
 * Oyun performans ve input metriklerini toplayan geliştirme aracı.
 * URL'de `?debug` veya `?perf` varsa `createVolGame` tarafından oluşturulur.
 * Sahneler `getInstance()` üzerinden anlık metrik/event gönderebilir.
 */
export class Diagnostics {
  private static instance: Diagnostics | null = null;

  private readonly gameId: string;
  private readonly sampleEvery: number;
  private readonly serverUrl: string;
  private readonly overlay: boolean;
  /** Aktif asamalarin baslangic damgalari — sureden AYRI tutulur (bkz. endStage). */
  private readonly stageStarts = new Map<string, number>();
  private readonly stageTimes = new Map<string, number>();
  private readonly counts = new Map<string, number>();
  private readonly pendingEvents: DiagnosticsEvent[] = [];
  private readonly updateStats: RollingStats = { values: [], min: 0, max: 0, sum: 0 };
  private readonly renderStats: RollingStats = { values: [], min: 0, max: 0, sum: 0 };
  private readonly frameStats: RollingStats = { values: [], min: 0, max: 0, sum: 0 };
  private startTime = 0;
  private lastFrameTime = 0;
  private lastEndTime = 0;
  private frameCount = 0;
  private currentScene?: string;
  private currentInput: InputSnapshot = { activeProvider: 'none' };
  private panel?: HTMLDivElement;
  private readonly onVisibilityChange: () => void;

  constructor(options: DiagnosticsOptions) {
    if (Diagnostics.instance) {
      throw new Error(
        'Diagnostics zaten oluşturulmuş; tekrar new ile yaratmak yerine getInstance() kullan.',
      );
    }
    this.gameId = options.gameId;
    this.sampleEvery = Math.max(1, options.sampleEvery ?? 60);
    this.serverUrl = options.serverUrl ?? 'http://127.0.0.1:9876/debug';
    this.overlay = options.overlay ?? true;

    if (this.overlay && typeof document !== 'undefined') {
      this.panel = document.createElement('div');
      // Stil CSS'te (debug.css): satir ici cssText hem tasarim sistemini baypas
      // ediyor hem Tauri CSP'sinde style-src 'unsafe-inline' tutmayi zorunlu kiliyordu.
      this.panel.className = 'vol-diagnostics-panel';
      document.body.appendChild(this.panel);
    }

    this.onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        this.markResume();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    Diagnostics.instance = this;
  }

  /** Global erişim noktası; sahne ve entity'ler buradan çağırır. */
  static getInstance(): Diagnostics | null {
    return Diagnostics.instance;
  }

  /** Bellekteki instance'ı sıfırlar; genellikle testler için. */
  static reset(): void {
    Diagnostics.instance?.destroy();
    Diagnostics.instance = null;
  }

  setScene(scene: string): void {
    this.currentScene = scene;
  }

  /**
   * Duraklatmadan dönüşte veya sahne yeniden başlatıldığında zaman
   * baz çizgisini sıfırlar. Böylece pause/alt-tab süresi frame istatistiğine
   * yansımaz, FPS anlık olarak düşmez.
   */
  markResume(): void {
    const now = performance.now();
    this.lastFrameTime = now;
    this.lastEndTime = now;
  }

  setInput(snapshot: InputSnapshot): void {
    this.currentInput = snapshot;
  }

  /** Yeni kare ölçümüne başla. */
  beginFrame(): void {
    const now = performance.now();

    if (this.lastEndTime > 0) {
      this.pushSample(this.renderStats, now - this.lastEndTime);
    }

    this.startTime = now;
    this.stageStarts.clear();
    this.stageTimes.clear();
  }

  /** Bir update aşamasını zamanla. */
  startStage(name: string): void {
    this.stageStarts.set(name, performance.now());
  }

  /**
   * Asamayi bitirir. Baslangic damgasi ile sure AYRI map'lerde tutulur: tek
   * map'te tutulup uzerine yazilirsa ikinci bir endStage() cagrisi
   * `now - sure` hesaplayip devasa bir cop deger yazar ve overlay sessizce
   * yanlis veri gosterir.
   */
  endStage(name: string): void {
    const start = this.stageStarts.get(name);
    if (start === undefined) return;
    this.stageStarts.delete(name);
    this.stageTimes.set(name, performance.now() - start);
  }

  /** Sayısal metrik ekle. */
  setCount(name: string, value: number): void {
    this.counts.set(name, value);
  }

  /** Oyun içi olay kaydet — sonraki snapshot'a kadar buffer'da tutulur. */
  recordEvent(type: string, data?: unknown): void {
    this.pendingEvents.push({ type, t: performance.now(), data });
  }

  /** Kareyi bitir ve periyodik olarak gönder. */
  endFrame(): void {
    const now = performance.now();
    const updateTime = now - this.startTime;
    this.pushSample(this.updateStats, updateTime);

    if (this.lastFrameTime > 0) {
      const frameTime = now - this.lastFrameTime;
      this.pushSample(this.frameStats, frameTime);
    }

    this.lastFrameTime = now;
    this.lastEndTime = now;

    this.frameCount++;
    if (this.frameCount % 10 === 0) {
      this.renderOverlay();
    }
    if (this.frameCount % this.sampleEvery === 0) {
      this.sendSnapshot();
    }
  }

  destroy(): void {
    this.panel?.remove();
    this.panel = undefined;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (Diagnostics.instance === this) {
      Diagnostics.instance = null;
    }
  }

  /**
   * Ornek ekler. min/max her cagrida `Math.min(...values)` ile hesaplanmiyordu
   * artik: 60 elemanlik spread x 3 istatistik x her kare, olcum aracinin kendi
   * maliyetini olctugu metrigin mertebesine cikariyordu. Yalnizca pencereden
   * eleman dustugunde tam tarama yapilir.
   */
  private pushSample(stats: RollingStats, value: number): void {
    stats.values.push(value);
    stats.sum += value;

    if (stats.values.length > SAMPLE_WINDOW) {
      const removed = stats.values.shift()!;
      stats.sum -= removed;
      // Dusen deger uc degerlerden biriyse tam tarama kacinilmaz.
      if (removed === stats.min || removed === stats.max) {
        this.recomputeExtremes(stats);
        return;
      }
    } else if (stats.values.length === 1) {
      stats.min = value;
      stats.max = value;
      return;
    }

    if (value < stats.min) stats.min = value;
    if (value > stats.max) stats.max = value;
  }

  private recomputeExtremes(stats: RollingStats): void {
    let min = Infinity;
    let max = -Infinity;
    for (const sample of stats.values) {
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    stats.min = Number.isFinite(min) ? min : 0;
    stats.max = Number.isFinite(max) ? max : 0;
  }

  private avg(stats: RollingStats): number {
    return stats.values.length > 0 ? stats.sum / stats.values.length : 0;
  }

  private summary(stats: RollingStats): StatsSummary {
    return {
      min: stats.min,
      max: stats.max,
      avg: this.avg(stats),
    };
  }

  private screenInfo(): ScreenInfo {
    if (typeof window === 'undefined') {
      return { width: 0, height: 0, dpr: 1 };
    }
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio ?? 1,
    };
  }

  private buildSnapshot(): DiagnosticsSnapshot {
    const avgFrame = this.avg(this.frameStats);
    return {
      t: performance.now(),
      gameId: this.gameId,
      scene: this.currentScene,
      fps: avgFrame > 0 ? 1000 / avgFrame : 0,
      frame: this.summary(this.frameStats),
      render: this.summary(this.renderStats),
      update: this.summary(this.updateStats),
      stages: Object.fromEntries(this.stageTimes),
      counts: Object.fromEntries(this.counts),
      input: this.currentInput,
      events: [...this.pendingEvents],
      screen: this.screenInfo(),
    };
  }

  private renderOverlay(): void {
    if (!this.panel) return;

    const snapshot = this.buildSnapshot();
    const lines: string[] = [
      `FPS: ${snapshot.fps.toFixed(1)} (avg ${snapshot.frame.avg.toFixed(
        1,
      )}ms) [${snapshot.frame.min.toFixed(1)}-${snapshot.frame.max.toFixed(1)}]`,
      `render: ${snapshot.render.avg.toFixed(2)}ms [${snapshot.render.min.toFixed(
        2,
      )}-${snapshot.render.max.toFixed(2)}]`,
      `update: ${snapshot.update.avg.toFixed(2)}ms [${snapshot.update.min.toFixed(
        2,
      )}-${snapshot.update.max.toFixed(2)}]`,
    ];

    for (const [name, ms] of this.stageTimes) {
      lines.push(`${name}: ${ms.toFixed(2)}ms`);
    }
    for (const [name, value] of this.counts) {
      lines.push(`${name}: ${value}`);
    }

    this.panel.textContent = lines.join('\n');
  }

  private sendSnapshot(): void {
    const snapshot = this.buildSnapshot();
    this.pendingEvents.length = 0;

    void fetch(this.serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(snapshot),
    }).catch(() => {});
  }
}

/** Diagnostics'ın URL'de ?debug veya ?perf varsa aktif olması gerekip geremediğini döner. */
export function isDiagnosticsEnabled(): boolean {
  if (typeof location === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  return params.has('debug') || params.has('perf');
}
