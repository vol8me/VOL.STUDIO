import type Phaser from 'phaser';
import { enemyConfig } from '@/config/enemy';

/**
 * Düşmanın başının üzerinde duran can barı — arka plan + dolum dikdörtgeni.
 *
 * `Enemy`'den ayrı tutulur: düşmanın kendi sorumluluğu hareket, hasar ve ölüm;
 * barın konumlanma/geometri detayı ona ait değil. Bar dünya koordinatlarında
 * çizilir (kamera ile birlikte hareket eder), bu yüzden her frame düşmanın
 * pozisyonuyla `follow()` çağrılması gerekir.
 */
export class EnemyHealthBar {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const barY = y - enemyConfig.healthBarOffset;

    this.bg = scene.add.rectangle(
      x,
      barY,
      enemyConfig.healthBarWidth,
      enemyConfig.healthBarHeight,
      enemyConfig.healthBarBgColor,
      enemyConfig.healthBarBgAlpha,
    );
    this.fill = scene.add.rectangle(
      x,
      barY,
      enemyConfig.healthBarWidth,
      enemyConfig.healthBarHeight,
      enemyConfig.healthBarFillColor,
      enemyConfig.healthBarFillAlpha,
    );
    // Sol kenara sabitlenir ki genislik azalinca bar soldan buyuyup sagdan kisalsin.
    this.fill.setOrigin(0, 0.5);
  }

  /** Barı düşmanın güncel konumuna taşır. */
  follow(x: number, y: number): void {
    const barY = y - enemyConfig.healthBarOffset;
    this.bg.x = x;
    this.bg.y = barY;
    this.fill.x = x - enemyConfig.healthBarWidth / 2;
    this.fill.y = barY;
  }

  /**
   * Dolum oranını uygular. `alive` false ise bar tamamen gizlenir — ölmüş
   * düşmanın barı ekranda kalmamalı.
   */
  setRatio(ratio: number, alive: boolean, x: number): void {
    this.bg.setVisible(alive);
    this.fill.setVisible(alive && ratio > 0);

    // setSize() kullanilir: `.width`'e dogrudan atamak geom'u ve displayOrigin'i
    // guncellemez, yalnizca WebGL renderer'in src.width okumasi sayesinde
    // tesadufen calisirdi. Origin sola sabitlenmis oldugu icin bar soldan
    // sabit kalip sagdan kisalir — klasik can bari davranisi.
    this.fill.setSize(
      Math.max(enemyConfig.healthBarMinWidth, enemyConfig.healthBarWidth * ratio),
      enemyConfig.healthBarHeight,
    );
    this.fill.x = x - enemyConfig.healthBarWidth / 2;
  }

  destroy(): void {
    this.bg.destroy();
    this.fill.destroy();
  }
}
