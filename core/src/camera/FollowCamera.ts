import { Spring1D, type SpringConfig } from '../math/Spring';
import { clamp } from '../math/interpolation';
import { valueNoise } from '../random/noise';

/** Takip kamerası ayarları; süreler milisaniye, ötelemeler dünya birimidir. */
export interface FollowCameraConfig {
  /** Takibin zaman sabiti: kalan mesafenin ~%63'ü bu sürede kapanır. */
  readonly followMs: number;
  readonly zoomMin: number;
  readonly zoomMax: number;
  readonly zoomDefault: number;
  /** Bir zoom kademesinin çarpanı. */
  readonly zoomStep: number;
  readonly zoomMs: number;
  /** Yaylı tepme (ör. ateş): yay ayarı ve azami öteleme. */
  readonly kick: SpringConfig & { readonly max: number };
  /** Sarsıntının azami ötelemesi ve saniyelik sönümü. */
  readonly shakeMax: number;
  readonly shakeDecay: number;
}

/** Zaman sabitli üstel yaklaşım; kare hızından bağımsızdır. */
function follow(current: number, target: number, timeConstantMs: number, deltaMs: number): number {
  if (deltaMs <= 0) return current;
  return target + (current - target) * Math.exp(-deltaMs / timeConstantMs);
}

/**
 * Oyuncuyu izleyen kamera modeli; render motorundan bağımsızdır. Hedefi (ara değerli gövde konumu) zaman
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
  private readonly kickX = new Spring1D();
  private readonly kickY = new Spring1D();
  private trauma = 0;
  private timeMs = 0;
  shakeX = 0;
  shakeY = 0;

  constructor(
    private readonly config: FollowCameraConfig,
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
    this.kickX.velocity -= Math.cos(angle) * strength;
    this.kickY.velocity -= Math.sin(angle) * strength;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Görüntünün toplam ötelemesi (tepme + sarsıntı). */
  get offsetX(): number {
    return this.kickX.value + this.shakeX;
  }

  get offsetY(): number {
    return this.kickY.value + this.shakeY;
  }

  update(targetX: number, targetY: number, deltaMs: number): void {
    const config = this.config;
    this.timeMs += deltaMs;
    this.zoom = follow(this.zoom, this.targetZoom, config.zoomMs, deltaMs);
    this.x = follow(this.x, targetX, config.followMs, deltaMs);
    this.y = follow(this.y, targetY, config.followMs, deltaMs);
    this.clampCenter();

    const dt = Math.min(deltaMs, 50) / 1000;
    for (const spring of [this.kickX, this.kickY]) {
      spring.update(0, deltaMs, config.kick);
      spring.value = clamp(spring.value, -config.kick.max, config.kick.max);
    }

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
