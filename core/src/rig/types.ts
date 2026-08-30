/**
 * `RigMotionModel.update()`'in ürettiği sürekli hareket sinyalleri. Rig ya da
 * yaratık kelime dağarcığı taşımaz.
 */
export interface RigMotionSignals {
  /** [0,1] — hareket niyetinin büyüklüğü, yumuşatılmış. */
  motion01: number;
  /** [0,360) derece — hiç durmadan ilerleyen idle-dalga fazı. */
  idlePhaseDeg: number;
  /** Radyan — yay-yumuşatılmış görsel yön. */
  facingRad: number;
  /** Radyan/saniye — facing yayının anlık hızı; dönüş şiddetini verir. */
  turnVelocityRadPerSec: number;
}
