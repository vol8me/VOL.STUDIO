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
  /** Kaya tırmanışı [0, 1] (yalnız yürüyücü; yoksa 0). Simülasyonun türetilmiş değeridir, ağdan gelmez. */
  readonly climb?: number;
}

/**
 * Bir aracın sahne karşılığı. Sahne ve efektler aracın türünü bilmez; kare başına `update`
 * çağırır, atışta `fire(mount)` der ve kapanışta `destroy` eder.
 */
export interface VehicleView {
  readonly root: Phaser.GameObjects.Container;
  /** `mount` ateşleyen yuvadır; tek namlulu araç bunu yok sayar. */
  fire(mount: number): void;
  /** Araç duvara ya da başka araca çarptı; `strength` [0, 1]. Bacaklı araç çöküşünü buradan alır. */
  impact?(strength: number): void;
  /** Mermi kalkana değdi (dünya konumu): açıksa vuruş dalgası çizilir ve `true` döner, gövde kıymığı çizilmez. */
  absorb?(x: number, y: number): boolean;
  update(frame: TankFrame, deltaMs: number): void;
  /** Kırık parçaların bit maskesi (`sim/chassis/parts.ts`); maske değişince çağrılır, görünüm durumu maskeden kurar. */
  setParts(mask: number): void;
  /** Araç sahnede mi: imha edilen araç patlar ve tümden gizlenir, yeniden doğunca döner. Gizliyken `update` çağrılmaz. */
  setPresent(present: boolean): void;
  /** Araç imha edildi mi: ölen araç yanmış, ışıksız ve donuk bir gövde olarak kalır; `false` eski hâline getirir. */
  setWrecked(wrecked: boolean): void;
  /** Batış ilerlemesi [0, 1]: derin suda ölen araç kararır, küçülür ve solar; 0 eski hâline getirir. */
  sink?(progress: number): void;
  /** Canlı aracın suyun derinliği [0, 1]: derinde gövde suyun rengine çekilir; 0 kıyıdır. */
  submerge?(depth: number): void;
  destroy(): void;
}
