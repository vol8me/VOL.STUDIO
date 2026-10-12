import type { CombatConfig } from '@/config/combat';

/** Canın ve zaman sınırlarının tek sahibi; güncelleme yalnız simülasyon adımıyla yapılır. */
export class Vitality {
  readonly maxHealth: number;
  health: number;
  respawnRemainingMs = 0;
  protectionRemainingMs = 0;
  private sinceDamageMs = 0;

  constructor(private readonly config: CombatConfig) {
    const numbers = [
      config.maxHealth,
      config.projectileDamage,
      config.regenerationDelayMs,
      config.regenerationPerSecond,
      config.respawnDelayMs,
      config.respawnProtectionMs,
      config.wall.minSpeed,
      config.wall.damagePerSpeed,
      config.collision.minSpeed,
      config.collision.damagePerSpeed,
    ];
    if (
      numbers.some((value) => !Number.isFinite(value) || value < 0) ||
      config.maxHealth <= 0 ||
      typeof config.friendlyFire !== 'boolean'
    ) {
      throw new RangeError('Savaş yapılandırması sonlu ve negatif olmayan değerler taşımalı');
    }
    this.maxHealth = config.maxHealth;
    this.health = config.maxHealth;
  }

  get alive(): boolean {
    return this.health > 0;
  }

  /** Gerçekten düşen canı döndürür; ölüm ve koruma sırasında yeni hasar alınmaz. */
  damage(amount: number): number {
    this.requireAmount(amount);
    if (!this.alive || this.protectionRemainingMs > 0) return 0;
    const applied = Math.min(this.health, amount);
    if (applied === 0) return 0;
    this.health -= applied;
    this.sinceDamageMs = 0;
    if (!this.alive) this.respawnRemainingMs = this.config.respawnDelayMs;
    return applied;
  }

  /** Gerçekten eklenen canı döndürür; ölü bir araç iyileştirilerek diriltilemez. */
  heal(amount: number): number {
    this.requireAmount(amount);
    if (!this.alive) return 0;
    const applied = Math.min(this.maxHealth - this.health, amount);
    this.health += applied;
    return applied;
  }

  /** Aktifken koruma/onarımı, ölüyken yeniden doğma sayacını ilerletir. */
  step(deltaMs: number): { respawnReady: boolean; regenerated: number } {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return { respawnReady: false, regenerated: 0 };
    if (!this.alive) {
      this.respawnRemainingMs = Math.max(0, this.respawnRemainingMs - deltaMs);
      // Kesirli sabit adım toplamı tam eşikte bir karelik sapma üretmemeli.
      if (this.respawnRemainingMs <= this.config.respawnDelayMs * 1e-12)
        this.respawnRemainingMs = 0;
      return { respawnReady: this.respawnRemainingMs === 0, regenerated: 0 };
    }
    this.protectionRemainingMs = Math.max(0, this.protectionRemainingMs - deltaMs);
    const previous = this.sinceDamageMs;
    this.sinceDamageMs += deltaMs;
    const activeMs =
      Math.max(0, this.sinceDamageMs - this.config.regenerationDelayMs) -
      Math.max(0, previous - this.config.regenerationDelayMs);
    return {
      respawnReady: false,
      regenerated: this.heal((activeMs / 1000) * this.config.regenerationPerSecond),
    };
  }

  respawn(): void {
    this.health = this.maxHealth;
    this.respawnRemainingMs = 0;
    this.protectionRemainingMs = this.config.respawnProtectionMs;
    this.sinceDamageMs = 0;
  }

  private requireAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0)
      throw new RangeError('Can değişimi sonlu ve negatif olmayan miktar olmalı');
  }
}
