import type { WeatherFrame } from '@/sim/weather/types';
import type { FrontFrame } from '@/view/front';

/** Haritada gösterilen araç: dünya birimi konum ve gövde yönü. */
export interface HudVehicle {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly hull: number;
  /** Oyuncunun kendi aracı mı (haritada vurgulanır). */
  readonly player: boolean;
  /** Bot mu: harita işaretine sarı rozet düşer. Verilmezse insandır. */
  readonly bot?: boolean;
  /** Cephe indeksi; cepheye bağlı değilse -1 ya da yok. */
  readonly team?: number;
}

/** HUD'un her güncellemede okuduğu oyun durumu; simülasyon sınıflarına bağlı değildir. */
export interface HudFrame {
  readonly x: number;
  readonly y: number;
  readonly hull: number;
  readonly boosting: boolean;
  /** Bacaklı yürüyücü mü: hızlanma çubuğu "Atılım" olur, Shift ipucu ve düğmesi kalkar, Space atılım olur. */
  readonly walker: boolean;
  readonly boost: number;
  readonly boostCapacity: number;
  readonly fireProgress: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly alive: boolean;
  readonly respawnRemainingMs: number;
  readonly protectionRemainingMs: number;
  /** Mevsim ve hava HUD'da yazı değildir; yalnız yerleşim kökünün `data-season`/`data-weather` özniteliğidir. */
  readonly climate?: Pick<WeatherFrame, 'season' | 'kind'>;
  /**
   * Haritada gösterilecek tüm araçlar. Tembel: yalnız harita güncellenirken çağrılır (düşük kalitede
   * seyreltilir). Çağrı başına nesne üretmemek için yineleyici AYNI `HudVehicle` nesnelerini yeniden
   * kullanabilir; tüketici onları saklamaz.
   */
  readonly vehicles?: () => Iterable<HudVehicle>;
  /** Cephe hattı (bölgeler, üsler); savaş dünyası olmayan kipte yoktur. */
  readonly front?: FrontFrame;
  readonly view: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}
