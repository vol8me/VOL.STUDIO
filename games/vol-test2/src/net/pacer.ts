export interface PacerOptions {
  /** Simülasyon adımı/sn (sunucuyla aynı). */
  readonly rate: number;
  /** Sunucunun bildirdiği adımın bu kadar gerisinde kalınmaya çalışılır. */
  readonly targetLag: number;
  readonly maxSteps: number;
}

/**
 * Kilit adımlı istemcide kare başına kaç simülasyon adımı koşturulacağını seçer. Sunucu paketleri
 * kümeler halinde gelir; istemci hemen sonuna kadar koşarsa her kümeden sonra durur ve takılır. Hedef tampon
 * bırakılırsa tampon küçüldükçe yavaşlar, büyüdükçe hızlanır; hız ±%50..×4 arasında kalır. Adım kesri
 * (`fraction`) çizimde adımlar arası ara değerleme içindir.
 */
export class Pacer {
  private budget = 0;

  constructor(private readonly options: PacerOptions) {}

  /** Adımlar arası ilerleme (0..1): çizim bu oranda önceki ve şimdiki durum arasında ara değerler. */
  get fraction(): number {
    return this.budget;
  }

  next(deltaMs: number, lagTicks: number): number {
    if (!(deltaMs > 0) || !Number.isFinite(deltaMs) || lagTicks <= 0) {
      this.budget = 0;
      return 0;
    }
    const { rate, targetLag, maxSteps } = this.options;
    const speed = Math.min(4, Math.max(0.5, 1 + (lagTicks - targetLag) * 0.15));
    this.budget += (deltaMs / 1000) * rate * speed;
    let steps = Math.floor(this.budget);
    this.budget -= steps;
    if (steps >= maxSteps || steps >= lagTicks) {
      // Sınıra dayanan fazla bütçe birikmez: sıçrama yerine yetişme hızı yeniden hesaplanır.
      steps = Math.min(steps, maxSteps, lagTicks);
      this.budget = 0;
    }
    return steps;
  }

  reset(): void {
    this.budget = 0;
  }
}
