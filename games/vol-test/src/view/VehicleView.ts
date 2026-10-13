import type Phaser from 'phaser';
import type { ChassisPose } from '@/sim/chassis/ChassisState';

/** Görünümün her kare okuduğu araç durumu (ara değerli poz + sürüş sinyalleri). */
export interface TankFrame extends ChassisPose {
  readonly treadLeft: number;
  readonly treadRight: number;
  readonly speed: number;
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
  update(frame: TankFrame, deltaMs: number): void;
  destroy(): void;
}
