import type Phaser from 'phaser';
import {
  GazeDriver,
  RigMotionModel,
  Spring1D,
  Vector2,
  clamp,
  clamp01,
  clampSimulationStep,
  createRandom,
  finiteOr,
} from '@volstudio/core';
import { bodyMotionConfig } from '@/config/bodyMotion';
import { playerConfig } from '@/config/player';
import { RIG_FACING_OFFSET_RAD } from '@/config/rig';
import type { LocomotionSignals, PoseSignals } from '@/runtime/entity/locomotionSignals';
import type { ArachnidRig } from '@/runtime/rig/arachnidRig';

const DEG = Math.PI / 180;
/** Bakış dizisi tekrarlanabilir olsun diye sabit tohum. */
const GAZE_SEED = 0x4172_4348;

interface RestTransform {
  part: Phaser.GameObjects.Container;
  x: number;
  y: number;
  rotation: number;
}

/**
 * Gövde kabuğunun ikincil hareketi: dönüş yalpası, ivme yaslanması, dinlenme
 * çömelmesi, atılım gerilmesi, uç parçaların dönüşe öncülüğü ve bakış.
 *
 * Sinyaller ham GİRDİDEN değil gövdenin gerçek durumundan türetilir. Girdiyle
 * sürülen bir kabuk atılımda (girdi bırakılmış olabilir) ölü kalır, duvara
 * çarpınca hiç tepki vermez ve frenlemeyi hızlanmadan ayırt edemez.
 *
 * `RigMotionModel` burada tempo ve bekleme fazı için kullanılır; dönüş
 * şiddeti gövdenin KENDİ facing yayından gelir — ikinci bir yay ikinci bir
 * defter demektir ve iki defter kaçınılmaz olarak kayar.
 */
export class ArachnidBodyMotion {
  private readonly motionModel = new RigMotionModel({
    idlePhaseSpeedDegPerSec: bodyMotionConfig.idlePhaseSpeedDegPerSec,
  });
  private readonly gaze: GazeDriver;
  private readonly swaySpring = new Spring1D();
  private readonly rollSpring = new Spring1D();
  private readonly leanXSpring = new Spring1D();
  private readonly leanYSpring = new Spring1D();
  private readonly crouchSpring = new Spring1D(1);
  private readonly stretchSpring = new Spring1D();
  private readonly snoutLeadSpring = new Spring1D();
  private readonly shellRest: RestTransform[];
  private readonly snoutRest: RestTransform[];
  private readonly gazeRest: RestTransform;
  private readonly velocityDirection = new Vector2(0, 0);
  /** Yaslanma çıktısının tek örneği — sıcak yolda tahsis yok. */
  private readonly lean = { x: 0, y: 0 };
  /** Poz sinyallerinin tek örneği; her karede yeniden yazılır ve ÖDÜNÇ verilir. */
  private readonly poseSignals: PoseSignals = { motion01: 0, crouch01: 0 };

  constructor(rig: ArachnidRig) {
    this.shellRest = rig.shellParts.map(captureRest);
    this.snoutRest = rig.snoutParts.map(captureRest);
    this.gazeRest = captureRest(rig.gazePart);
    this.gaze = new GazeDriver(
      {
        radiusPx: bodyMotionConfig.gaze.radiusPx,
        holdMsMin: bodyMotionConfig.gaze.holdMsMin,
        holdMsMax: bodyMotionConfig.gaze.holdMsMax,
        saccadeMs: bodyMotionConfig.gaze.saccadeMs,
        alertHoldScale: bodyMotionConfig.gaze.alertHoldScale,
      },
      createRandom(GAZE_SEED),
    );
  }

