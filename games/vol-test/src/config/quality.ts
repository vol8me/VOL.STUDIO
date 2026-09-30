/**
 * Efekt kalite kademeleri (CORE `GraphicsQuality` profilleri). Yüksek kademe
 * masaüstü ve Steam Deck içindir; düşük kademe Android'de açılış kademesidir
 * ve duraklatma menüsünden değiştirilebilir.
 */
export interface EffectProfile {
  /** Parçacık sayısı çarpanı. */
  readonly particles: number;
  /**
   * Mermi gövdesinin çevresinde yumuşak hale (katmanlı daire). Phaser 4 `Glow`
   * filtresi ölçüldü ve reddedildi: her karede yeniden çizilen, dünya boyunca
   * uzanan katmanı tam çerçeveye işler; başsız tarayıcıda 60 → 4 FPS.
   */
  readonly glow: boolean;
  /** Zemindeki iz ve yanık havuzlarının kapasite çarpanı. */
  readonly decals: number;
}

export type EffectLevel = 'high' | 'low';

export const EFFECT_LEVELS: Readonly<Record<EffectLevel, EffectProfile>> = {
  high: { particles: 1, glow: true, decals: 1 },
  low: { particles: 0.5, glow: false, decals: 0.5 },
};

/** Açılış kademesi: Android tarayıcısı ve Android kabuğu düşük başlar. */
export function initialEffectLevel(userAgent: string): EffectLevel {
  return /Android/i.test(userAgent) ? 'low' : 'high';
}
