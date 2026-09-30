import type Phaser from 'phaser';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import type { Projectiles } from '@/sim/combat/Projectiles';

export type ShellVisitor = (
  x: number,
  y: number,
  dx: number,
  dy: number,
  travelled: number,
  speed: number,
) => void;

/** Çizgi katmanı iz ve gövde kalınlıkları: dış hale, iz çekirdeği, gövde. */
const HALO_WIDTH = 5;
const CORE_WIDTH = 1.6;
/** Gövde halesinin dış ve iç yarıçapı (birim). */
const HALO_OUTER = 9;
const HALO_INNER = 5;
/** İz, gövdeden geriye bu kadar parçada incelerek söner. */
const TAPER_STEPS = 3;

/**
 * Mermiler: ara değerli uçta parlak bir gövde (kapsül) ve arkasında incelen
 * iz. Katman her karede baştan çizilir. Gövde halesi (katmanlı yarı saydam
 * daire) kalite kademesiyle açılıp kapanır.
 */
export class TracerLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private glow = true;

  constructor(scene: Phaser.Scene) {
    // Normal karışım: açık çöl zemininde toplamsal karışım rengi beyaza yıkar.
    this.graphics = scene.add.graphics().setDepth(12);
  }

  /** Gövde halesini açar ya da kapatır (efekt kalitesi). */
  setGlow(enabled: boolean): void {
    this.glow = enabled;
  }

  get glowing(): boolean {
    return this.glow;
  }

  /**
   * Mermileri çizer; her merminin ara değerli uç konumunu, yönünü ve katettiği
   * yolu `visit` ile bildirir (duman izi bununla bırakılır).
   */
  draw(projectiles: Projectiles, alpha: number, visit?: ShellVisitor): void {
    const graphics = this.graphics;
    const shell = FX.shell;
    graphics.clear();
    for (let index = 0; index < projectiles.count; index++) {
      const projectile = projectiles.items[index];
      if (!projectile) continue;
      const x = projectile.px + (projectile.x - projectile.px) * alpha;
      const y = projectile.py + (projectile.y - projectile.py) * alpha;
      const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
      const dx = projectile.vx / speed;
      const dy = projectile.vy / speed;
      // Menzil başında iz kısa: mermi namludan yeni çıktıysa iz tankın içine uzanmaz.
      const travelled = projectile.ageMs * (speed / 1000);
      const length = Math.min(shell.tracerLength, travelled + shell.headLength);
      for (let step = 0; step < TAPER_STEPS; step++) {
        const from = (length * step) / TAPER_STEPS;
        const to = (length * (step + 1)) / TAPER_STEPS;
        const fade = 1 - step / TAPER_STEPS;
        graphics.lineStyle(HALO_WIDTH * fade, PALETTE.energy, 0.4 * fade);
        graphics.lineBetween(x - dx * from, y - dy * from, x - dx * to, y - dy * to);
        graphics.lineStyle(CORE_WIDTH * fade, PALETTE.energyHot, 0.9 * fade);
        graphics.lineBetween(x - dx * from, y - dy * from, x - dx * to, y - dy * to);
      }
      if (this.glow) {
        graphics.fillStyle(PALETTE.energy, 0.14);
        graphics.fillCircle(x, y, HALO_OUTER);
        graphics.fillStyle(PALETTE.energy, 0.26);
        graphics.fillCircle(x, y, HALO_INNER);
      }
      graphics.lineStyle(shell.headWidth, PALETTE.energyHot, 1);
      graphics.lineBetween(x - dx * shell.headLength, y - dy * shell.headLength, x, y);
      visit?.(x, y, dx, dy, travelled, speed);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
