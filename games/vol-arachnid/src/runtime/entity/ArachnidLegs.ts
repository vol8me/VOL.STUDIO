import {
  LegGait,
  clamp,
  clamp01,
  lerp,
  solveTwoBoneIk,
  wrap,
  type LegGaitLeg,
} from '@volstudio/core';
import { gaitConfig, type LimbStance } from '@/config/gait';
import { RIG_FACING_OFFSET_RAD } from '@/config/rig';
import type { ArachnidRig, LimbRig } from '@/runtime/rig/arachnidRig';

const DEG = Math.PI / 180;
/** Duruş açıları İLERİ eksenden ölçülür; rig yerel uzayında ileri −Y'dir. */
const FORWARD_RAD = -Math.PI / 2;

export interface LimbDriveState {
  bodyX: number;
  bodyY: number;
  /** Gövdenin görsel yönü (radyan) — rig ofseti burada eklenir. */
  bodyRad: number;
  velX: number;
  velY: number;
  /** Dönüşün anlık şiddeti (rad/s) — adım temposunun ikinci kaynağı. */
  turnRate: number;
  /** [0,1] yürüyüş temposu — arka uzuvların itiş payını ölçekler. */
  motion01: number;
  /** [0,1] atılım şiddeti — ön uzuvları öne, arka uzuvları geriye taşır. */
  dash01: number;
  /** [0,1] çömelme — uzuvları gövdeye çeker. */
  crouch01: number;
}

interface LimbDriver {
  rig: LimbRig;
  stance: LimbStance;
  /** Omuz + üst + alt kemiklerin toplamı; erişim oranı bununla çarpılır. */
  totalLength: number;
}

/**
 * Uzuvları yürüyüşe ve ters kinematiğe bağlar.
 *
 * Ayaklar DÜNYA uzayında sabitlenir; gövde ilerledikçe geride kalırlar ve
 * eşiği aşınca öne adım atarlar. Her kare her uzuv, ayağı gövde-yerel uzaya
 * çevirip pozlanır — uzuv açısı elle animasyondan değil, ayağın nerede
 * durduğundan çıkar.
 *
 * Üç kemikli zincirde çözüm tek değildir. Belirsizlik OMUZLA kapatılır: omuz
 * duruş açısıyla ayak yönü arasında sabit bir oranda paylaşır, kalan iki kemik
 * iki kemikli IK ile çözülür. Böylece uzuv hem gövdeye bağlı bir dizilim
 * korur hem ayağı takip eder.
 */
export class ArachnidLegs {
  private readonly gait: LegGait;
  private readonly drivers: LimbDriver[];
  /** Ayakların gövde merkezine ORTALAMA uzaklığı — dönüşün teğetsel hızı için. */
  private readonly stanceRadiusPx: number;

  constructor(rig: ArachnidRig) {
    this.drivers = rig.limbs.map((limb) => {
      const stance = gaitConfig.stance[limb.id];
      if (!stance) throw new Error(`"${limb.id}" uzvu için duruş tanımı yok`);
      return {
        rig: limb,
        stance,
        totalLength: limb.shoulderLength + limb.upperLength + limb.lowerLength,
      };
    });

    const entries: LegGaitLeg[] = this.drivers.map((driver) => {
      const home = restingHome(driver, 0, 0, 0);
      return { homeX: home.x, homeY: home.y, group: driver.stance.group };
    });
    this.stanceRadiusPx =
      entries.reduce((total, entry) => total + Math.hypot(entry.homeX, entry.homeY), 0) /
      entries.length;

    this.gait = new LegGait(entries, {
      stepTriggerPx: gaitConfig.stepTriggerPx,
      stepDurationMs: gaitConfig.stepDurationMs,
      stepLeadSeconds: gaitConfig.stepLeadSeconds,
      maxStrainPx: gaitConfig.emergencyStrainPx,
    });
  }

  /** Ayakları gövdenin altına adımsız yerleştirir (doğuş/ışınlanma). */
  reset(bodyX: number, bodyY: number, bodyRad: number): void {
    const rigRad = bodyRad + RIG_FACING_OFFSET_RAD;
    this.applyStance(0, 0, 0);
    this.gait.reset(bodyX, bodyY, rigRad);
    this.pose(bodyX, bodyY, rigRad, 0);
  }

  update(state: LimbDriveState, deltaMs: number): void {
    const rigRad = state.bodyRad + RIG_FACING_OFFSET_RAD;
    const speed = Math.hypot(state.velX, state.velY);
    /*
     * Dönüş de bir TEMPO kaynağıdır. Yerinde dönen bir gövdenin doğrusal hızı
     * sıfırdır ama ayakların ev konumları teğetsel olarak savrulur; tempoyu
     * yalnız hızdan okumak adımları en yavaş ayarında bırakıyor ve uzuvlar
     * gövdenin arkasında sürükleniyordu.
     */
    const tangentialSpeed = Math.abs(state.turnRate) * this.stanceRadiusPx;
    const tempo = clamp01(Math.max(speed, tangentialSpeed) / gaitConfig.fullTempoSpeedPxPerSec);

    this.applyStance(state.motion01, state.dash01, state.crouch01);
    this.gait.setStepTuning({
      stepTriggerPx: lerp(gaitConfig.stepTriggerPx, gaitConfig.runStepTriggerPx, tempo),
      stepDurationMs: lerp(gaitConfig.stepDurationMs, gaitConfig.runStepDurationMs, tempo),
    });

    // Atılım hızı adım hedefini erişim dışına fırlatmamalı; gövde yine gerçek
    // hızla ilerler, yalnız ayağın öngörü mesafesi tam tempo hızında doyar.
    const leadScale =
      speed > gaitConfig.fullTempoSpeedPxPerSec ? gaitConfig.fullTempoSpeedPxPerSec / speed : 1;
    this.gait.update(
      state.bodyX,
      state.bodyY,
      rigRad,
      state.velX * leadScale,
      state.velY * leadScale,
      deltaMs,
    );
    this.pose(state.bodyX, state.bodyY, rigRad, state.dash01);
  }

