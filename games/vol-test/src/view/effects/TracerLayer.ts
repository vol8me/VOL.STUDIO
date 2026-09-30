import type Phaser from 'phaser';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import type { Projectiles } from '@/sim/combat/Projectiles';

/**
 * Mermi izleri: her mermi için ara değerli uçtan geriye doğru bir parıltı ve
 * bir çekirdek çizgisi. Katman her karede baştan çizilir.
 */
export class TracerLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    // Normal karışım: açık çöl zemininde toplamsal karışım rengi beyaza yıkar.
    this.graphics = scene.add.graphics().setDepth(12);
  }

  draw(projectiles: Projectiles, alpha: number): void {
    const graphics = this.graphics;
    graphics.clear();
    for (let index = 0; index < projectiles.count; index++) {
      const projectile = projectiles.items[index];
      if (!projectile) continue;
      const x = projectile.px + (projectile.x - projectile.px) * alpha;
      const y = projectile.py + (projectile.y - projectile.py) * alpha;
      const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
      const tailX = x - (projectile.vx / speed) * FX.tracerLength;
      const tailY = y - (projectile.vy / speed) * FX.tracerLength;
      graphics.lineStyle(4, PALETTE.energy, 0.45);
      graphics.lineBetween(tailX, tailY, x, y);
      graphics.lineStyle(1.6, PALETTE.energyHot, 0.95);
      graphics.lineBetween(tailX, tailY, x, y);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
