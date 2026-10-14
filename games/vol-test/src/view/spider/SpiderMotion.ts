import { clamp, clamp01 } from '@volstudio/core';
import { Spring1D } from '@volstudio/core/math';
import type { SpiderLook } from '@/config/spiders';
import type { LocomotionSignals } from './signals';

/** Gövdenin bir karedeki ikincil hareketi: uzuvlar ve parçalar bunu tüketir (dünya birimi, rad). */
export interface SpiderPose {
  /** Kalçanın zeminden yüksekliği: duruşa, atılıma, çarpmaya ve adım sarsıntısına göre. */
  hipHeight: number;
  /** Gövdenin ayaklara göre yaslanması (gövde-yerel, ivmenin tersi). */
  leanX: number;
  leanY: number;
  /** Karnın göğüse göre dönüşü (rad) ve ileri ivmeyle sıkışıp uzaması (ölçek). */
  abdomenYaw: number;
  abdomenScale: number;
  /** Göğsün dönüşe önden yatması (rad). */
  thoraxYaw: number;
  /** [0,1] hareket temposu ve çömelme: uzuv duruşu bunları okur. */
  motion01: number;
  crouch01: number;
}

const MS = 1000;

/**
 * Örümceğin gövde hareketi. Her bileşen kendi yayıdır; hepsi gövdenin GERÇEK hız ve ivmesinden
 * beslenir (ham girdiden değil): atılım ve duvar çarpması da girdisiz hareket olduğu için ancak
 * böyle tepki verir. Karın göğse esnek saplanmıştır ve dönüşü geriden izler; örümcek yürürken gövdesi
 * sabit kalmaz.
 */
export class SpiderMotion {
  readonly pose: SpiderPose;
  private readonly height: Spring1D;
  private readonly bob = new Spring1D();
  private readonly leanX = new Spring1D();
  private readonly leanY = new Spring1D();
  private readonly abdomen = new Spring1D();
  private readonly stretch = new Spring1D();
  private readonly thorax = new Spring1D();
  private readonly crouch = new Spring1D(1);
  private elapsedMs = 0;

  constructor(private readonly look: SpiderLook) {
    this.pose = {
      hipHeight: look.body.hipHeight,
      leanX: 0,
      leanY: 0,
      abdomenYaw: 0,
      abdomenScale: 1,
      thoraxYaw: 0,
      motion01: 0,
      crouch01: 1,
    };
    this.height = new Spring1D(look.body.hipHeight);
  }

  /** Bir ayak yere bastı: gövde kısa bir çökme alır. `strength` [0,1]. */
  plant(strength = 1): void {
    this.bob.velocity -= this.look.motion.stepBobPx * 22 * clamp01(strength);
  }

  update(signals: LocomotionSignals, deltaMs: number): SpiderPose {
    const { body, motion } = this.look;
    this.elapsedMs += deltaMs;
    const pose = this.pose;
    const cos = Math.cos(-signals.facingHeadingRad);
    const sin = Math.sin(-signals.facingHeadingRad);
    // Dünya ivmesi gövde eksenine çevrilir: x ileri, y sağ.
    const accelForward = signals.accelX * cos - signals.accelY * sin;
    const accelSide = signals.accelX * sin + signals.accelY * cos;

    const stand = clamp01(signals.speed / motion.standSpeed);
    pose.motion01 = stand;
    pose.crouch01 = clamp01(
      this.crouch.update(1 - stand, deltaMs, { stiffness: 46, damping: 8.5 }),
    );

    const heightTarget =
      body.hipHeight -
      motion.idleHeightDrop * pose.crouch01 -
      motion.dashHeightDrop * clamp01(signals.dash01) -
      motion.impactHeightDrop * clamp01(signals.impact01);
    this.height.update(heightTarget, deltaMs, motion.heightSpring);
    this.bob.update(0, deltaMs, motion.bobSpring);
    this.bob.value = clamp(this.bob.value, -motion.stepBobPx * 2, motion.stepBobPx);
    pose.hipHeight = this.height.value + this.bob.value;

    const perUnit = motion.maxLeanPx / motion.accelForMaxLean;
    const lean = motion.maxLeanPx;
    // Av atılışında gövde ön bacaklara yüklenir: ivme gövdeyi geri yaslarken atılış onu ileri uzatır.
    const hunt = motion.dashLeanPx * clamp01(signals.dash01);
    pose.leanX = this.leanX.update(
      clamp(-accelForward * perUnit, -lean, lean) + hunt,
      deltaMs,
      motion.leanSpring,
    );
    pose.leanY = this.leanY.update(
      clamp(-accelSide * perUnit, -lean, lean),
      deltaMs,
      motion.leanSpring,
    );

    const idleSway =
      Math.sin((this.elapsedMs / MS) * motion.abdomenIdleSwayHz * Math.PI * 2) *
      motion.abdomenIdleSwayRad;
    pose.abdomenYaw = this.abdomen.update(
      clamp(
        -signals.turnRateRadPerSec * motion.abdomenYawPerRadPerSec +
          accelSide * motion.abdomenYawPerLateralAccel +
          idleSway,
        -motion.abdomenMaxYawRad,
        motion.abdomenMaxYawRad,
      ),
      deltaMs,
      motion.abdomenSpring,
    );
    const forwardLoad = clamp(accelForward / motion.accelForMaxLean, -1, 1);
    pose.abdomenScale =
      1 -
      this.stretch.update(forwardLoad * motion.abdomenStretch, deltaMs, {
        stiffness: 90,
        damping: 11,
      });
    pose.thoraxYaw = this.thorax.update(
      clamp(
        signals.turnRateRadPerSec * motion.thoraxYawPerRadPerSec,
        -motion.thoraxMaxYawRad,
        motion.thoraxMaxYawRad,
      ),
      deltaMs,
      motion.thoraxYawSpring,
    );
    return pose;
  }
}
