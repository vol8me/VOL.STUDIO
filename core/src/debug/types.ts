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
