import type Phaser from 'phaser';
import { enemyConfig } from '@/config/enemy';
import { RENDER_DEPTH } from '@/config/layers';

/**
 * Düşmanın başının üzerinde duran can barı — arka plan + dolum dikdörtgeni.
 *
 * `Enemy`'den ayrı tutulur: düşmanın kendi sorumluluğu hareket, hasar ve ölüm;
 * barın konumlanma/geometri detayı ona ait değil. Bar dünya koordinatlarında
 * çizilir (kamera ile birlikte hareket eder), bu yüzden her frame düşmanın
 * pozisyonuyla `follow()` çağrılması gerekir.
 *
 * Genişlik ve yükseklik düşmanın yarıçapından türetilir: katalogdaki her
 * arketip farklı boyutta olduğu için sabit bir bar, küçük minion'ların
 * üzerinde devasa görünürdü.
 */
export class EnemyHealthBar {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly width: number;
  private readonly offset: number;

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number) {
    this.width = radius * enemyConfig.healthBarWidthRatio;
    this.offset = radius + enemyConfig.healthBarGap;
    const barY = y - this.offset;

    this.bg = scene.add.rectangle(
      x,
      barY,
      this.width,
      enemyConfig.healthBarHeight,
      enemyConfig.healthBarBgColor,
      enemyConfig.healthBarBgAlpha,
    );
    this.fill = scene.add.rectangle(
      x,
      barY,
      this.width,
      enemyConfig.healthBarHeight,
      enemyConfig.healthBarFillColor,
      enemyConfig.healthBarFillAlpha,
    );
    // Sol kenara sabitlenir ki genislik azalinca bar soldan buyuyup sagdan kisalsin.
    this.fill.setOrigin(0, 0.5);

    // Barlar düşman gövdelerinin üstünde: kalabalıkta başka bir düşmanın
    // altında kalıp okunamaz hale gelmemeli.
    this.bg.setDepth(RENDER_DEPTH.enemyHealthBar);
    this.fill.setDepth(RENDER_DEPTH.enemyHealthBar);
  }

  /** Barı düşmanın güncel konumuna taşır. */
  follow(x: number, y: number): void {
    const barY = y - this.offset;
    this.bg.x = x;
    this.bg.y = barY;
    this.fill.x = x - this.width / 2;
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
      Math.max(enemyConfig.healthBarMinWidth, this.width * ratio),
      enemyConfig.healthBarHeight,
    );
    this.fill.x = x - this.width / 2;
  }

  destroy(): void {
    this.bg.destroy();
    this.fill.destroy();
  }
}
