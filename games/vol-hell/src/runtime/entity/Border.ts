import Phaser from 'phaser';
import { borderConfig, type BorderBounds } from '@/config/border';
import { RENDER_DEPTH } from '@/config/layers';

export interface ArenaReserve {
  readonly top: number;
  readonly bottom: number;
}

export type ArenaReserveProvider = () => ArenaReserve;

export function computeArenaBounds(
  width: number,
  height: number,
  reserve: ArenaReserve = { top: 0, bottom: 0 },
): BorderBounds {
  const margin = Math.min(
    borderConfig.margin,
    width * borderConfig.maxMarginRatio,
    height * borderConfig.maxMarginRatio,
  );
  const safeTop = Number.isFinite(reserve.top) ? Math.max(0, reserve.top) : 0;
  const safeBottom = Number.isFinite(reserve.bottom) ? Math.max(0, reserve.bottom) : 0;
  const desiredTop = Math.max(margin, safeTop + borderConfig.hudGapPx);
  const desiredBottom = Math.max(margin, safeBottom + borderConfig.hudGapPx);
  const topExtra = desiredTop - margin;
  const bottomExtra = desiredBottom - margin;
  const extraTotal = topExtra + bottomExtra;
  const maxReserved = Math.max(margin * 2, height * borderConfig.maxReserveRatio);
  const allowedExtra = Math.max(0, maxReserved - margin * 2);
  const scale = extraTotal > allowedExtra && extraTotal > 0 ? allowedExtra / extraTotal : 1;
  const top = margin + topExtra * scale;
  const bottomInset = margin + bottomExtra * scale;

  return {
    left: margin,
    right: width - margin,
    top,
    bottom: height - bottomInset,
    width: width - margin * 2,
    height: height - top - bottomInset,
    centerX: width / 2,
    centerY: (top + height - bottomInset) / 2,
  };
}

/**
 * Saha sınırı — kameradan küçük bir dikdörtgen.
 * Hiçbir şey (oyuncu, mermi, düşman) dışarı çıkamaz.
 * Normal oyuncu mermileri duvardan sekebilir; kule mermileri sınır temasında
 * `TurretShot` tarafından sekmeden yok edilir. Oyuncu ve düşman duvara çarpar.
 */
export class Border {
  readonly graphics: Phaser.GameObjects.Graphics;
  bounds: BorderBounds;
  private readonly sceneRef: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    private readonly reserveProvider: ArenaReserveProvider = () => ({ top: 0, bottom: 0 }),
  ) {
    this.sceneRef = scene;
    const world = worldSizeOf(scene);
    this.bounds = computeArenaBounds(world.width, world.height, this.reserveProvider());

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(RENDER_DEPTH.border);
    this.draw();

    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  private onResize(): void {
    // `gameSize` RASTERLEME boyutudur (backing store). Saha DÜNYA biriminde
    // yaşar; ikisi kalite ayarına göre ayrışır, bu yüzden kameradan okunur.
    this.refresh();
  }

  refresh(): void {
    const world = worldSizeOf(this.sceneRef);
    this.bounds = computeArenaBounds(world.width, world.height, this.reserveProvider());
    this.draw();
  }

  private draw(): void {
    const { left, top, width, height } = this.bounds;
    this.graphics.clear();
    this.graphics.lineStyle(borderConfig.lineWidth, borderConfig.color, borderConfig.alpha);
    this.graphics.strokeRect(left, top, width, height);
  }

  /** Verilen pozisyonu sınır içine clamp eder. */
  clamp(x: number, y: number, radius: number): { x: number; y: number } {
    return {
      x: Phaser.Math.Clamp(x, this.bounds.left + radius, this.bounds.right - radius),
      y: Phaser.Math.Clamp(y, this.bounds.top + radius, this.bounds.bottom - radius),
    };
  }

  /** X eksenini sınır içine clamp eder — obje yaratmaz. */
  clampX(x: number, radius: number): number {
    return Phaser.Math.Clamp(x, this.bounds.left + radius, this.bounds.right - radius);
  }

  /** Y eksenini sınır içine clamp eder — obje yaratmaz. */
  clampY(y: number, radius: number): number {
    return Phaser.Math.Clamp(y, this.bounds.top + radius, this.bounds.bottom - radius);
  }

  destroy(): void {
    this.sceneRef.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.graphics.destroy();
  }
}

/**
 * Sahnenin DÜNYA boyutu (CSS pikseli) — rasterleme boyutundan bağımsız.
 *
 * `scene.scale` backing store'u verir ve kalite ayarı onu küçültür. Kamera
 * aynı çarpanla yakınlaştırıldığı için gerçek dünya alanı `viewport / zoom`
 * olur ve çözünürlükten etkilenmez.
 */
function worldSizeOf(scene: Phaser.Scene): { width: number; height: number } {
  const camera = scene.cameras?.main;
  const zoom = camera && Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  const width = camera ? camera.width : scene.scale.width;
  const height = camera ? camera.height : scene.scale.height;
  return { width: width / zoom, height: height / zoom };
}
