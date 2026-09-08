import '../ui/debug.css';
import { FrameRateSampler, RollingWindow } from '../time/FrameRateSampler';
import { NoopTransport, type DiagnosticsTransport } from './transport';
import type {
  DiagnosticsSnapshot,
  DiagnosticsOptions,
  InputSnapshot,
  DiagnosticsEvent,
  StatsSummary,
  RendererInfo,
  ScreenInfo,
} from './types';

/** Kayan istatistik penceresinin ornek sayısı. */
const SAMPLE_WINDOW = 60;

/**
 * Oyun performans ve input metriklerini toplayan geliştirme aracı.
 * URL'de `?debug` veya `?perf` varsa `createVolGame` tarafından oluşturulur.
 *
 * **Global singleton DEĞİLDİR.** Örnek açıkça oluşturulur (`createDiagnostics`)
 * ve bağımlılık olarak geçirilir.
 *
 * Snapshot'ı nereye göndereceğini bilmez; bunu `transport` belirler
 * (bkz. `DiagnosticsTransport`).
 */
export class Diagnostics {
  private readonly gameId: string;
  private readonly sampleEvery: number;
  private readonly transport: DiagnosticsTransport;
  private readonly overlay: boolean;
  /** Aktif asamalarin başlangıç damgalari — süreden AYRI tutulur (bkz. endStage). */
  private readonly stageStarts = new Map<string, number>();
  private readonly stageTimes = new Map<string, number>();
  private readonly counts = new Map<string, number>();
  private readonly pendingEvents: DiagnosticsEvent[] = [];
  private readonly updateStats = new RollingWindow(SAMPLE_WINDOW);
  private readonly renderStats = new RollingWindow(SAMPLE_WINDOW);
  /** Kare aralığı — `FpsMeter` ile AYNI örnekleyici (bkz. FrameRateSampler). */
  private readonly frameStats = new FrameRateSampler(SAMPLE_WINDOW);
  private startTime = 0;
  private lastEndTime = 0;
  private frameCount = 0;
  private currentScene?: string;
  private currentInput: InputSnapshot = { activeProvider: 'none' };
  /** Besleyen olmazsa `unknown` kalır — "ölçülemedi", "canvas" değil. */
  private renderer: RendererInfo = { kind: 'unknown', requested: 'auto', fellBack: false };
  private panel?: HTMLDivElement;
  private readonly onVisibilityChange: () => void;

  constructor(options: DiagnosticsOptions) {
    this.gameId = options.gameId;
    this.sampleEvery = Math.max(1, options.sampleEvery ?? 60);
    // Varsayılan HİÇBİR YERE göndermemek: CORE'un varsayılan davranışı bir
    // ağ isteği açmak olmamalı. Yerel sunucuya göndermek isteyen tüketici
    // `LocalServerTransport`i açıkça verir.
    this.transport = options.transport ?? new NoopTransport();
    this.overlay = options.overlay ?? true;

    if (this.overlay && typeof document !== 'undefined') {
      this.panel = document.createElement('div');
      // Stil CSS'ten gelir; satır içi cssText tasarım sistemini baypas eder
      // ve Tauri CSP'sinde style-src 'unsafe-inline' ister.
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
  }

  /**
   * Aktif renderer'ı bildirir. CORE'un teşhis katmanı Phaser'ı TANIMAZ; bu
   * bilgiyi Phaser'ı zaten tanıyan `createVolGame` besler.
   */
  setRenderer(info: RendererInfo): void {
    this.renderer = info;
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
    this.frameStats.markBaseline(now);
    this.lastEndTime = now;
  }

  setInput(snapshot: InputSnapshot): void {
    this.currentInput = snapshot;
  }

  /** Yeni kare ölçümüne başla. */
  beginFrame(): void {
    const now = performance.now();

    if (this.lastEndTime > 0) {
      this.renderStats.push(now - this.lastEndTime);
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
   * Aşamayı bitirir. Başlangıç damgası ile sure AYRI map'lerde tutulur: tek
   * map'te tutulup üzerine yazılırsa ikinci bir endStage() cagrisi
   * `now - sure` hesaplayıp devasa bir çöp değer yazar ve overlay sessizce
   * yanlış veri gösterir.
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
    this.updateStats.push(now - this.startTime);
    this.frameStats.sample(now);
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
  }

  private summary(stats: { min: number; max: number; average: number }): StatsSummary {
    return { min: stats.min, max: stats.max, avg: stats.average };
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
    return {
      t: performance.now(),
      gameId: this.gameId,
      scene: this.currentScene,
      fps: this.frameStats.fps,
      frame: this.summary(this.frameStats),
      render: this.summary(this.renderStats),
      update: this.summary(this.updateStats),
      stages: Object.fromEntries(this.stageTimes),
      counts: Object.fromEntries(this.counts),
      input: this.currentInput,
      events: [...this.pendingEvents],
      screen: this.screenInfo(),
      renderer: this.renderer,
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
      // Geri düşüş sessiz kalmasın: overlay'de en görünür yerde işaretlenir.
      `gpu: ${snapshot.renderer.kind}${snapshot.renderer.fellBack ? ' ⚠ GERİ DÜŞTÜ' : ''}`,
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
    // Buffer snapshot ALINDIKTAN sonra temizlenir: taşıma katmanı isteği
    // atlasa (uçuşta başka istek varsa) bile olaylar snapshot'a girmiş olur,
    // yani `send` bir daha çağrılmasa da veri kaybı buradan doğmaz.
    this.pendingEvents.length = 0;

    void this.transport.send(snapshot);
  }
}

/**
 * Diagnostics örneği üretir.
 *
 * `new Diagnostics(...)` ile aynı işi yapar; ayrı bir fabrika, çağrı yerlerinin
 * "global bir örnek al" yerine "bir örnek oluştur ve geçir" okumasını sağlamak
 * için var.
 */
export function createDiagnostics(options: DiagnosticsOptions): Diagnostics {
  return new Diagnostics(options);
}

/** Diagnostics'ın URL'de ?debug veya ?perf varsa aktif olması gerekip geremediğini döner. */
export function isDiagnosticsEnabled(): boolean {
  if (typeof location === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  return params.has('debug') || params.has('perf');
}