  update(raw: LocomotionSignals, rawDeltaMs: number): PoseSignals {
    // Süre gövde ve uzuvlarla AYNI tavanı paylaşır: ikincil hareket, sürdüğü
    // gövdeden farklı bir zaman yaşarsa yaslanma ve yalpa gövdeden ayrışır.
    const deltaMs = clampSimulationStep(rawDeltaMs);
    /*
     * Akış değerleri TEMİZLENİR; bozuk tek bir kare kabuğun dönüşümünü kalıcı
     * olarak NaN'e düşürmemeli (bkz. `ArachnidLegs.update`). Temizlik yerinde
     * yapılır, yeni bir nesneye kopyalanarak değil: bu sıcak yol her karede
     * koşar ve tahsis gerektirmez.
     */
    const speed = Math.max(0, finiteOr(raw.speed, 0));
    const accelX = finiteOr(raw.accelX, 0);
    const accelY = finiteOr(raw.accelY, 0);
    const turnRate = finiteOr(raw.turnRateRadPerSec, 0);
    const facingRad = finiteOr(raw.facingHeadingRad, 0);
    const travelRad = finiteOr(raw.travelHeadingRad, facingRad);
    const dash01 = clamp01(finiteOr(raw.dash01, 0));

    /*
     * `RigMotionModel` bir hareket NİYETİ bekler ve gerçek hızın birim vektörü
     * aynı sözleşmeyi karşılar. Yön SEYAHATTEN okunur, bakıştan değil: sert bir
     * dönüşte ikisi ayrışır ve model o anda gövdenin GİTMEDİĞİ yöne bakardı.
     */
    const magnitude = clamp01(speed / bodyMotionConfig.standSpeedPxPerSec);
    if (speed > 1e-3) {
      this.velocityDirection.set(Math.cos(travelRad) * magnitude, Math.sin(travelRad) * magnitude);
    } else {
      this.velocityDirection.set(0, 0);
    }
    const signals = this.motionModel.update(this.velocityDirection, deltaMs);

    const phaseRad = signals.idlePhaseDeg * DEG;
    const turn01 = clamp(turnRate / bodyMotionConfig.turnVelocityForMaxRadPerSec, -1, 1);

    const sway = this.swaySpring.update(
      Math.sin(phaseRad) *
        (bodyMotionConfig.idleSwayPx + bodyMotionConfig.walkSwayPx * signals.motion01) +
        turn01 * bodyMotionConfig.turnSwayPx,
      deltaMs,
      bodyMotionConfig.transformSpring,
    );
    const roll = this.rollSpring.update(
      (Math.sin(phaseRad) * bodyMotionConfig.walkRollDeg * signals.motion01 +
        turn01 * bodyMotionConfig.turnRollDeg) *
        DEG,
      deltaMs,
      bodyMotionConfig.transformSpring,
    );

    const lean = this.updateLean(facingRad, accelX, accelY, deltaMs);
    const crouch = this.crouchSpring.update(
      1 - signals.motion01,
      deltaMs,
      bodyMotionConfig.crouchSpring,
    );
    const stretch = this.stretchSpring.update(dash01, deltaMs, bodyMotionConfig.dashStretchSpring);
    const snoutLead = this.snoutLeadSpring.update(
      clamp(
        turnRate * bodyMotionConfig.snoutLeadDegPerRadPerSec,
        -bodyMotionConfig.maxSnoutLeadDeg,
        bodyMotionConfig.maxSnoutLeadDeg,
      ) * DEG,
      deltaMs,
      bodyMotionConfig.snoutLeadSpring,
    );

    const crouch01 = clamp01(crouch);
    const uniform = 1 - bodyMotionConfig.crouchBodyScaleDrop * crouch01;
    // Rig yerel uzayında ileri −Y'dir: atılımda gövde Y ekseninde uzar,
    // X ekseninde incelir.
    const scaleX = uniform * (1 - bodyMotionConfig.dashStretch * stretch);
    const scaleY = uniform * (1 + bodyMotionConfig.dashStretch * stretch);

    for (const rest of this.shellRest) {
      applyTransform(rest, sway, lean, roll, scaleX, scaleY);
    }
    for (const rest of this.snoutRest) {
      applyTransform(rest, sway, lean, roll + snoutLead, scaleX, scaleY);
    }
    this.applyGaze(speed, turnRate, signals.motion01, sway, lean, roll, scaleX, scaleY, deltaMs);

    this.poseSignals.motion01 = signals.motion01;
    this.poseSignals.crouch01 = crouch01;
    return this.poseSignals;
  }

