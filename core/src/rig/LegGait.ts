import { clamp01 } from '../math/interpolation';
import { finiteOr, requireFinite } from '../math/numeric';

export interface LegGaitLeg {
  /** Gövde-yerel dinlenme ("ev") ayak konumu — gövde dönerse birlikte döner. */
  homeX: number;
  homeY: number;
  /**
   * Eşzamanlı adım grubu. Bir bacak, KARŞI grupta adım atan bacak varken
   * adıma başlamaz; sekiz bacakta 0/1 dağılımı doğal bir alternating
   * tetrapod yürüyüşü verir (yarısı hep yerde kalır).
   */
  group: number;
}

export interface LegGaitConfig {
  /** Ayak evinden bu kadar uzaklaşınca adım tetiklenir (dünya px). */
  stepTriggerPx: number;
  /** Bir adımın (havada geçen) süresi. */
  stepDurationMs: number;
  /** Adım hedefini hız yönünde şu kadar saniye ileriye koyar — ayak gideceği yere basar. */
  stepLeadSeconds: number;
}

export type LegGaitStepTuning = Pick<LegGaitConfig, 'stepTriggerPx' | 'stepDurationMs'>;

interface LegState {
  leg: LegGaitLeg;
  plantedX: number;
  plantedY: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Adım ilerlemesi [0,1]; 1 = yere basıyor (adım yok). */
  t: number;
  stepping: boolean;
  footX: number;
  footY: number;
  lift: number;
}

/**
 * Ayak-sabitleyen (planted foot) yürüyüş döngüsü.
 *
 * Her ayak DÜNYA uzayında bir noktaya basar ve gövde hareket ederken orada
 * KALIR — yere tutunma hissinin kaynağı budur. Ayak, gövdeyle birlikte dönen
 * "ev" konumundan `stepTriggerPx` kadar geride kalınca bir adım başlar ve
 * ayak, hızın işaret ettiği yere (gideceği noktaya) taşınır.
 *
 * Adım sırası bacak gruplarıyla dizginlenir: bir bacak, karşı grupta adım
 * atan bacak varken başlamaz. Böylece gövde her an en az bir grup ayak
 * üstünde kalır ve yürüyüş kaymaz.
 */
export class LegGait {
  private readonly states: LegState[];
  private readonly config: LegGaitConfig;
  private readonly steppingPerGroup = new Map<number, number>();
  private initialised = false;

  constructor(legs: readonly LegGaitLeg[], config: LegGaitConfig) {
    if (legs.length === 0) {
      throw new Error('LegGait: en az bir bacak gerekli');
    }
    requireFinite(config.stepTriggerPx, 'LegGaitConfig.stepTriggerPx');
    requireFinite(config.stepDurationMs, 'LegGaitConfig.stepDurationMs');
    requireFinite(config.stepLeadSeconds, 'LegGaitConfig.stepLeadSeconds');
    if (config.stepTriggerPx <= 0 || config.stepDurationMs <= 0) {
      throw new Error('LegGait: stepTriggerPx ve stepDurationMs pozitif olmalı');
    }

    this.config = { ...config };
    this.states = legs.map((leg) => ({
      leg,
      plantedX: 0,
      plantedY: 0,
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
      t: 1,
      stepping: false,
      footX: 0,
      footY: 0,
      lift: 0,
    }));
  }

  get legCount(): number {
    return this.states.length;
  }

  /**
   * Aktif ayak durumunu sıfırlamadan adım eşiğini ve süresini değiştirir.
   * Hızla değişen tempo için gait'i yeniden kurmak basılı ayakları her kare
   * gövdeye ışınlar; canlı ayar bu dünya-uzayı sürekliliğini korur.
   */
  setStepTuning(tuning: LegGaitStepTuning): void {
    requireFinite(tuning.stepTriggerPx, 'LegGaitStepTuning.stepTriggerPx');
    requireFinite(tuning.stepDurationMs, 'LegGaitStepTuning.stepDurationMs');
    if (tuning.stepTriggerPx <= 0 || tuning.stepDurationMs <= 0) {
      throw new Error('LegGait: stepTriggerPx ve stepDurationMs pozitif olmalı');
    }
    this.config.stepTriggerPx = tuning.stepTriggerPx;
    this.config.stepDurationMs = tuning.stepDurationMs;
  }

  /** Ayağın o kareki dünya-uzayı X'i (adım sırasında interpolasyonlu). */
  footX(index: number): number {
    return this.states[index].footX;
  }

  footY(index: number): number {
    return this.states[index].footY;
  }

