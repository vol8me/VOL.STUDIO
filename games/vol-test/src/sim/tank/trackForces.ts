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
  /** Palet yüzeyinin zemine göre kayma hızı (boylamsal ve yanal bileşke, birim/s). */
  slideLeft: number;
  slideRight: number;
  /** İki paletin en büyük kayma hızı. */
  slip: number;
}

export function createTrackForces(): TrackForces {
  return {
    forward: 0,
    lateral: 0,
    torque: 0,
    groundLeft: 0,
    groundRight: 0,
    slideLeft: 0,
    slideRight: 0,
    slip: 0,
  };
}

/**
 * Kayma hızına bağlı sürtünme katsayısı (Stribeck): tutunan palet statik
 * katsayıyı, kayan palet kinetik katsayıyı görür; geçiş üsteldir, sıçrama
 * yoktur. Kilitli palet bu yüzden tutunarak durandan uzun yol alır.
 */
function friction(staticMu: number, kineticMu: number, slide: number, scale: number): number {
  return kineticMu + (staticMu - kineticMu) * Math.exp(-slide / scale);
}

/**
 * Paletli aracın zemin kuvvetleri.
 *
 * - Çekiş: palet yüzey hızı ile zemin hızı farkı; Coulomb sürtünmesiyle
 *   (μ·N) sınırlı, fazlası patinajdır. μ kayma hızıyla statikten kinetiğe iner.
 * - Direksiyon ünitesi paletler arasındaki itki FARKINI önceliklendirir: ortak
 *   itki kalan sürtünme payına sığar. Aksi hâlde tam gaz kalkışta iki palet
 *   de tavanda doyar ve dönüş torku kaybolur.
 * - Motor gücü iki palet arasında paylaşılır ve yalnız hızı büyüten itkiyi
 *   sınırlar (itki × zemin hızı > 0); fren sürtünmeyle sınırlıdır.
 * - Birleşik kayma: bir palet boylamsal ve yanal sürtünmeyi aynı temas
 *   yüzeyinden alır. Kayma normalize edilmiş elipsin dışına çıkınca kuvvet
 *   kayma yönünde elipse izdüşürülür (Coulomb). Kilitli ve kayan palet bu
 *   yüzden yanal tutuşunu yitirir; keskin dönüşte frenleyen tank kayar.
 * - Dönme, palet boyuna yayılmış yanal sürtünmeyle direnir; direnç hızla ve
 *   paletlerin kaymasıyla azalır.
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
  const lateralSpeed = body.lateralSpeed;
  const offset = config.trackOffset;
  const load = (mass * config.gravity) / 2;
  const stiffness = config.tractionStiffness * (mass / 2);
  const lateralStiffness = config.lateralStiffness * (mass / 2);
  const groundLeft = forward + body.angularVelocity * offset;
  const groundRight = forward - body.angularVelocity * offset;

  const slideLeft = Math.hypot(trackLeft - groundLeft, lateralSpeed);
  const slideRight = Math.hypot(trackRight - groundRight, lateralSpeed);
  const muLeft = friction(
    config.tractionFriction,
    config.tractionKinetic,
    slideLeft,
    config.slidingSpeed,
  );
  const muRight = friction(
    config.tractionFriction,
    config.tractionKinetic,
    slideRight,
    config.slidingSpeed,
  );
  const sideLeft = friction(
    config.lateralFriction,
    config.lateralKinetic,
    slideLeft,
    config.slidingSpeed,
  );
  const sideRight = friction(
    config.lateralFriction,
    config.lateralKinetic,
    slideRight,
    config.slidingSpeed,
  );

  const rawLeft = stiffness * (trackLeft - groundLeft);
  const rawRight = stiffness * (trackRight - groundRight);
  const grip = Math.min(muLeft, muRight) * load;
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

  // Birleşik kayma: normalize kayma vektörü |n| > 1 ise kuvvet elipse izdüşer.
  const lateralDemand = -lateralStiffness * lateralSpeed;
  const combine = (raw: number, mu: number, side: number): number => {
    const along = raw / (mu * load);
    const across = lateralDemand / (side * load);
    return Math.hypot(along, across);
  };
  const usageLeft = combine(rawLeft, muLeft, sideLeft);
  const usageRight = combine(rawRight, muRight, sideRight);
  const alongShare = (raw: number, mu: number, usage: number): number => {
    if (usage <= 1) return 1;
    const along = Math.abs(raw) / (mu * load);
    return along / usage / Math.max(Math.min(1, along), 1e-9);
  };
  driveLeft *= Math.min(1, alongShare(rawLeft, muLeft, usageLeft));
  driveRight *= Math.min(1, alongShare(rawRight, muRight, usageRight));
  const lateralLeft = clamp(
    lateralDemand / Math.max(1, usageLeft),
    -sideLeft * load,
    sideLeft * load,
  );
  const lateralRight = clamp(
    lateralDemand / Math.max(1, usageRight),
    -sideRight * load,
    sideRight * load,
  );

  const rolling = (speed: number): number => config.rollingResistance * load * Math.tanh(speed / 8);
  const forceLeft = driveLeft - rolling(groundLeft);
  const forceRight = driveRight - rolling(groundRight);

  // Dönme direnci: palet boyuna yayılmış yanal sürtünme; kayan palet onu taşımaz.
  const turnGrip = (sideLeft / Math.max(1, usageLeft) + sideRight / Math.max(1, usageRight)) / 2;
  const turnLimit =
    (turnGrip * mass * config.gravity * config.trackContactLength) /
    4 /
    (1 + Math.abs(forward) / config.turnResistanceSpeed);
  const turnResistance = -clamp(
    config.lateralStiffness * body.inertia * body.angularVelocity,
    -turnLimit,
    turnLimit,
  );

  out.forward = forceLeft + forceRight;
  out.lateral = lateralLeft + lateralRight;
  out.torque = (forceLeft - forceRight) * offset + turnResistance;
  out.groundLeft = groundLeft;
  out.groundRight = groundRight;
  out.slideLeft = slideLeft;
  out.slideRight = slideRight;
  out.slip = Math.max(slideLeft, slideRight);
  return out;
}
