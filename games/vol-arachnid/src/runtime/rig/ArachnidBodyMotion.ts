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
import type { ArachnidRig } from '@/runtime/rig/arachnidRig';

const DEG = Math.PI / 180;
/** Bakış dizisi tekrarlanabilir olsun diye sabit tohum. */
const GAZE_SEED = 0x4172_4348;

export interface BodyMotionState {
  speed: number;
  /** Gövdenin dünya-uzayı ivmesi (px/s²) — yaslanmanın kaynağı. */
  accelX: number;
  accelY: number;
  /** Dönüşün anlık şiddeti (rad/s). */
  turnRate: number;
  /** Gövdenin görsel yönü (radyan). */
  facingRad: number;
  /** [0,1] atılım şiddeti. */
  dash01: number;
}

export interface BodyMotionSignals {
  /** [0,1] hareket temposu — uzuv duruşu ve bakış uyanıklığı bunu tüketir. */
  motion01: number;
  /** [0,1] çömelme — dururken 1'e, yürürken 0'a gider. */
  crouch01: number;
}

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

  update(rawState: BodyMotionState, rawDeltaMs: number): BodyMotionSignals {
    // Süre gövde ve uzuvlarla AYNI tavanı paylaşır: ikincil hareket, sürdüğü
    // gövdeden farklı bir zaman yaşarsa yaslanma ve yalpa gövdeden ayrışır.
    const deltaMs = clampSimulationStep(rawDeltaMs);
    // Akış değerleri temizlenir; bozuk tek bir kare kabuğun dönüşümünü kalıcı
    // olarak NaN'e düşürmemeli (bkz. `ArachnidLegs.update`).
    const state: BodyMotionState = {
      speed: Math.max(0, finiteOr(rawState.speed, 0)),
      accelX: finiteOr(rawState.accelX, 0),
      accelY: finiteOr(rawState.accelY, 0),
      turnRate: finiteOr(rawState.turnRate, 0),
      facingRad: finiteOr(rawState.facingRad, 0),
      dash01: clamp01(finiteOr(rawState.dash01, 0)),
    };
    const speed = state.speed;
    // `RigMotionModel` bir hareket NİYETİ bekler; gerçek hızın birim vektörü
    // aynı sözleşmeyi karşılar ve girdisiz hareketleri de kapsar.
    const magnitude = clamp01(speed / bodyMotionConfig.standSpeedPxPerSec);
    if (speed > 1e-3) {
      this.velocityDirection.set(
        Math.cos(state.facingRad) * magnitude,
        Math.sin(state.facingRad) * magnitude,
      );
    } else {
      this.velocityDirection.set(0, 0);
    }
    const signals = this.motionModel.update(this.velocityDirection, deltaMs);

    const phaseRad = signals.idlePhaseDeg * DEG;
    const turn01 = clamp(state.turnRate / bodyMotionConfig.turnVelocityForMaxRadPerSec, -1, 1);

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

    const lean = this.updateLean(state, deltaMs);
    const crouch = this.crouchSpring.update(
      1 - signals.motion01,
      deltaMs,
      bodyMotionConfig.crouchSpring,
    );
    const stretch = this.stretchSpring.update(
      state.dash01,
      deltaMs,
      bodyMotionConfig.dashStretchSpring,
    );
    const snoutLead = this.snoutLeadSpring.update(
      clamp(
        state.turnRate * bodyMotionConfig.snoutLeadDegPerRadPerSec,
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
    this.applyGaze(state, signals.motion01, sway, lean, roll, scaleX, scaleY, deltaMs);

    return { motion01: signals.motion01, crouch01 };
  }

  /**
   * İvme yaslanması. İvme gövde-yerel eksenlere çevrilir ve gövde onun
   * TERSİNE kayar: kalkışta geriye, frende öne.
   */
  private updateLean(state: BodyMotionState, deltaMs: number): { x: number; y: number } {
    const rigRad = state.facingRad + RIG_FACING_OFFSET_RAD;
    const cos = Math.cos(-rigRad);
    const sin = Math.sin(-rigRad);
    const localX = state.accelX * cos - state.accelY * sin;
    const localY = state.accelX * sin + state.accelY * cos;
    const scale = bodyMotionConfig.leanPxPerAccelUnit / bodyMotionConfig.accelForMaxLeanPxPerSec2;
    const limit = bodyMotionConfig.maxLeanPx;

    return {
      x: this.leanXSpring.update(
        clamp(-localX * scale, -limit, limit),
        deltaMs,
        bodyMotionConfig.leanSpring,
      ),
      y: this.leanYSpring.update(
        clamp(-localY * scale, -limit, limit),
        deltaMs,
        bodyMotionConfig.leanSpring,
      ),
    };
  }

  /**
   * Bakış. Yuvasının (`core_ring`) içinde kalır; hareket ederken ileri yaya
   * ağırlıklı, dururken serbest tarar. Uyanıklık arttıkça sıçramalar sıklaşır —
   * "avlanıyorum" hissi bekleme süresinden okunur.
   */
  private applyGaze(
    state: BodyMotionState,
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
        clamp01(state.speed / bodyMotionConfig.gaze.alertSpeedPxPerSec),
        Math.abs(state.turnRate) / playerConfig.maxTurnRateRadPerSec,
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
