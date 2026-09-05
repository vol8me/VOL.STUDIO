import type { InputSnapshot } from '../input/InputSnapshot';
import type { DiagnosticsTransport } from './transport';

/**
 * Diagnostics modülü için ortak tipler — frame metrikleri, input snapshot'ları
 * ve oyun içi olaylar. Sadece geliştirme ortamında kullanılır.
 */

export type { InputSnapshot } from '../input/InputSnapshot';

/** İstatistik özeti — min/max/average. */
export interface StatsSummary {
  min: number;
  max: number;
  avg: number;
}

/** Bir oyun içi olayı. */
export interface DiagnosticsEvent {
  /** Olay tipi — tüketicinin belirlediği serbest bir kimlik. */
  type: string;
  /** Olay zaman damgası (performance.now() ms). */
  t: number;
  /** Olaya özel ek veri. */
  data?: unknown;
}

/** Diagnostics sunucusuna gönderilen tam snapshot. */
export interface DiagnosticsSnapshot {
  /** Snapshot zamanı. */
  t: number;
  /** Oyun kimliği. */
  gameId: string;
  /** Aktif sahne adı. */
  scene?: string;
  /** Ortalama FPS. */
  fps: number;
  /** Kare aralığı istatistikleri. */
  frame: StatsSummary;
  /** Update sonu ile sonraki update başı arası (render + idle). */
  render: StatsSummary;
  /** Game update süresi. */
  update: StatsSummary;
  /** Aşama süreleri; aşama adları tüketiciden gelir (CORE bir aşama listesi tanımlamaz). */
  stages: Record<string, number>;
  /** Sayısal metrikler; metrik adları tüketiciden gelir. */
  counts: Record<string, number>;
  /** Input snapshot. */
  input: InputSnapshot;
  /** Son dönemdeki oyun olayları. */
  events: DiagnosticsEvent[];
  /** Ekran / viewport bilgisi. */
  screen: ScreenInfo;
  /** Aktif renderer; oyun boot etmeden ya da Phaser taklit edilirken `unknown`. */
  renderer: RendererInfo;
}

/**
 * Gerçekten kullanılan renderer.
 *
 * `unknown`, Phaser'ı taklit eden test ortamları ve henüz boot etmemiş oyun
 * içindir — "ölçülemedi" ile "canvas" karıştırılmamalıdır.
 */
export type RendererKind = 'webgl' | 'canvas' | 'headless' | 'unknown';

/**
 * Hangi renderer'da koşuyoruz ve bu İSTENEN miydi?
 *
 * Phaser `AUTO` ile başlatıldığında WebGL kurulamıyorsa SESSİZCE Canvas2D'ye
 * düşer. Vektör çizim ve partikül yükü altında bu, "oyun bu cihazda yavaş"
 * belirtisini sebebi görünmeden üretir. `requested: 'auto'` iken `kind:
 * 'canvas'` gelmesi tam olarak o geri düşüştür.
 */
export interface RendererInfo {
  kind: RendererKind;
  requested: 'auto' | 'webgl' | 'canvas' | 'headless';
  /** İstenen ile gerçekleşen ayrıştıysa `true` — sessiz geri düşüşün işareti. */
  fellBack: boolean;
}

export interface ScreenInfo {
  width: number;
  height: number;
  /** Aktif device pixel ratio. */
  dpr: number;
}

export interface DiagnosticsOptions {
  /** Oyun kimliği; log satırlarında gösterilir. */
  gameId: string;
  /** Kaç karede bir snapshot gönderilsin? Varsayılan 60. */
  sampleEvery?: number;
  /**
   * Snapshot'ı nereye göndereceği. Verilmezse hiçbir yere gönderilmez
   * (`NoopTransport`) — CORE'un varsayılanı bir ağ isteği açmak değildir.
   */
  transport?: DiagnosticsTransport;
  /** Ekranda overlay gösterilsin mi? Varsayılan true. */
  overlay?: boolean;
}
