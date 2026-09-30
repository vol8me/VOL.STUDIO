import { clamp } from '@volstudio/core/math/interpolation';
import { valueNoise } from '../noise';
import type { CameraConfig } from '@/config/camera';

/** Zaman sabitli üstel yaklaşım; kare hızından bağımsızdır. */
function follow(current: number, target: number, timeConstantMs: number, deltaMs: number): number {
  if (deltaMs <= 0) return current;
  return target + (current - target) * Math.exp(-deltaMs / timeConstantMs);
}

/**
 * Oyuncuyu izleyen kamera modeli. Hedefi (ara değerli gövde konumu) zaman
 * sabitli üstel yaklaşımla izler, dünya sınırına kelepçelenir. Üstüne iki
 * sunum katmanı biner: ateşte yaylı tepme, çarpmada sönen sarsıntı. Her ikisi
 * de merkezi değil yalnız görüntü ötelemesini değiştirir.
 */
export class FollowCamera {
  x = 0;
  y = 0;
  zoom: number;
  private targetZoom: number;
  private viewWidth = 1;
  private viewHeight = 1;
  private kickX = 0;
  private kickY = 0;
  private kickVx = 0;
  private kickVy = 0;
  private trauma = 0;
  private timeMs = 0;
  shakeX = 0;
  shakeY = 0;

  constructor(
    private readonly config: CameraConfig,
    private readonly worldWidth: number,
    private readonly worldHeight: number,
  ) {
    this.zoom = config.zoomDefault;
    this.targetZoom = config.zoomDefault;
  }

  /** Kameranın zoom 1'deki görüntü alanı (CSS piksel). */
  setViewport(width: number, height: number): void {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    this.clampCenter();
  }

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.clampCenter();
  }

  get zoomTarget(): number {
    return this.targetZoom;
  }

  zoomBy(steps: number): void {
    this.setZoom(this.targetZoom * Math.pow(this.config.zoomStep, steps));
  }

  setZoom(zoom: number): void {
    this.targetZoom = clamp(zoom, this.config.zoomMin, this.config.zoomMax);
  }

  /** Ateş tepmesi: görüntü `angle` yönünün tersine `strength` birim/s ile itilir. */
  kick(angle: number, strength: number): void {
    this.kickVx -= Math.cos(angle) * strength;
    this.kickVy -= Math.sin(angle) * strength;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Görüntünün toplam ötelemesi (tepme + sarsıntı). */
  get offsetX(): number {
    return this.kickX + this.shakeX;
  }

  get offsetY(): number {
    return this.kickY + this.shakeY;
  }

  update(targetX: number, targetY: number, deltaMs: number): void {
    const config = this.config;
    this.timeMs += deltaMs;
    this.zoom = follow(this.zoom, this.targetZoom, config.zoomMs, deltaMs);
    this.x = follow(this.x, targetX, config.followMs, deltaMs);
    this.y = follow(this.y, targetY, config.followMs, deltaMs);
    this.clampCenter();

    const dt = Math.min(deltaMs, 50) / 1000;
    const { stiffness, damping, max } = config.kick;
    this.kickVx += (-stiffness * this.kickX - damping * this.kickVx) * dt;
    this.kickVy += (-stiffness * this.kickY - damping * this.kickVy) * dt;
    this.kickX = clamp(this.kickX + this.kickVx * dt, -max, max);
    this.kickY = clamp(this.kickY + this.kickVy * dt, -max, max);

    this.trauma = Math.max(0, this.trauma - config.shakeDecay * dt);
    const shake = this.trauma * this.trauma * config.shakeMax;
    const t = this.timeMs * 0.03;
    this.shakeX = shake * (valueNoise(t, 0.5, 0x51) * 2 - 1);
    this.shakeY = shake * (valueNoise(0.5, t, 0x77) * 2 - 1);
  }

  /** Görünen dünya dikdörtgeni (ötelemesiz). */
  visibleRect(): { x: number; y: number; width: number; height: number } {
    const width = this.viewWidth / this.zoom;
    const height = this.viewHeight / this.zoom;
    return { x: this.x - width / 2, y: this.y - height / 2, width, height };
  }

  private clampCenter(): void {
    const halfWidth = this.viewWidth / this.zoom / 2;
    const halfHeight = this.viewHeight / this.zoom / 2;
    this.x =
      halfWidth * 2 >= this.worldWidth
        ? this.worldWidth / 2
        : clamp(this.x, halfWidth, this.worldWidth - halfWidth);
    this.y =
      halfHeight * 2 >= this.worldHeight
        ? this.worldHeight / 2
        : clamp(this.y, halfHeight, this.worldHeight - halfHeight);
  }
}
