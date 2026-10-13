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
  readonly health: number;
  readonly maxHealth: number;
  readonly alive: boolean;
  readonly respawnRemainingMs: number;
  readonly protectionRemainingMs: number;
  readonly climate?: ClimateFrame;
  /**
   * Haritada gösterilecek tüm araçlar. Tembel: yalnız harita güncellenirken çağrılır (düşük kalitede
   * seyreltilir). Çağrı başına nesne üretmemek için yineleyici AYNI `HudVehicle` nesnelerini yeniden
   * kullanabilir; tüketici onları saklamaz.
   */
  readonly vehicles?: () => Iterable<HudVehicle>;
  readonly view: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}
