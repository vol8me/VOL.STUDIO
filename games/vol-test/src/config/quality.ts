/**
 * Efekt kalite kademeleri (CORE `GraphicsQuality` profilleri). Yüksek kademe
 * masaüstü ve ölçülen cihazlar içindir; düşük kademe diğer Android cihazların açılış kademesidir
 * ve duraklatma menüsünden değiştirilebilir.
 */
export interface EffectProfile {
  /** Parçacık sayısı çarpanı. */
  readonly particles: number;
  /** Mermi gövdesinin çevresinde katmanlı dairelerle yumuşak hale. */
  readonly glow: boolean;
  /** Zemindeki iz ve yanık havuzlarının kapasite çarpanı. */
  readonly decals: number;
}

export type EffectLevel = 'high' | 'low';

export const EFFECT_LEVELS: Readonly<Record<EffectLevel, EffectProfile>> = {
  high: { particles: 1, glow: true, decals: 1 },
  low: { particles: 0.5, glow: false, decals: 0.5 },
};

export function initialEffectLevel(userAgent: string): EffectLevel {
  if (!/Android/i.test(userAgent)) return 'high';
  return /(?:^|[;\s])TB350FU(?:[;\s]|$)/i.test(userAgent) ? 'high' : 'low';
}
