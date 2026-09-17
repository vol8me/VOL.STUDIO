export type PointerModality = 'mouse' | 'touch' | 'pen' | 'trackpad';

export interface PointerMomentumProfile {
  /** Bırakma sonrası kayma süresi; modaliteye göre ayrıdır. */
  readonly momentumMs: number;
  /**
   * Sınır direncinin başladığı bant, görünür genişliğin oranı. Dokunmada daha
   * geniştir: parmak sınırı daha sık zorlar ve sert kesme orada hissedilir.
   */
  readonly resistanceBandRatio: number;
}

/**
 * Modaliteye göre ayrı profiller (D1). Bugünkü kod `pointerType` okumuyordu;
 * fare ve dokunma aynı momentumu kullanıyordu, oysa fare bırakması ani,
 * parmak bırakması savurmalıdır.
 */
export const defaultPointerProfiles: Readonly<Record<PointerModality, PointerMomentumProfile>> = {
  mouse: { momentumMs: 90, resistanceBandRatio: 0.08 },
  touch: { momentumMs: 180, resistanceBandRatio: 0.12 },
  pen: { momentumMs: 120, resistanceBandRatio: 0.1 },
  trackpad: { momentumMs: 140, resistanceBandRatio: 0.1 },
};

export function classifyPointer(pointerType: string | undefined): PointerModality {
  if (pointerType === 'touch' || pointerType === 'pen') return pointerType;
  return 'mouse';
}

export type WheelIntent = 'pinch' | 'trackpad-pan' | 'wheel-zoom';

/**
 * Wheel olayının NİYETİ sınıflanır (D1): `ctrlKey` tarayıcıların pinch
 * jestini wheel olarak ilettiği durumdur; satır modundaki büyük adımlar fare
 * tekerleği, piksel modundaki küçük ve sık adımlar trackpad kaydırmasıdır.
 */
export function classifyWheel(event: {
  ctrlKey: boolean;
  deltaMode: number;
  deltaY: number;
}): WheelIntent {
  if (event.ctrlKey) return 'pinch';
  if (event.deltaMode !== 0) return 'wheel-zoom';
  return Math.abs(event.deltaY) < 24 ? 'trackpad-pan' : 'wheel-zoom';
}

/**
 * Sınıra yaklaşınca ASİMPTOTİK direnç. Sert sınır hiçbir zaman aşılmaz ve
 * bırakınca geri sekme olmaz: değer sınırın ötesine hiç geçmediği için geri
 * dönecek bir şey kalmaz.
 */
export function resistTowardBound(
  requested: number,
  min: number,
  max: number,
  band: number,
): number {
  if (!(band > 0) || min >= max) return Math.min(max, Math.max(min, requested));
  const usable = Math.min(band, (max - min) / 2);
  const upperStart = max - usable;
  const lowerStart = min + usable;
  if (requested > upperStart) {
    const over = requested - upperStart;
    return upperStart + usable * (1 - Math.exp(-over / usable));
  }
  if (requested < lowerStart) {
    const over = lowerStart - requested;
    return lowerStart - usable * (1 - Math.exp(-over / usable));
  }
  return requested;
}
