/** Can, hasar ve yeniden doğma kuralları yalnız oyunun yapılandırmasındadır. */
export const COMBAT = {
  maxHealth: 100,
  /** Aynı takımın mermileri birbirine çarpmaz. Takımsız araçlar herkese karşı açıktır. */
  friendlyFire: false,
  /** Son hasardan sonra doğal onarımın başlaması için geçen simülasyon süresi. */
  regenerationDelayMs: 6000,
  regenerationPerSecond: 4,
  respawnDelayMs: 4000,
  respawnProtectionMs: 1200,
  wall: {
    minSpeed: 125,
    damagePerSpeed: 0.12,
  },
  collision: {
    minSpeed: 95,
    damagePerSpeed: 0.08,
  },
} as const;

/** Aynı anda havada kalabilen en çok mermi; dolunca en yaşlı mermi yeni atışa verilir. */
export const PROJECTILE_CAPACITY = 256;

/** Çok küçük önizleme adımı sınırsız yol arabelleği veya CPU işi üretemez. */
export const PROJECTILE_PREVIEW_MAX_STEPS = 1024;

export interface CombatConfig {
  readonly maxHealth: number;
  readonly friendlyFire: boolean;
  readonly regenerationDelayMs: number;
  readonly regenerationPerSecond: number;
  readonly respawnDelayMs: number;
  readonly respawnProtectionMs: number;
  readonly wall: { readonly minSpeed: number; readonly damagePerSpeed: number };
  readonly collision: { readonly minSpeed: number; readonly damagePerSpeed: number };
}