  /**
   * O anda havada olan UZUV sayısı — arka itici uzuvlar dahil, çünkü onlar da
   * adım atar ve gövdeyi taşır. Teşhis ve denge okumaları için.
   */
  get steppingLimbCount(): number {
    return this.gait.steppingCount;
  }

  /** Bu karede yere basan ayakların dünya konumlarını gezer (toz, ses). */
  forEachPlant(visit: (x: number, y: number) => void): void {
    for (let i = 0; i < this.drivers.length; i++) {
      if (this.gait.justPlanted(i)) visit(this.gait.footX(i), this.gait.footY(i));
    }
  }

  /**
   * Duruşu canlı yeniden yazar. Ev konumu yalnız bir SONRAKİ adımın hedefini
   * etkiler; basılı ayak yerinde kalır, yani çömelirken ya da atılırken
   * ayaklar kaymaz, uzuvlar bükülür.
   */
  private applyStance(motion01: number, dash01: number, crouch01: number): void {
    for (let i = 0; i < this.drivers.length; i++) {
      const home = restingHome(this.drivers[i], motion01, dash01, crouch01);
      this.gait.setLegHome(i, home.x, home.y);
    }
  }

  private pose(bodyX: number, bodyY: number, rigRad: number, dash01: number): void {
    // IK hedefleri rig'in gerçek render dönüşüyle aynı uzayda çözülmelidir.
    const cos = Math.cos(-rigRad);
    const sin = Math.sin(-rigRad);

    for (let i = 0; i < this.drivers.length; i++) {
      const driver = this.drivers[i];
      const limb = driver.rig;
      const worldDx = this.gait.footX(i) - bodyX;
      const worldDy = this.gait.footY(i) - bodyY;
      const localX = worldDx * cos - worldDy * sin;
      const localY = worldDx * sin + worldDy * cos;

      let dx = localX - limb.hipX;
      let dy = localY - limb.hipY;

      // Havadaki ayağı kalçaya doğru çek: diz daha çok bükülür, uzuv yerden
      // kalkmış görünür. Üstten bakışta "yükseklik" ancak böyle okunur.
      const lift = this.gait.lift(i);
      if (lift > 0) {
        const reach = Math.hypot(dx, dy);
        if (reach > 1e-3) {
          // Kısaltma hedefi [1, reach] aralığına kelepçelenir: ayak zaten
          // kalçanın dibindeyken çıkarma negatife düşer ve uzvu KISALTMAK
          // yerine uzatırdı.
          const tucked = clamp(reach - gaitConfig.swingTuckPx * lift, 1, reach);
          dx *= tucked / reach;
          dy *= tucked / reach;
        }
      }

      const stanceRad = stanceAngleRad(driver.stance, dash01);
      const aimRad = Math.atan2(dy, dx);
      const yaw = clamp(
        wrap(aimRad - stanceRad, -Math.PI, Math.PI) * gaitConfig.shoulderFollow,
        -gaitConfig.shoulderYawLimitDeg * DEG,
        gaitConfig.shoulderYawLimitDeg * DEG,
      );
      const shoulderRad = stanceRad + yaw;

      const kneeX = dx - Math.cos(shoulderRad) * limb.shoulderLength;
      const kneeY = dy - Math.sin(shoulderRad) * limb.shoulderLength;
      const solved = solveTwoBoneIk(
        kneeX,
        kneeY,
        limb.upperLength,
        limb.lowerLength,
        driver.stance.bendSign,
      );

      // Container dönüşleri EBEVEYNE görelidir: omuz rig uzayında, alt
      // kemikler bir üstteki kemiğe göre döner.
      limb.shoulder.rotation = shoulderRad;
      limb.upper.rotation = solved.upperRad - shoulderRad;
      limb.lower.rotation = solved.lowerRad - solved.upperRad;
      if (limb.tip) {
        limb.tip.rotation =
          lerp(gaitConfig.clawPlantedCurlDeg, gaitConfig.clawLiftCurlDeg, lift) * DEG;
      }
    }
  }
}

/** Uzvun o kareki gövde-yerel ev (dinlenme) ayak konumu. */
function restingHome(
  driver: LimbDriver,
  motion01: number,
  dash01: number,
  crouch01: number,
): { x: number; y: number } {
  const angle = stanceAngleRad(driver.stance, dash01);
  const reach =
    (driver.stance.reach +
      driver.stance.dashReachDelta * dash01 +
      driver.stance.pushReachGain * motion01) *
    (1 - gaitConfig.crouchReachDrop * crouch01);
  const radius = driver.totalLength * reach;
  return {
    x: driver.rig.hipX + Math.cos(angle) * radius,
    y: driver.rig.hipY + Math.sin(angle) * radius,
  };
}

function stanceAngleRad(stance: LimbStance, dash01: number): number {
  return FORWARD_RAD + (stance.angleDeg + stance.dashAngleDeltaDeg * dash01) * DEG;
}
