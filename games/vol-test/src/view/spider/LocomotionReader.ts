import { clamp01 } from '@volstudio/core';
import { Spring1D, type SpringConfig } from '@volstudio/core/math';
import type { TankFrame } from '../VehicleView';
import type { LocomotionSignals } from './signals';

/** Simülasyon adımı: ivme, hızın değiştiği iki kare arasından okunur ve bundan kısa süreye bölünmez. */
const SIM_STEP_SECONDS = 1 / 60;

/** Okuyucunun türe özgü sayıları: sanat ölçeği, atılım yumuşatması, çarpma sönmesi, ışınlanma eşiği. */
export interface LocomotionTuning {
  /** Dünya biriminden sanat pikseline çarpan. */
  readonly worldToArt: number;
  readonly dashSpring: SpringConfig;
  readonly impactFalloffMs: number;
  /** Bir kareden ötekine bu kadar uzağa giden araç ışınlanmıştır (dünya birimi). */
  readonly teleportUnits: number;
}

/**
 * Bacaklı araçların görünümü için kare sinyallerini simülasyon durumundan türetir. Hız yalnız
 * simülasyon adımında değişir; ivme de değiştiği anda iki değişim arasındaki süreye bölünerek okunur
 * ve bir sonrakine kadar tutulur. Her çizim karesinde fark almak, yüksek kare hızında adımlar arasında
 * sıfır, adım karesinde ise gerçek ivmenin birkaç katı üretirdi.
 */
export class LocomotionReader {
  /** Uzuv ve gövde sürücülerinin ödünç okuduğu sinyaller; her karede yeniden yazılır. */
  readonly signals: LocomotionSignals = {
    x: 0,
    y: 0,
    velX: 0,
    velY: 0,
    speed: 0,
    accelX: 0,
    accelY: 0,
    travelHeadingRad: 0,
    facingHeadingRad: 0,
    turnRateRadPerSec: 0,
    dash01: 0,
    impact01: 0,
  };
  private readonly dashSpring = new Spring1D();
  private placed = false;
  private lastX = 0;
  private lastY = 0;
  private lastVx = 0;
  private lastVy = 0;
  private sinceVelocityChangeMs = 0;
  private impact01 = 0;

  constructor(private readonly tuning: LocomotionTuning) {}

  /** Araç duvara ya da başka araca çarptı; `strength` [0, 1]. */
  impact(strength: number): void {
    this.impact01 = Math.max(this.impact01, clamp01(strength));
  }

  /**
   * Sinyalleri bu kare için yeniden yazar. Dönen değer bacakların gövdenin altına adımsız
   * yerleşmesi gereken karedir: ilk kare ya da ışınlanma (yeniden doğuş).
   */
  read(frame: TankFrame, deltaMs: number): boolean {
    const teleported =
      this.placed &&
      Math.hypot(frame.x - this.lastX, frame.y - this.lastY) > this.tuning.teleportUnits;
    this.lastX = frame.x;
    this.lastY = frame.y;
    const fresh = !this.placed || teleported;

    const signals = this.signals;
    const velX = frame.vx * this.tuning.worldToArt;
    const velY = frame.vy * this.tuning.worldToArt;
    this.sinceVelocityChangeMs += deltaMs;
    // İlk kare (ya da ışınlanma) yürüyen bir araçta sahte bir ivme sıçraması üretmesin.
    if (fresh) {
      this.lastVx = velX;
      this.lastVy = velY;
      signals.accelX = 0;
      signals.accelY = 0;
      this.sinceVelocityChangeMs = 0;
    }

    if (velX !== this.lastVx || velY !== this.lastVy) {
      const span = Math.max(this.sinceVelocityChangeMs / 1000, SIM_STEP_SECONDS);
      signals.accelX = (velX - this.lastVx) / span;
      signals.accelY = (velY - this.lastVy) / span;
      this.lastVx = velX;
      this.lastVy = velY;
      this.sinceVelocityChangeMs = 0;
    }

    signals.x = frame.x * this.tuning.worldToArt;
    signals.y = frame.y * this.tuning.worldToArt;
    signals.velX = velX;
    signals.velY = velY;
    signals.speed = Math.hypot(velX, velY);
    signals.facingHeadingRad = frame.hull;
    // Gövde durunca hızın yönü anlamsızdır; bakış yönüne düşülür (bkz. `LocomotionSignals`).
    signals.travelHeadingRad = signals.speed > 1e-3 ? Math.atan2(velY, velX) : frame.hull;
    signals.turnRateRadPerSec = frame.angularVelocity;
    signals.dash01 = clamp01(
      this.dashSpring.update(frame.boosting ? 1 : 0, deltaMs, this.tuning.dashSpring),
    );
    // Sönme kare başında alınır: bu karede kurulan yankı anında sönmez.
    this.impact01 = Math.max(0, this.impact01 - deltaMs / this.tuning.impactFalloffMs);
    signals.impact01 = this.impact01;
    this.placed = true;
    return fresh;
  }
}
