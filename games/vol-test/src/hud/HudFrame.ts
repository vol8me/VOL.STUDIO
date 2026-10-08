import type { ClimateFrame } from './ClimateStatus';

/** Haritada gösterilen araç: dünya birimi konum ve gövde yönü. */
export interface HudVehicle {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly hull: number;
  /** Oyuncunun kendi aracı mı (haritada vurgulanır). */
  readonly player: boolean;
}

/** HUD'un her güncellemede okuduğu oyun durumu; simülasyon sınıflarına bağlı değildir. */
export interface HudFrame {
  readonly x: number;
  readonly y: number;
  readonly hull: number;
  readonly speed: number;
  readonly reversing: boolean;
  readonly braking: boolean;
  readonly boosting: boolean;
  readonly boost: number;
  readonly boostCapacity: number;
  readonly fireProgress: number;
  readonly climate?: ClimateFrame;
  /**
   * Haritada gösterilecek tüm araçlar. Tembel: yalnız harita güncellenirken (10 Hz) çağrılır, her karede
   * liste kurulmaz.
   */
  readonly vehicles?: () => Iterable<HudVehicle>;
  readonly view: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}
