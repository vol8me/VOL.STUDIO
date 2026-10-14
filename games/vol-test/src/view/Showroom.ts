import Phaser from 'phaser';
import { MENU } from '@/config/menu';
import { PALETTE } from '@/config/palette';
import { TANK_LIGHTS } from '@/config/tankView';
import type { VehicleSpec } from '@/config/vehicles';
import { renderQualityOf } from '@/scenes/world/CameraRig';
import { createVehicleView } from './createView';
import type { TankFrame, VehicleView } from './VehicleView';

const SHOWROOM = MENU.showroom;

/** Panelin ekran CSS pikselindeki kenarları (`DOMRect` bunu karşılar). */
export interface PanelRect {
  readonly top: number;
  readonly right: number;
  readonly width: number;
}

/** Vitrinin kurulacağı bölgenin ekran CSS pikselindeki dikdörtgeni (`DOMRect` bunu karşılar). */
export interface StageRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Menü ve garajın vitrini: oyundaki gerçek araç görünümünü zemin ızgarası üstünde yavaş dönen bir
 * tablada gösterir. Görünüm sınıfları oyunla aynıdır; yeni araç otomatik olarak vitrine girer.
 */
export class Showroom {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly lighting: Phaser.GameObjects.Container;
  private view: VehicleView | undefined;
  private elapsedMs = 0;
  private turns = true;
  private hull = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    spec: VehicleSpec,
  ) {
    this.ground = scene.add.graphics().setDepth(-100);
    this.lighting = scene.add
      .container(0, 0)
      .setDepth(TANK_LIGHTS.depth)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.drawGround();
    this.setVehicle(spec);
  }

  /** Vitrindeki aracı değiştirir; eskinin görünümü sökülür. */
  setVehicle(spec: VehicleSpec): void {
    this.view?.destroy();
    // Bacaklar dünya uzayında basılır: tablada dönen gövde ayakları geride bırakıp dolaşık bir poza sürükler.
    // Yürüyücü bu yüzden dönmez; taretleri salınır.
    this.turns = spec.kind !== 'walker';
    this.view = createVehicleView(this.scene, spec, this.lighting);
    this.view.root.setDepth(10);
  }

  /**
   * Tablayı ilerletir ve kamerayı yerleştirir: `stage` verilirse aracı o bölgeye oturtur (tam ekran
   * ekranlar), yoksa panelin bıraktığı boş alana.
   */
  update(deltaMs: number, panel?: PanelRect, stage?: StageRect): void {
    this.elapsedMs += Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    const seconds = this.elapsedMs / 1000;
    const hull = this.turns ? seconds * SHOWROOM.turntableRate : 0;
    this.hull = hull;
    this.view?.update(
      this.frame(hull, hull + Math.sin(seconds * SHOWROOM.turretSweepRate) * SHOWROOM.turretSweep),
      deltaMs,
    );
    this.frameCamera(panel, stage);
  }

  /** Vitrindeki gövdenin güncel yönü (rad). */
  get facing(): number {
    return this.hull;
  }

  destroy(): void {
    this.view?.destroy();
    this.view = undefined;
    this.lighting.destroy();
    this.ground.destroy();
  }

  private frame(hull: number, turret: number): TankFrame {
    return {
      x: 0,
      y: 0,
      hull,
      turret,
      pitch: 0,
      roll: 0,
      treadLeft: 0,
      treadRight: 0,
      speed: 0,
      vx: 0,
      vy: 0,
      angularVelocity: 0,
      boosting: false,
    };
  }

  /**
   * Aracı panelin bıraktığı boş alanın ortasına oturtur: panel yan şeritse alanın sağında, ekranı
   * kaplayan alt levhaysa üstünde. `panel` ekran CSS pikselindeki dikdörtgendir; yoksa tüm ekran boştur.
   */
  private frameCamera(panel: PanelRect | undefined, stage: StageRect | undefined): void {
    const camera = this.scene.cameras.main;
    const quality = renderQualityOf(this.scene);
    const width = camera.width / quality;
    const height = camera.height / quality;
    let focusX = width / 2;
    let focusY = height / 2;
    let freeWidth = width;
    let freeHeight = height;
    if (stage && stage.width > 0 && stage.height > 0) {
      focusX = stage.left + stage.width / 2;
      focusY = stage.top + stage.height / 2;
      freeWidth = stage.width;
      freeHeight = stage.height;
    } else if (panel && panel.width > 0) {
      if (panel.width > width * SHOWROOM.stackedFraction) {
        freeHeight = Math.max(0, panel.top);
        focusY = freeHeight / 2;
      } else {
        freeWidth = Math.max(0, width - panel.right);
        focusX = panel.right + freeWidth / 2;
      }
    }
    // Boş alana sığmayan araç kırpılmasın: yakınlaştırma alanın kısa kenarına göre küçülür.
    const zoom = Math.min(SHOWROOM.zoom, Math.min(freeWidth, freeHeight) / SHOWROOM.extent);
    camera.setZoom(quality * zoom);
    camera.centerOn((width / 2 - focusX) / zoom, (height / 2 - focusY) / zoom);
  }

  private drawGround(): void {
    const half = SHOWROOM.groundHalf;
    this.ground.fillStyle(PALETTE.sand, 1);
    this.ground.fillRect(-half, -half, half * 2, half * 2);
    for (const major of [false, true]) {
      const style = major ? PALETTE.gridMajor : PALETTE.gridMinor;
      this.ground.lineStyle(major ? 1.5 : 1, style.color, style.alpha);
      this.ground.beginPath();
      for (let at = -half; at <= half; at += SHOWROOM.gridStep) {
        if (((at / SHOWROOM.gridStep) % 4 === 0) !== major) continue;
        this.ground.moveTo(at, -half);
        this.ground.lineTo(at, half);
        this.ground.moveTo(-half, at);
        this.ground.lineTo(half, at);
      }
      this.ground.strokePath();
    }
  }
}
