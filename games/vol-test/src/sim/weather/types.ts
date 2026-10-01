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