  /**
   * [0,1] — 0 yere basıyor, 1 adımın tepesi. Kaldırmanın NASIL gösterileceğine
   * tüketici karar verir; üstten bakışta "yukarı" ekran ekseni değildir.
   */
  lift(index: number): number {
    return this.states[index].lift;
  }

  isStepping(index: number): boolean {
    return this.states[index].stepping;
  }

  /** Ayakları gövdenin altına, adımsız hâlde yeniden yerleştirir. */
  reset(bodyX: number, bodyY: number, bodyAngleRad: number): void {
    const cos = Math.cos(bodyAngleRad);
    const sin = Math.sin(bodyAngleRad);
    for (const state of this.states) {
      const hx = bodyX + state.leg.homeX * cos - state.leg.homeY * sin;
      const hy = bodyY + state.leg.homeX * sin + state.leg.homeY * cos;
      state.plantedX = hx;
      state.plantedY = hy;
      state.footX = hx;
      state.footY = hy;
      state.fromX = hx;
      state.fromY = hy;
      state.toX = hx;
      state.toY = hy;
      state.t = 1;
      state.stepping = false;
      state.lift = 0;
    }
    this.steppingPerGroup.clear();
    this.initialised = true;
  }

  /**
   * Bir kare ilerletir. `velX/velY` gövdenin dünya-uzayı hızıdır (px/s) ve
   * adımın nereye ATILACAĞINI belirler — ayak, gövdenin gideceği yere basar.
   */
  update(
    bodyX: number,
    bodyY: number,
    bodyAngleRad: number,
    velX: number,
    velY: number,
    deltaMs: number,
  ): void {
    if (!this.initialised) {
      this.reset(bodyX, bodyY, bodyAngleRad);
      return;
    }

    const dt = finiteOr(deltaMs, 0);
    if (dt <= 0) return;

    const cos = Math.cos(bodyAngleRad);
    const sin = Math.sin(bodyAngleRad);
    const leadX = velX * this.config.stepLeadSeconds;
    const leadY = velY * this.config.stepLeadSeconds;

    // 1) Süren adımları ilerlet — yeni adım kararlarından ÖNCE, ki biten
    //    adımlar grubu aynı karede serbest bıraksın.
    for (const state of this.states) {
      if (!state.stepping) continue;
      state.t = clamp01(state.t + dt / this.config.stepDurationMs);
      const eased = easeInOut(state.t);
      state.footX = state.fromX + (state.toX - state.fromX) * eased;
      state.footY = state.fromY + (state.toY - state.fromY) * eased;
      state.lift = Math.sin(Math.PI * state.t);
      if (state.t >= 1) {
        state.plantedX = state.toX;
        state.plantedY = state.toY;
        state.footX = state.toX;
        state.footY = state.toY;
        state.lift = 0;
        state.stepping = false;
        this.releaseGroup(state.leg.group);
      }
    }

    // 2) Yeni adımlar. Grup kilidi: karşı grup adımdayken başlanmaz.
    for (const state of this.states) {
      if (state.stepping) continue;
      const homeX = bodyX + state.leg.homeX * cos - state.leg.homeY * sin;
      const homeY = bodyY + state.leg.homeX * sin + state.leg.homeY * cos;
      const strain = Math.hypot(homeX - state.plantedX, homeY - state.plantedY);
      if (strain <= this.config.stepTriggerPx) {
        state.footX = state.plantedX;
        state.footY = state.plantedY;
        state.lift = 0;
        continue;
      }
      if (this.otherGroupBusy(state.leg.group)) {
        state.footX = state.plantedX;
        state.footY = state.plantedY;
        state.lift = 0;
        continue;
      }
      state.fromX = state.plantedX;
      state.fromY = state.plantedY;
      state.toX = homeX + leadX;
      state.toY = homeY + leadY;
      state.t = 0;
      state.stepping = true;
      state.lift = 0;
      this.claimGroup(state.leg.group);
    }
  }

  private otherGroupBusy(group: number): boolean {
    for (const [otherGroup, count] of this.steppingPerGroup) {
      if (otherGroup !== group && count > 0) return true;
    }
    return false;
  }

  private claimGroup(group: number): void {
    this.steppingPerGroup.set(group, (this.steppingPerGroup.get(group) ?? 0) + 1);
  }

  private releaseGroup(group: number): void {
    const next = (this.steppingPerGroup.get(group) ?? 1) - 1;
    if (next <= 0) this.steppingPerGroup.delete(group);
    else this.steppingPerGroup.set(group, next);
  }
}

/** Adımın başında ve sonunda yavaşlayan eğri — ayak yere sertçe çarpmaz. */
function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
