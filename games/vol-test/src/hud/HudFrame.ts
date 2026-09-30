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
  readonly view: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}
