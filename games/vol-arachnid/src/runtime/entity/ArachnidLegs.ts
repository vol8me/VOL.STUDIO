import { LegGait, clamp01, solveTwoBoneIk, type LegGaitLeg } from '@volstudio/core';
import { gaitConfig } from '@/config/gait';
import type { ArachnidRig } from '@/runtime/rig/arachnidRig';

const DEG = Math.PI / 180;

/**
 * Alternating tetrapod dizilimi: komşu bacaklar zıt gruptadır, sol ve sağ
 * karşılıklıdır. Bir grup adım atarken diğeri yerde kalır, gövde hiçbir an
 * desteksiz kalmaz.
 */
const LEG_GROUPS: Readonly<Record<string, number>> = {
  r0: 0,
  r1: 1,
  r2: 0,
  r3: 1,
  l0: 1,
  l1: 0,
  l2: 1,
  l3: 0,
};
const TAIL_GROUPS: Readonly<Record<string, number>> = { l: 1, r: 0 };
const RIG_FACING_OFFSET_RAD = Math.PI / 2;

/**
 * Bacakları yürüyüşe ve ters kinematiğe bağlar.
 *
 * Ayaklar DÜNYA uzayında sabitlenir; gövde ilerledikçe geride kalırlar ve
 * eşiği aşınca öne adım atarlar. Her kare her uzuv, ayağı gövde-yerel uzaya
 * çevirip iki kemikli IK ile pozlanır — bacak açısı elle animasyondan değil,
 * ayağın nerede durduğundan çıkar.
 */
export class ArachnidLegs {
  private readonly gait: LegGait;
  private readonly rig: ArachnidRig;
  private readonly legCount: number;

  constructor(rig: ArachnidRig) {
    this.rig = rig;
    this.legCount = rig.legs.length;

    const entries: LegGaitLeg[] = [
      ...rig.legs.map((leg) => {
        const reach = (leg.upperLength + leg.lowerLength) * gaitConfig.standReach;
        const homeRad = leg.restRad + (gaitConfig.legStanceOffsetsDeg[leg.id] ?? 0) * DEG;
        return {
          homeX: leg.hipX + Math.cos(homeRad) * reach,
          homeY: leg.hipY + Math.sin(homeRad) * reach,
          group: LEG_GROUPS[leg.id] ?? 0,
        };
      }),
      ...rig.tails.map((tail) => {
        const reach = tail.length * gaitConfig.tailStandReach;
        return {
          homeX: tail.hipX + Math.cos(tail.restRad) * reach,
          homeY: tail.hipY + Math.sin(tail.restRad) * reach,
          group: TAIL_GROUPS[tail.id] ?? 0,
        };
      }),
    ];

    this.gait = new LegGait(entries, {
      stepTriggerPx: gaitConfig.stepTriggerPx,
      stepDurationMs: gaitConfig.stepDurationMs,
      stepLeadSeconds: gaitConfig.stepLeadSeconds,
    });
  }

  /** Ayakları gövdenin altına adımsız yerleştirir (doğuş/ışınlanma). */
  reset(bodyX: number, bodyY: number, bodyRad: number): void {
    const rigRad = bodyRad + RIG_FACING_OFFSET_RAD;
    this.gait.reset(bodyX, bodyY, rigRad);
    this.pose(bodyX, bodyY, rigRad);
  }

  update(
    bodyX: number,
    bodyY: number,
    bodyRad: number,
    velX: number,
    velY: number,
    deltaMs: number,
  ): void {
    const rigRad = bodyRad + RIG_FACING_OFFSET_RAD;
    const speed = Math.hypot(velX, velY);
    const tempo = clamp01(speed / gaitConfig.fullTempoSpeedPxPerSec);
    this.gait.setStepTuning({
      stepTriggerPx: mix(gaitConfig.stepTriggerPx, gaitConfig.runStepTriggerPx, tempo),
      stepDurationMs: mix(gaitConfig.stepDurationMs, gaitConfig.runStepDurationMs, tempo),
    });

    // Dash hızı adım hedefini erişim dışına fırlatmamalı; gövde yine gerçek
    // hızla ilerler, yalnız ayağın öngörü mesafesi tam tempo hızında doyar.
    const leadScale =
      speed > gaitConfig.fullTempoSpeedPxPerSec ? gaitConfig.fullTempoSpeedPxPerSec / speed : 1;
    this.gait.update(bodyX, bodyY, rigRad, velX * leadScale, velY * leadScale, deltaMs);
    this.pose(bodyX, bodyY, rigRad);
  }

  /** Adım atan uzuv sayısı — teşhis/HUD için. */
  get steppingCount(): number {
    let count = 0;
    for (let i = 0; i < this.gait.legCount; i++) if (this.gait.isStepping(i)) count++;
    return count;
  }

  private pose(bodyX: number, bodyY: number, rigRad: number): void {
    // IK hedefleri rig'in gerçek render dönüşüyle aynı uzayda çözülmelidir;
    // atan2 yönü ile yukarı bakan kaynak rig arasında sabit 90° fark vardır.
    const cos = Math.cos(-rigRad);
    const sin = Math.sin(-rigRad);

    for (let i = 0; i < this.legCount; i++) {
      const leg = this.rig.legs[i];
      const worldDx = this.gait.footX(i) - bodyX;
      const worldDy = this.gait.footY(i) - bodyY;
      const localX = worldDx * cos - worldDy * sin;
      const localY = worldDx * sin + worldDy * cos;

      let dx = localX - leg.hipX;
      let dy = localY - leg.hipY;

      // Havadaki ayağı kalçaya doğru çek: diz daha çok bükülür, uzuv yerden
      // kalkmış görünür. Üstten bakışta "yükseklik" ancak böyle okunur.
      const lift = this.gait.lift(i);
      if (lift > 0) {
        const distance = Math.hypot(dx, dy);
        if (distance > 1e-3) {
          const tucked = Math.max(1, distance - gaitConfig.swingTuckPx * lift);
          const scale = tucked / distance;
          dx *= scale;
          dy *= scale;
        }
      }

      const solved = solveTwoBoneIk(dx, dy, leg.upperLength, leg.lowerLength, leg.bendSign);
      leg.upper.rotation = solved.upperRad;
      // Alt kemiğin dönüşü ÜST kemiğe görelidir (container zinciri mirası).
      leg.lower.rotation = solved.lowerRad - solved.upperRad;
    }

    for (let t = 0; t < this.rig.tails.length; t++) {
      const tail = this.rig.tails[t];
      const index = this.legCount + t;
      const worldDx = this.gait.footX(index) - bodyX;
      const worldDy = this.gait.footY(index) - bodyY;
      const localX = worldDx * cos - worldDy * sin;
      const localY = worldDx * sin + worldDy * cos;

      const aim = Math.atan2(localY - tail.hipY, localX - tail.hipX);
      // Kuyruk sanatı ayaktan gövdeye çizilmiştir: pivot gövde bağlantısında
      // olduğu için uzuv, container'ın yerel -x yönüne uzanır.
      tail.root.rotation = aim - Math.PI;
    }
  }
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
