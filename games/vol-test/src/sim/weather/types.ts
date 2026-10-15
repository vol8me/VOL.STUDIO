import type { SeasonKind } from '@/config/seasons';
import type { WeatherKind } from '@/config/weather';

export interface WeatherState {
  readonly kind: WeatherKind;
  readonly season: SeasonKind;
  readonly seasonProgress: number;
  readonly daylight: number;
  readonly elapsedMs: number;
  readonly dust: number;
  readonly rain: number;
  readonly snow: number;
  /** Dünya birimi/s. */
  readonly windX: number;
  readonly windY: number;
  /** Celsius. */
  readonly temperature: number;
  readonly airDrag: number;
}

export interface WeatherFrame extends WeatherState {
  /** Rüzgârın simülasyon saati boyunca biriken mesafesi, dünya birimi. */
  readonly windTravelX: number;
  readonly windTravelY: number;
}

export interface SurfaceSample {
  readonly wetness: number;
  /** Metre. */
  readonly puddleDepth: number;
  /** Metre. */
  readonly snowDepth: number;
  readonly snowCompaction: number;
  /** Yeşillik örtüsü [0, 1]: yağmurla büyür, kuraklık, don ve kar örtüsüyle çekilir. */
  readonly growth: number;
  readonly grip: number;
  readonly rollingResistance: number;
  readonly windX: number;
  readonly windY: number;
  readonly airDrag: number;
}

export interface SurfaceCell extends SurfaceSample {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Zemin hücrelerinin sıkıştırılmış hâli: alan başına hücre başına bir bayt (1/255 çözünürlük).
 * Ağ yayını ve disk kalıcılığı aynı biçimi kullanır; sıkıştırma kaybı hava tohumundan ve saatten
 * türeyen bir sonraki adımlarda sönümlenir.
 */
export interface SurfaceSnapshot {
  readonly columns: number;
  readonly rows: number;
  readonly wetness: Uint8Array;
  readonly puddle: Uint8Array;
  readonly snow: Uint8Array;
  readonly compaction: Uint8Array;
  readonly growth: Uint8Array;
}

/**
 * Dünya iklimi anlık görüntüsü: hava saati, rüzgâr birikimi ve zemin. Hava belirli (tohum + saat)
 * olduğundan hava yalnız saatle taşınır; hücre durumu ise geçmişin sonucudur ve bayt dizisiyle gelir.
 */
export interface ClimateSnapshot {
  readonly version: 1;
  readonly seed: number;
  /** Hava takviminin başlangıç mevsimi: mevsim saati bundan sayılır. */
  readonly season: SeasonKind;
  readonly elapsedMs: number;
  readonly surfaceMs: number;
  readonly windMs: number;
  readonly windTravelX: number;
  readonly windTravelY: number;
  readonly windX: number;
  readonly windY: number;
  readonly surface: SurfaceSnapshot;
}
