import { Spring1D, type SpringConfig } from '../math/Spring';
import { clamp01, wrap } from '../math/interpolation';
import { TECH } from '../constants';
import type { Vector2 } from '../math/Vector2';
import type { RigMotionSignals } from './types';

export interface RigMotionModelConfig {
  /** Görsel facing'in yay sabitleri. Varsayılan: akıcı ama gecikmesiz bir dönüş. */
  facingSpring?: SpringConfig;
  /** Idle-dalga fazının saniyede ilerleme hızı (derece). */
  idlePhaseSpeedDegPerSec?: number;
  /** Bu büyüklüğün altındaki hareket niyeti "durmuş" sayılır (facing donar). */
  moveDeadzone?: number;
}

const DEFAULT_FACING_SPRING: SpringConfig = { stiffness: 120, damping: 14 };
const DEFAULT_IDLE_PHASE_SPEED_DEG_PER_SEC = 90;
const DEFAULT_MOVE_DEADZONE = 0.05;

/**
 * Ham WASD niyetinden (rig/yaratık kelime dağarcığından bağımsız) sürekli,
 * render-only sinyaller üreten model: anlık locomotion (motion01), yay-
 * sönümlü facing/dönüş sinyali ve hiç durmadan ilerleyen bir idle-dalga fazı.
 *
 * Simülasyona/determinizme dokunmaz; yalnız çizim anının poz sinyallerini
 * sürer. `RigPartAnimator` bu sinyalleri per-grup hedeflere çevirir.
 */
export class RigMotionModel {
  private readonly facingSpring = new Spring1D(0);
  private readonly facingSpringConfig: SpringConfig;
  private readonly idlePhaseSpeedDegPerSec: number;
  private readonly moveDeadzone: number;
  private hasFacing = false;
  private idlePhaseDeg = 0;

  constructor(config: RigMotionModelConfig = {}) {
    this.facingSpringConfig = config.facingSpring ?? DEFAULT_FACING_SPRING;
    this.idlePhaseSpeedDegPerSec =
      config.idlePhaseSpeedDegPerSec ?? DEFAULT_IDLE_PHASE_SPEED_DEG_PER_SEC;
    this.moveDeadzone = config.moveDeadzone ?? DEFAULT_MOVE_DEADZONE;
  }

  /**
   * Bir render karesi ilerletir. `moveIntent` ham hareket niyetidir (-1..1
   * büyüklük); büyüklüğü dead-zone'un altındaysa mevcut facing korunur
   * (hareketsizken yöne sıfıra sıçramaz).
   */
  update(moveIntent: Vector2, deltaMs: number): RigMotionSignals {
    const dtSec =
      (Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : TECH.MS_PER_SECOND / 60) /
      TECH.MS_PER_SECOND;

    const magnitude = moveIntent.length();
    const motion01 = smoothstep(clamp01(magnitude));

    const currentFacing = this.hasFacing ? this.facingSpring.value : 0;
    const targetFacingRad =
      magnitude > this.moveDeadzone ? Math.atan2(moveIntent.y, moveIntent.x) : currentFacing;

    if (!this.hasFacing) {
      this.facingSpring.reset(targetFacingRad);
      this.hasFacing = true;
    }

    // En-kısa-yol açı farkı: ±π sarımında sıçramasız bir yay için, yayı ham
    // hedefe değil, mevcut değere en yakın "sarılmamış" hedefe besleriz.
    const shortestDelta = wrap(targetFacingRad - this.facingSpring.value, -Math.PI, Math.PI);
    const unwrappedTarget = this.facingSpring.value + shortestDelta;
    this.facingSpring.update(unwrappedTarget, deltaMs, this.facingSpringConfig);

    this.idlePhaseDeg = wrap(this.idlePhaseDeg + this.idlePhaseSpeedDegPerSec * dtSec, 0, 360);

    return {
      motion01,
      idlePhaseDeg: this.idlePhaseDeg,
      facingRad: wrap(this.facingSpring.value, -Math.PI, Math.PI),
      turnVelocityRadPerSec: this.facingSpring.velocity,
    };
  }
}

/** Doğrusal geçişten daha yumuşak bir 0..1 eğrisi — idle/hareket sınırında sıçrama olmasın diye. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
