import type Phaser from 'phaser';
import type { ChassisPose } from '@/sim/chassis/ChassisState';

/** Görünümün her kare okuduğu araç durumu (ara değerli poz + sürüş sinyalleri). */
export interface TankFrame extends ChassisPose {
  readonly treadLeft: number;
  readonly treadRight: number;
  readonly speed: number;
  /** Dünya hızı (birim/s): bacaklı araçların adım öngörüsü ve gövde yaslanması bunu okur. */
  readonly vx: number;
  readonly vy: number;
  readonly angularVelocity: number;
  readonly boosting: boolean;
}

/**
 * Bir aracın sahne karşılığı. Sahne ve efektler aracın türünü bilmez; kare başına `update`
 * çağırır, atışta `fire(mount)` der ve kapanışta `destroy` eder.
 */
export interface VehicleView {
  readonly root: Phaser.GameObjects.Container;
  /** `mount` ateşleyen yuvadır; tek namlulu araç bunu yok sayar. */
  fire(mount: number): void;
  /**
   * Araç duvara ya da başka araca çarptı; `strength` [0, 1]. Süspansiyonu olan paletli araç
   * bunu pozundan zaten okur, bacaklı araç çöküşünü buradan alır.
   */
  impact?(strength: number): void;
  update(frame: TankFrame, deltaMs: number): void;
  destroy(): void;
}
