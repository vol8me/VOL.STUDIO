export interface BoostConfig {
  readonly boostCapacity: number;
  /** Hızlanırken saniyelik tüketim ve dururken saniyelik dolum. */
  readonly boostDrain: number;
  readonly boostRegen: number;
  /** Boş depodan yeniden hızlanmaya izin veren asgari dolum. */
  readonly boostRestart: number;
}

/**
 * Hızlanma deposu. Hızlanma istendikçe tükenir, istenmezken dolar. Tükenen
 * depo eşiğe (dahil) kadar dolmadan yeniden hızlanmaya izin vermez; eşik titremeyi
 * (tükendi → bir kare doldu → yine tükendi) önler.
 */
export class BoostReserve {
  energy: number;
  active = false;

  constructor(private readonly config: BoostConfig) {
    this.energy = config.boostCapacity;
  }

  reset(): void {
    this.energy = this.config.boostCapacity;
    this.active = false;
  }

  update(wanted: boolean, dt: number): void {
    const config = this.config;
    this.active = wanted && (this.active ? this.energy > 0 : this.energy >= config.boostRestart);
    this.energy = this.active
      ? Math.max(0, this.energy - config.boostDrain * dt)
      : Math.min(config.boostCapacity, this.energy + config.boostRegen * dt);
  }
}