  /**
   * İvme yaslanması. İvme gövde-yerel eksenlere çevrilir ve gövde onun
   * TERSİNE kayar: kalkışta geriye, frende öne.
   */
  private updateLean(
    facingRad: number,
    accelX: number,
    accelY: number,
    deltaMs: number,
  ): { x: number; y: number } {
    /*
     * İvme GÖVDE-YEREL eksenlere çevrilir, yani BAKIŞ yönüne göre — seyahat
     * yönüne göre değil. Gövde nereye bakıyorsa "ileri" odur; sert bir dönüşte
     * yaslanma gövdenin kendi eksenlerinde okunmalıdır.
     */
    const rigRad = facingRad + RIG_FACING_OFFSET_RAD;
    const cos = Math.cos(-rigRad);
    const sin = Math.sin(-rigRad);
    const localX = accelX * cos - accelY * sin;
    const localY = accelX * sin + accelY * cos;
    const scale = bodyMotionConfig.leanPxPerAccelUnit / bodyMotionConfig.accelForMaxLeanPxPerSec2;
    const limit = bodyMotionConfig.maxLeanPx;

    // Yaslanma vektörü ödünçtür; sıcak yolda her karede yeni nesne kurulmaz.
    this.lean.x = this.leanXSpring.update(
      clamp(-localX * scale, -limit, limit),
      deltaMs,
      bodyMotionConfig.leanSpring,
    );
    this.lean.y = this.leanYSpring.update(
      clamp(-localY * scale, -limit, limit),
      deltaMs,
      bodyMotionConfig.leanSpring,
    );
    return this.lean;
  }

  /**
   * Bakış. Yuvasının (`core_ring`) içinde kalır; hareket ederken ileri yaya
   * ağırlıklı, dururken serbest tarar. Uyanıklık arttıkça sıçramalar sıklaşır —
   * "avlanıyorum" hissi bekleme süresinden okunur.
   */
  private applyGaze(
    speed: number,
    turnRate: number,
    motion01: number,
    sway: number,
    lean: { x: number; y: number },
    roll: number,
    scaleX: number,
    scaleY: number,
    deltaMs: number,
  ): void {
    const alert = clamp01(
      Math.max(
        clamp01(speed / bodyMotionConfig.gaze.alertSpeedPxPerSec),
        Math.abs(turnRate) / playerConfig.maxTurnRateRadPerSec,
      ),
    );
    // Rig yerel uzayında ileri −Y, yani −π/2. Hareket varken bakış o yaya
    // çekilir; dururken odak yoktur ve tam daire taranır.
    const focusRad = motion01 > 0.05 ? -Math.PI / 2 : null;
    const gaze = this.gaze.update(deltaMs, focusRad, alert);

    const part = this.gazeRest.part;
    const px = this.gazeRest.x * scaleX;
    const py = this.gazeRest.y * scaleY;
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    part.x = px * cos - py * sin + sway + lean.x + gaze.x;
    part.y = px * sin + py * cos + lean.y + gaze.y;
    part.rotation =
      this.gazeRest.rotation +
      roll +
      (gaze.x / bodyMotionConfig.gaze.radiusPx) * bodyMotionConfig.gaze.slitTiltDeg * DEG;
    part.setScale(scaleX, scaleY);
  }
}

function captureRest(part: Phaser.GameObjects.Container): RestTransform {
  return { part, x: part.x, y: part.y, rotation: part.rotation };
}

function applyTransform(
  rest: RestTransform,
  sway: number,
  lean: { x: number; y: number },
  rotation: number,
  scaleX: number,
  scaleY: number,
): void {
  const px = rest.x * scaleX;
  const py = rest.y * scaleY;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  rest.part.x = px * cos - py * sin + sway + lean.x;
  rest.part.y = px * sin + py * cos + lean.y;
  rest.part.rotation = rest.rotation + rotation;
  rest.part.setScale(scaleX, scaleY);
}
