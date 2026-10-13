import { solveTwoBoneIk } from '@volstudio/core/math';
import {
  LegGait,
  measureSupport,
  type LegGaitLeg,
  type SupportFoot,
  type SupportState,
} from '@volstudio/core/rig/locomotion';
import {
  buildLegs,
  DEFAULT_SPIDER,
  FEMUR_LENGTH,
  LOWER_LENGTH,
  type LegDef,
  type SpiderConfig,
} from './spiderRig';

/** Bir bacağın gövde uzayındaki pozu: görünüm bunu parçalara çevirir, sim bunu ölçer. */
export interface LegPose {
  hipX: number;
  hipY: number;
  kneeX: number;
  kneeY: number;
  /** Pençe ucu; ayağın yere bastığı nokta. */
  tipX: number;
  tipY: number;
  /** Uyluğun gövde uzayındaki yönü (rad). */
  femurRad: number;
  /** Kaval ve pençenin gövde uzayındaki yönü (rad); ikisi aynı doğrudadır. */
  tibiaRad: number;
  /** 0 yerde, 1 adımın tepesi. */
  lift: number;
  grounded: boolean;
  /** Hedef erişim dışındaydı: uzuv gerildi ya da katlandı, ayak hedefe varamadı. */
  clamped: boolean;
}

export interface SpiderStats {
  /** Yürüyüşün kurulduğu kare sayısı. */
  frames: number;
  /** IK'nın kelepçelediği bacak-kare sayısı ve toplam bacak-kare. */
  clampedLegFrames: number;
  legFrames: number;
  /** Normal rejimde (acil adım yok) ve ağırlık merkezi destek poligonu dışında kalan kare. */
  normalFrames: number;
  unstableNormalFrames: number;
  /** Sıra disiplininin acil adımla delindiği kareler: destek güvencesi bu karelerde askıdadır. */
  emergencyFrames: number;
  /** Tamamlanan adım sayısı. */
  steps: number;
  /** Yerdeki bir ayağın iki kare arasında dünyada kaydığı en büyük mesafe (tasarım birimi). */
  maxSlide: number;
  minStability01: number;
}

/**
 * Dizin tercih edilen konumu (yüksek skor kazanır). Dış çiftlerde diz gövde ekseninden uzağa gider.
 * Orta çiftler neredeyse yana baktığından yanal sapma belirsizdir; orada dizler ön-arka ayrışır
 * (ikinci çift öne, üçüncü çift geriye): bu iki çiftin uyluğu çaprazlanmaz, üstten bakışta zikzak örümcek
 * siluetini verir. İki işaret arasında yanlış seçim bacağı gövdenin altına kıvırır ya da çaprazlar.
 */
function kneeScore(def: LegDef, kneeX: number, kneeY: number): number {
  if (def.pair === 1) return kneeX;
  if (def.pair === 2) return -kneeX;
  return def.side * kneeY;
}

/** Ağırlık merkezi: karın ağır olduğu için başgöğsün biraz gerisinde (gövde uzayı). */
const CENTER_OF_MASS: readonly [number, number] = [-18, 0];
/** Kare süresi bu değere kelepçelenir (CORE `MAX_SIM_STEP_MS` ile aynı gerekçe). */
const MAX_STEP_MS = 50;

/**
 * Bacaklı gövde: CORE `LegGait` (ayak-sabitleyen yürüyüş) + `solveTwoBoneIk` (uyluk/kaval) +
 * `measureSupport` (denge ölçümü). Phaser'a dokunmaz; tasarım biriminde çalışır ve görünüm yalnız
 * sonucu dönüştürür. Gövdeyi kendisi hareket ettirmez: konum ve hız dışarıdan gelir.
 *
 * Bükülme yönü her bacak için bir kez, dinlenme pozunda `kneeScore` ile seçilir.
 */
export class SpiderBody {
  readonly legs: LegPose[];
  readonly support: SupportState = {
    groundedCount: 0,
    areaPx2: 0,
    inside: false,
    marginPx: 0,
    stability01: 0,
  };
  readonly stats: SpiderStats = {
    frames: 0,
    clampedLegFrames: 0,
    legFrames: 0,
    normalFrames: 0,
    unstableNormalFrames: 0,
    emergencyFrames: 0,
    steps: 0,
    maxSlide: 0,
    minStability01: 1,
  };

  private readonly defs: LegDef[] = buildLegs();
  private readonly gait: LegGait;
  private readonly bend: number[];
  private readonly feet: SupportFoot[];
  private readonly prevTipWorld: { x: number; y: number; grounded: boolean }[];
  /** İlk kare (kurulum ya da reset sonrası) ölçülmez: önceki uç konumları yoktur. */
  private started = false;

  constructor(private readonly config: SpiderConfig = DEFAULT_SPIDER) {
    const gaitLegs: LegGaitLeg[] = this.defs.map((def) => ({
      homeX: def.hip[0] + Math.cos(def.stance) * config.homeReach,
      homeY: def.hip[1] + def.side * Math.sin(def.stance) * config.homeReach,
      group: def.group,
    }));
    this.gait = new LegGait(gaitLegs, {
      stepTriggerPx: config.stepTriggerPx,
      stepDurationMs: config.stepDurationMs,
      stepLeadSeconds: config.stepLeadSeconds,
      maxStrainPx: config.maxStrainPx,
    });
    this.bend = this.defs.map((def, index) => this.chooseBend(def, gaitLegs[index]));
    this.legs = this.defs.map((def) => ({
      hipX: def.hip[0],
      hipY: def.hip[1],
      kneeX: def.hip[0],
      kneeY: def.hip[1],
      tipX: def.hip[0],
      tipY: def.hip[1],
      femurRad: 0,
      tibiaRad: 0,
      lift: 0,
      grounded: true,
      clamped: false,
    }));
    this.feet = this.defs.map(() => ({ x: 0, y: 0, grounded: true }));
    this.prevTipWorld = this.defs.map(() => ({ x: 0, y: 0, grounded: true }));
  }

