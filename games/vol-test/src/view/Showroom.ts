import Phaser from 'phaser';
import { MENU } from '@/config/menu';
import { PALETTE } from '@/config/palette';
import { TANK_LIGHTS } from '@/config/tankView';
import type { VehicleSpec } from '@/config/vehicles';
import { renderQualityOf } from '@/scenes/world/CameraRig';
import { createVehicleView } from './createView';
import { freeArea, type FreeArea, type PanelRect } from './menuLayout';
import type { TankFrame, VehicleView } from './VehicleView';

const SHOWROOM = MENU.showroom;

/**
 * Araç seçilen ekranların (garaj, geliştirici) vitrini: oyundaki gerçek araç görünümünü yavaş dönen bir
 * tablada gösterir. Zemin saydamdır (arkada yürüyüş alayı oynar); araca yalnız bir gölge ve halka verilir.
 * Görünüm sınıfları oyunla aynıdır; yeni araç otomatik olarak vitrine girer.
 */
export class Showroom {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly lighting: Phaser.GameObjects.Container;
  private view: VehicleView | undefined;
  private elapsedMs = 0;
  private turns = true;
  private hull = 0;
  private extent: number = SHOWROOM.extent;
  private area: FreeArea | undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    spec: VehicleSpec,
  ) {
    this.ground = scene.add.graphics().setDepth(-100);
    this.lighting = scene.add
      .container(0, 0)
      .setDepth(TANK_LIGHTS.depth)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.drawDisc();
    this.setVehicle(spec);
  }

  /** Vitrindeki aracı değiştirir; eskinin görünümü sökülür. */
  setVehicle(spec: VehicleSpec): void {
    this.view?.destroy();
    // Bacaklar dünya uzayında basılır: tablada dönen gövde ayakları geride bırakıp dolaşık bir poza sürükler.
    // Yürüyücü bu yüzden dönmez; taretleri salınır.
    this.turns = spec.kind !== 'walker';
    this.extent = SHOWROOM.vehicleExtent[spec.id] ?? SHOWROOM.extent;
    this.view = createVehicleView(this.scene, spec, this.lighting);
    this.view.root.setDepth(10);
  }

  /**
   * Tabla saati (ms). Ekranlar arası geçişte saat taşınır: aynı araç aynı açıda kalır ve dönüş yeni
   * sahnede başa sarmaz.
   */
  get clockMs(): number {
    return this.elapsedMs;
  }

  set clockMs(value: number) {
    if (Number.isFinite(value) && value >= 0) this.elapsedMs = value;
  }

  /** Tablayı ilerletir ve kamerayı panelin bıraktığı boş alana yerleştirir. */
  update(deltaMs: number, panel?: PanelRect): void {
    this.elapsedMs += Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    const seconds = this.elapsedMs / 1000;
    const hull = this.turns ? seconds * SHOWROOM.turntableRate : 0;
    this.hull = hull;
    this.view?.update(
      this.frame(hull, hull + Math.sin(seconds * SHOWROOM.turretSweepRate) * SHOWROOM.turretSweep),
      deltaMs,
    );
    this.frameCamera(panel);
  }

  /** Son karede araca ayrılan boş alan (CSS piksel); henüz kare yoksa `undefined`. */
  get freeArea(): FreeArea | undefined {
    return this.area;
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
   * Aracı panelin bıraktığı boş alanın ortasına oturtur: panel yan şeritse alanın geniş kalan yanında,
   * ekranı kaplayan alt levhaysa üstünde. `panel` ekran CSS pikselindeki dikdörtgendir; yoksa tüm ekran boştur.
   */
  private frameCamera(panel: PanelRect | undefined): void {
    const camera = this.scene.cameras.main;
    const quality = renderQualityOf(this.scene);
    const width = camera.width / quality;
    const height = camera.height / quality;
    const free = freeArea(width, height, SHOWROOM.stackedFraction, panel);
    this.area = free;
    // Boş alana sığmayan araç kırpılmasın: yakınlaştırma alanın kısa kenarına göre küçülür.
    const zoom = Math.min(SHOWROOM.zoom, Math.min(free.width, free.height) / this.extent);
    camera.setZoom(quality * zoom);
    camera.centerOn(
      (width / 2 - (free.x + free.width / 2)) / zoom,
      (height / 2 - (free.y + free.height / 2)) / zoom,
    );
  }

  /** Aracı yerine bağlayan yumuşak gölge ve ince bir tabla halkası. */
  private drawDisc(): void {
    this.ground.clear();
    const { shadow, ring } = SHOWROOM.disc;
    const radius = this.extent * ring.radius;
    for (const layer of shadow.layers) {
      this.ground.fillStyle(0x000000, shadow.alpha / shadow.layers.length);
      this.ground.fillCircle(0, 0, radius * layer);
    }
    this.ground.lineStyle(ring.width, PALETTE.gridMajor.color, ring.alpha);
    this.ground.strokeCircle(0, 0, radius);
  }
}
