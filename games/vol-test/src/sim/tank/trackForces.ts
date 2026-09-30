import { clamp } from '@volstudio/core/math/interpolation';
import type { RigidBody } from '@volstudio/core/physics';
import type { TankConfig } from '@/config/tank';

/** Bir alt adımda paletlerin gövdeye uyguladığı kuvvetler (gövde çerçevesi). */
export interface TrackForces {
  /** İleri eksende toplam itki (N karşılığı: kg·birim/s²). */
  forward: number;
  /** Sağ eksende yanal sürtünme kuvveti. */
  lateral: number;
  torque: number;
  /** Paletlerin yerdeki hızları (birim/s). */
  groundLeft: number;
  groundRight: number;
  /** Palet yüzeyi ile zemin arasındaki en büyük hız farkı: patinaj. */
  slip: number;
}

export function createTrackForces(): TrackForces {
  return { forward: 0, lateral: 0, torque: 0, groundLeft: 0, groundRight: 0, slip: 0 };
}

/**
 * Paletli aracın zemin kuvvetleri.
 *
 * - Çekiş: palet yüzey hızı ile zemin hızı farkı; Coulomb sürtünmesiyle
 *   (μ·N) sınırlı, fazlası patinajdır.
 * - Direksiyon ünitesi paletler arasındaki itki FARKINI önceliklendirir: ortak
 *   itki kalan sürtünme payına sığar. Aksi hâlde tam gaz kalkışta iki palet
 *   de tavanda doyar ve dönüş torku kaybolur.
 * - Motor gücü iki palet arasında paylaşılır ve yalnız hızı büyüten itkiyi
 *   sınırlar (itki × zemin hızı > 0); fren sürtünmeyle sınırlıdır.
 * - Yanal kayma ve dönme, palet boyuna yayılmış sürtünmeyle direnir; dönme
 *   direnci hızla azalır (dönüş yarıçapı büyüdükçe yanal direnç düşer).
 */
export function computeTrackForces(
  body: RigidBody,
  trackLeft: number,
  trackRight: number,
  boosting: boolean,
  config: TankConfig,
  out: TrackForces,
): TrackForces {
  const mass = body.mass;
  const forward = body.forwardSpeed;
  const offset = config.trackOffset;
  const load = (mass * config.gravity) / 2;
  const grip = config.tractionFriction * load;
  const stiffness = config.tractionStiffness * (mass / 2);
  const groundLeft = forward + body.angularVelocity * offset;
  const groundRight = forward - body.angularVelocity * offset;

  const rawLeft = stiffness * (trackLeft - groundLeft);
  const rawRight = stiffness * (trackRight - groundRight);
  const difference = clamp((rawLeft - rawRight) / 2, -grip, grip);
  const headroom = grip - Math.abs(difference);
  const common = clamp((rawLeft + rawRight) / 2, -headroom, headroom);
  let driveLeft = common + difference;
  let driveRight = common - difference;

  const power = config.enginePower * (boosting ? config.boostPower : 1);
  const demand = (force: number, ground: number): number =>
    force * ground > 0 ? Math.abs(force) * Math.max(Math.abs(ground), config.powerMinSpeed) : 0;
  const total = demand(driveLeft, groundLeft) + demand(driveRight, groundRight);
  if (total > power) {
    const scale = power / total;
    if (driveLeft * groundLeft > 0) driveLeft *= scale;
    if (driveRight * groundRight > 0) driveRight *= scale;
  }

  const rolling = (speed: number): number => config.rollingResistance * load * Math.tanh(speed / 8);
  const forceLeft = driveLeft - rolling(groundLeft);
  const forceRight = driveRight - rolling(groundRight);

  const lateralLimit = config.lateralFriction * mass * config.gravity;
  const lateral = -clamp(
    config.lateralStiffness * mass * body.lateralSpeed,
    -lateralLimit,
    lateralLimit,
  );
  const turnLimit =
    (lateralLimit * config.trackContactLength) /
    4 /
    (1 + Math.abs(forward) / config.turnResistanceSpeed);
  const turnResistance = -clamp(
    config.lateralStiffness * body.inertia * body.angularVelocity,
    -turnLimit,
    turnLimit,
  );

  out.forward = forceLeft + forceRight;
  out.lateral = lateral;
  out.torque = (forceLeft - forceRight) * offset + turnResistance;
  out.groundLeft = groundLeft;
  out.groundRight = groundRight;
  out.slip = Math.max(Math.abs(trackLeft - groundLeft), Math.abs(trackRight - groundRight));
  return out;
}
