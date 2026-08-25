import type Phaser from 'phaser';
import { enemyConfig } from '@/config/enemy';
import { RENDER_DEPTH } from '@/config/layers';
import { clampFinite } from '@/runtime/utils/numeric';

export interface EntityHealthBarOptions {
  /** Dolu kısmın rengi (0xRRGGBB). Verilmezse düşman barı rengi. */
  fillColor?: number;
  /** Render katmanı. Verilmezse düşman can barı katmanı. */
  depth?: number;
}

/**
 * Bir varlığın başının üzerinde duran can barı — arka plan + dolum dikdörtgeni.
 *
 * Sahibinden ayrı tutulur: düşmanın/kulenin kendi sorumluluğu hareket, hasar ve
 * ölüm; barın konumlanma/geometri detayı ona ait değil. Bar dünya
 * koordinatlarında çizilir, bu yüzden her frame `follow()` çağrılmalıdır.
 *
 * Genişlik ve yükseklik sahibin yarıçapından türetilir: katalogdaki her arketip
 * farklı boyutta olduğu için sabit bir bar, küçük minion'ların üzerinde devasa
 * görünürdü.
 */
export class EntityHealthBar {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly width: number;
  private readonly offset: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    radius: number,
    options: EntityHealthBarOptions = {},
  ) {
    this.width = radius * enemyConfig.healthBarWidthRatio;
    this.offset = radius + enemyConfig.healthBarGap;
    const barY = y - this.offset;
    const depth = options.depth ?? RENDER_DEPTH.enemyHealthBar;

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
      options.fillColor ?? enemyConfig.healthBarFillColor,
      enemyConfig.healthBarFillAlpha,
    );
    // Sol kenara sabitlenir ki genislik azalinca bar soldan buyuyup sagdan kisalsin.
    this.fill.setOrigin(0, 0.5);

    // Barlar gövdelerin üstünde: kalabalıkta başka bir gövdenin altında kalıp
    // okunamaz hale gelmemeli.
    this.bg.setDepth(depth);
    this.fill.setDepth(depth);
  }

  /** Barı sahibinin güncel konumuna taşır. */
  follow(x: number, y: number): void {
    const barY = y - this.offset;
    this.bg.x = x;
    this.bg.y = barY;
    this.fill.x = x - this.width / 2;
    this.fill.y = barY;
  }

  /**
   * Dolum oranını uygular. `alive` false ise bar tamamen gizlenir — ölmüş
   * varlığın barı ekranda kalmamalı.
   */
  setRatio(ratio: number, alive: boolean, x: number): void {
    const safeRatio = clampFinite(ratio, 0, 1, 0);
    this.bg.setVisible(alive);
    this.fill.setVisible(alive && safeRatio > 0);

    // setSize() kullanilir: `.width`'e dogrudan atamak geom'u ve displayOrigin'i
    // guncellemez, yalnizca WebGL renderer'in src.width okumasi sayesinde
    // tesadufen calisirdi. Origin sola sabitlenmis oldugu icin bar soldan
    // sabit kalip sagdan kisalir — klasik can bari davranisi.
    this.fill.setSize(
      Math.max(enemyConfig.healthBarMinWidth, this.width * safeRatio),
      enemyConfig.healthBarHeight,
    );
    this.fill.x = x - this.width / 2;
  }

  destroy(): void {
    this.bg.destroy();
    this.fill.destroy();
  }
}