  get legCount(): number {
    return this.defs.length;
  }

  /** Bacağın tanımı (taraf, çift, duruş, grup); görünüm ve testler okur. */
  def(index: number): LegDef {
    return this.defs[index];
  }

  /** Dinlenme ayağının gövde uzayındaki konumu. */
  home(index: number): readonly [number, number] {
    return [this.gait.homeX(index), this.gait.homeY(index)];
  }

  /** Diz yönü işareti; testler "dışa bükülür" kuralını doğrular. */
  bendSign(index: number): number {
    return this.bend[index];
  }

  get emergencySteppingCount(): number {
    return this.gait.emergencySteppingCount;
  }

  reset(x: number, y: number, angle: number): void {
    this.gait.reset(x, y, angle);
    this.started = false;
    this.pose(x, y, angle);
  }

  update(x: number, y: number, angle: number, velX: number, velY: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, MAX_STEP_MS);
    this.gait.update(x, y, angle, velX, velY, dt);
    this.pose(x, y, angle);
    if (dt <= 0) return;
    if (!this.started) {
      this.started = true;
      this.snapshotTips(x, y, angle);
      return;
    }
    this.measure(x, y, angle);
  }

  /** İki işaretten dizi gövde ekseninden daha uzağa götüreni seçer (dinlenme pozunda). */
  private chooseBend(def: LegDef, home: LegGaitLeg): number {
    const dx = home.homeX - def.hip[0];
    const dy = home.homeY - def.hip[1];
    let best = 1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const sign of [1, -1]) {
      const ik = solveTwoBoneIk(dx, dy, FEMUR_LENGTH, LOWER_LENGTH, sign);
      const score = kneeScore(
        def,
        def.hip[0] + Math.cos(ik.upperRad) * FEMUR_LENGTH,
        def.hip[1] + Math.sin(ik.upperRad) * FEMUR_LENGTH,
      );
      if (score > bestScore) {
        bestScore = score;
        best = sign;
      }
    }
    return best;
  }

  private pose(x: number, y: number, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let index = 0; index < this.defs.length; index++) {
      const def = this.defs[index];
      const leg = this.legs[index];
      const fx = this.gait.footX(index) - x;
      const fy = this.gait.footY(index) - y;
      // Dünya → gövde uzayı: -angle kadar döndür.
      const localX = fx * cos + fy * sin;
      const localY = -fx * sin + fy * cos;
      const ik = solveTwoBoneIk(
        localX - def.hip[0],
        localY - def.hip[1],
        FEMUR_LENGTH,
        LOWER_LENGTH,
        this.bend[index],
      );
      leg.hipX = def.hip[0];
      leg.hipY = def.hip[1];
      leg.femurRad = ik.upperRad;
      leg.tibiaRad = ik.lowerRad;
      leg.kneeX = leg.hipX + Math.cos(ik.upperRad) * FEMUR_LENGTH;
      leg.kneeY = leg.hipY + Math.sin(ik.upperRad) * FEMUR_LENGTH;
      leg.tipX = leg.kneeX + Math.cos(ik.lowerRad) * LOWER_LENGTH;
      leg.tipY = leg.kneeY + Math.sin(ik.lowerRad) * LOWER_LENGTH;
      leg.lift = this.gait.lift(index);
      leg.grounded = !this.gait.isStepping(index);
      leg.clamped = ik.clamped;
    }
  }

  private snapshotTips(x: number, y: number, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let index = 0; index < this.legs.length; index++) {
      const leg = this.legs[index];
      const prev = this.prevTipWorld[index];
      prev.x = x + leg.tipX * cos - leg.tipY * sin;
      prev.y = y + leg.tipX * sin + leg.tipY * cos;
      prev.grounded = leg.grounded;
    }
  }

  private measure(x: number, y: number, angle: number): void {
    const stats = this.stats;
    stats.frames++;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let index = 0; index < this.legs.length; index++) {
      const leg = this.legs[index];
      const prev = this.prevTipWorld[index];
      const tipX = x + leg.tipX * cos - leg.tipY * sin;
      const tipY = y + leg.tipX * sin + leg.tipY * cos;
      stats.legFrames++;
      if (leg.clamped) stats.clampedLegFrames++;
      if (leg.grounded && prev.grounded) {
        const slide = Math.hypot(tipX - prev.x, tipY - prev.y);
        if (slide > stats.maxSlide) stats.maxSlide = slide;
      }
      prev.x = tipX;
      prev.y = tipY;
      prev.grounded = leg.grounded;
      if (this.gait.justPlanted(index)) stats.steps++;
      const foot = this.feet[index];
      foot.x = this.gait.footX(index);
      foot.y = this.gait.footY(index);
      foot.grounded = leg.grounded;
    }
    const comX = x + CENTER_OF_MASS[0] * cos - CENTER_OF_MASS[1] * sin;
    const comY = y + CENTER_OF_MASS[0] * sin + CENTER_OF_MASS[1] * cos;
    measureSupport(
      this.feet,
      {
        centerX: comX,
        centerY: comY,
        safeMarginPx: 8,
      },
      this.support,
    );
    if (this.gait.emergencySteppingCount > 0) {
      stats.emergencyFrames++;
    } else {
      stats.normalFrames++;
      if (!this.support.inside) stats.unstableNormalFrames++;
      if (this.support.stability01 < stats.minStability01)
        stats.minStability01 = this.support.stability01;
    }
  }
}
