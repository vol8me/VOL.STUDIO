/** Simülasyonun görünüme bildirdiği olaylar; efekt, kamera ve HUD bunları tüketir. */
export type SimEvent =
  | { readonly kind: 'fired'; readonly x: number; readonly y: number; readonly angle: number }
  | { readonly kind: 'impact'; readonly x: number; readonly y: number; readonly angle: number }
  | {
      readonly kind: 'wallHit';
      readonly x: number;
      readonly y: number;
      readonly normalX: number;
      readonly normalY: number;
      /** Çarpmanın normal hızı (birim/s). */
      readonly speed: number;
    };
