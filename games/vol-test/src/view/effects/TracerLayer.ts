import type Phaser from 'phaser';
import { FX, SHOT_LOOK } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { WEAPON_STYLES } from '@/config/tank';
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
      const groundY = projectile.py + (projectile.y - projectile.py) * alpha;
      const height =
        projectile.previousHeight + (projectile.height - projectile.previousHeight) * alpha;
      const y = groundY - height * shell.heightScale;
      graphics.fillStyle(PALETTE.shellShadow, shell.shadowAlpha);
      graphics.fillCircle(x, groundY, shell.shadowRadius);
      const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
      const dx = projectile.vx / speed;
      const dy = projectile.vy / speed;
      // Menzil başında iz kısa: mermi namludan yeni çıktıysa iz tankın içine uzanmaz.
      const travelled = projectile.travelled;
      const look = SHOT_LOOK[WEAPON_STYLES[projectiles.styleOf(projectile)] ?? 'shell'];
      const length = Math.min(shell.tracerLength * look.length, travelled + shell.headLength);
      for (let step = 0; step < TAPER_STEPS; step++) {
        const from = (length * step) / TAPER_STEPS;
        const to = (length * (step + 1)) / TAPER_STEPS;
        const fade = 1 - step / TAPER_STEPS;
        graphics.lineStyle(HALO_WIDTH * look.width * fade, look.glow, 0.4 * fade);
        graphics.lineBetween(x - dx * from, y - dy * from, x - dx * to, y - dy * to);
        graphics.lineStyle(CORE_WIDTH * look.width * fade, look.hot, 0.9 * fade);
        graphics.lineBetween(x - dx * from, y - dy * from, x - dx * to, y - dy * to);
      }
      if (this.glow) {
        graphics.fillStyle(look.glow, 0.14);
        graphics.fillCircle(x, y, HALO_OUTER * look.halo);
        graphics.fillStyle(look.glow, 0.26);
        graphics.fillCircle(x, y, HALO_INNER * look.halo);
      }
      graphics.lineStyle(shell.headWidth * look.width, look.hot, 1);
      graphics.lineBetween(x - dx * shell.headLength, y - dy * shell.headLength, x, y);
      visit?.(x, y, dx, dy, travelled, speed);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
