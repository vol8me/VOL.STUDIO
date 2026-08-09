import type Phaser from 'phaser';

/**
 * Phaser Arc GameObject havuzu — partikül efektleri için.
 * Her partikül için yeni GameObject yaratmak yerine, havuzdan alıp geri verir.
 * Tween tamamlandığında partikül yok edilmez, havuza döner.
 * GC baskısını dramatik şekilde azaltır.
 */
export class ParticlePool {
  private readonly pool: Phaser.GameObjects.Arc[] = [];
  private readonly active = new Set<Phaser.GameObjects.Arc>();
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, preAllocate = 32) {
    this.scene = scene;
    for (let i = 0; i < preAllocate; i++) {
      this.pool.push(this.create());
    }
  }

  private create(): Phaser.GameObjects.Arc {
    const arc = this.scene.add.circle(0, 0, 1, 0xffffff, 0);
    arc.setVisible(false);
    arc.setActive(false);
    return arc;
  }

  /**
   * Havuzdan bir partikül alır. Havuz boşsa yeni yaratır.
   * Partikül görünür ve aktif olarak işaretlenir.
   */
  acquire(
    x: number,
    y: number,
    radius: number,
    color: number,
    alpha: number,
  ): Phaser.GameObjects.Arc {
    let arc = this.pool.pop();
    if (!arc) {
      arc = this.create();
    }
    this.scene.tweens.killTweensOf(arc);
    arc.setPosition(x, y);
    arc.setRadius(radius);
    arc.setFillStyle(color, alpha);
    arc.setAlpha(alpha);
    arc.setScale(1);
    arc.setStrokeStyle(0);
    arc.setVisible(true);
    arc.setActive(true);
    this.active.add(arc);
    return arc;
  }

  /** Partikülü havuza geri verir — görünmez, inaktif ve mevcut tween'lerden temizlenir. */
  release(arc: Phaser.GameObjects.Arc): void {
    this.scene.tweens.killTweensOf(arc);
    arc.setVisible(false);
    arc.setActive(false);
    arc.setAlpha(0);
    this.active.delete(arc);
    this.pool.push(arc);
  }

  /** Aktif partikül sayısını döndürür — diagnostic amaçlı. */
  getActiveCount(): number {
    return this.active.size;
  }

  /** Tüm partikülleri yok eder — sahne kapanırken çağrılır. */
  destroy(): void {
    for (const arc of this.active) {
      this.scene.tweens.killTweensOf(arc);
      arc.destroy();
    }
    this.active.clear();
    for (const arc of this.pool) {
      this.scene.tweens.killTweensOf(arc);
      arc.destroy();
    }
    this.pool.length = 0;
  }
}
