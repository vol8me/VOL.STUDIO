import type Phaser from 'phaser';
import {
  LegGait,
  clamp01,
  clampSimulationStep,
  finiteOr,
  lerp,
  type LegGaitLeg,
} from '@volstudio/core';
import { SPIDER_ART, type PartBox, type SpiderHip, type SpiderLook } from '@/config/spiders';
import { TEXTURE_SCALE, addSpiderImage } from '../textures';
import { GROUNDED, type LeapPhase } from './LeapTracker';
import type { LocomotionSignals } from './signals';
import { solveLeg, type LegSolution } from './legSolve';
import { createLimbOutline, limbOutline, type LimbOutline } from './limbShadow';
import type { SpiderPose } from './SpiderMotion';

const DEG = Math.PI / 180;
/** Kopan bacağın kütüğü: femurun kalan oranı, aşağı sarkma açısı (rad), mafsal ölçeği, gölge yüksekliği. */
const STUMP = { length: 0.5, droop: 0.4, knee: 0.55, height: 2 } as const;
const INV = 1 / TEXTURE_SCALE;
/** Gölge şeridinin dizde ve ayakta kalınlığı (kalçadaki kalınlığa oranla): bacak uca doğru incelir. */
const KNEE_TAPER = 0.88;
const FOOT_TAPER = 0.5;
/** Havalanmada yürüyüş pozundan hava pozuna geçiş süresi, inişte hava pozundan oturma süresi (ms). */
const AIR_BLEND = { inMs: 70, outMs: 170 } as const;
/** Hava pozunun evreleri (uçuş ilerlemesi): itiş bu eşiğe dek sürer, iniş uzanışı bu eşikten başlar. */
const AIR_PHASE = { pushEnd: 0.3, reachStart: 0.55, frontLead: 0.08, footRamp: 0.14 } as const;

/**
 * Bacak parçalarının tek katmanı. Bütün bacaklar GÖVDENİN ALTINDA kalır: çizim sırası zemin
 * gölgeleri, bacaklar, karın, göğüs, toplardır ve hiçbir bacak parçası, ne kadar yüksekte olursa
 * olsun, kabuğun üstüne çıkmaz. Kalçalar kabuk hattının içindedir; femur kabuğun altından çıkar.
 */
export interface SpiderLegLayers {
  /** Zemine düşen gölgeler ve temas karartıları. */
  ground: Phaser.GameObjects.Container;
  /** Femur, tibia, pençe ve diz: gövdenin altından geçer. */
  legs: Phaser.GameObjects.Container;
}

interface LegNodes {
  hip: SpiderHip;
  side: number;
  femur: Phaser.GameObjects.Image;
  tibia: Phaser.GameObjects.Image;
  tarsus: Phaser.GameObjects.Image;
  knee: Phaser.GameObjects.Image;
  contact: Phaser.GameObjects.Image;
}

/** [0, 1] üzerinde yumuşak geçiş (smoothstep). */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Yüksekliğin parçayı büyütme çarpanı. */
function perspective(height: number): number {
  return 1 + Math.max(0, height) * SPIDER_ART.perspective;
}

/** Yüksekliğin konumu gövde merkezinden dışarı iterek verdiği derinlik. */
function parallax(height: number): number {
  return 1 + Math.max(0, height) * SPIDER_ART.parallax;
}

/**
 * Örümceğin sekiz bacağı. Ayaklar DÜNYA uzayında basılır ve gövde ilerledikçe dönüşümlü
 * dört-ayaklı bir düzende adım atar (bir yanın 1. ve 3., ötekinin 2. ve 4. bacağı birlikte kalkar;
 * gövde her an karşı dört bacağın üstündedir). Bacak yukarıdan düz bir şerit değil, kalça yüksekliğinden
 * yere inen iki kemiktir (`solveLeg`): havadaki ayak yükselirken diz yükselir ve büyür, basılı ayakta
 * tibia dik iner; yükseklik gölgenin kaymasından ve parçanın perspektifle büyümesinden okunur.
 */
export class SpiderLegs {
  private readonly gait: LegGait;
  private readonly legs: LegNodes[];
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly outline: LimbOutline = createLimbOutline();
  private readonly jointX = [0, 0, 0];
  private readonly jointY = [0, 0, 0];
  private readonly jointWidth = [0, 0, 0];
  private readonly footX: number[];
  private readonly footY: number[];
  private readonly lift: number[];
  private readonly stepTuning = { stepTriggerPx: 0, stepDurationMs: 0, maxStrainPx: 0 };
  private readonly solution: LegSolution = { kneeU: 0, kneeHeight: 0, footU: 0 };
  private readonly stanceRadiusPx: number;
  private readonly homeScratch = { x: 0, y: 0 };
  /** Kırık bacakların bit maskesi (bit sırası bacak sırasıdır) ve gövdenin kırık yana çökmesi. */
  private broken = 0;
  private sag = 0;
  private elevation = 0;
  private swingGain = 1;
  /** Hava pozunun ağırlığı [0, 1] ve bu karenin ayak yüksekliği: kalkışta dolar, inişte boşalır. */
  private airBlend = 0;
  private airFoot = 0;
  private airPhase = 0;
  /** Yürüyüş döngüsü bu karede koştu mu: uçuşta donuk döngünün eski basış bayrağı yeniden sayılmaz. */
  private stepped = true;

  constructor(
    scene: Phaser.Scene,
    private readonly look: SpiderLook,
    layers: SpiderLegLayers,
  ) {
    this.shadow = scene.add.graphics();
    layers.ground.add(this.shadow);

    const parts: LegNodes[] = [];
    const entries: LegGaitLeg[] = [];
    const image = (part: keyof SpiderLook['parts'], box: PartBox): Phaser.GameObjects.Image =>
      addSpiderImage(scene, look.id, part)
        .setOrigin(box.pivotX / box.width, box.pivotY / box.height)
        .setScale(INV);
    for (const side of [-1, 1]) {
      look.hips.forEach((hip, index) => {
        const mirrored: SpiderHip = { x: hip.x, y: hip.y * side, angleDeg: hip.angleDeg * side };
        const contact = image('contact', look.parts.contact).setAlpha(0.9);
        const nodes: LegNodes = {
          hip: mirrored,
          side,
          femur: image('femur', look.parts.femur),
          tibia: image('tibia', look.parts.tibia),
          tarsus: image('tarsus', look.parts.tarsus),
          knee: image('joint', look.parts.joint),
          contact,
        };
        layers.ground.add(contact);
        layers.legs.add([nodes.tarsus, nodes.tibia, nodes.femur, nodes.knee]);
        parts.push(nodes);
        const home = this.restingHome(mirrored, 0, 1);
        entries.push({
          homeX: home.x,
          homeY: home.y,
          // Dönüşümlü dört-ayaklı: bir yanın tek, ötekinin çift sıralı bacakları aynı gruptadır.
          group: (index + (side > 0 ? 1 : 0)) % 2,
        });
      });
    }
    this.legs = parts;
    this.footX = new Array<number>(parts.length).fill(0);
    this.footY = new Array<number>(parts.length).fill(0);
    this.lift = new Array<number>(parts.length).fill(0);
    // Tempo en dıştaki ayağın savrulmasından okunur: ortalama yarıçap dış bacağı yavaş sanır.
    this.stanceRadiusPx = Math.max(...entries.map((entry) => Math.hypot(entry.homeX, entry.homeY)));
    this.gait = new LegGait(entries, {
      stepTriggerPx: look.gait.stepTriggerPx,
      stepDurationMs: look.gait.stepDurationMs,
      stepLeadSeconds: look.gait.stepLeadSeconds,
      maxStrainPx: look.gait.emergencyStrainPx,
      turnWindow: look.gait.turnWindow,
    });
  }

  /** Ayakları gövdenin altına adımsız yerleştirir (doğuş/ışınlanma). */
  reset(bodyX: number, bodyY: number, bodyRad: number, pose: SpiderPose, light: LightLocal): void {
    this.applyStance(0, 1);
    this.airBlend = 0;
    this.gait.reset(bodyX, bodyY, bodyRad);
    this.readFeet(bodyX, bodyY, bodyRad);
    this.place(pose, light);
  }

  update(
    body: LocomotionSignals,
    pose: SpiderPose,
    deltaMs: number,
    light: LightLocal,
    air: LeapPhase = GROUNDED,
  ): void {
    const { gait } = this.look;
    const stepMs = clampSimulationStep(deltaMs);
    const bodyX = finiteOr(body.x, 0);
    const bodyY = finiteOr(body.y, 0);
    const velX = finiteOr(body.velX, 0);
    const velY = finiteOr(body.velY, 0);
    const turnRate = finiteOr(body.turnRateRadPerSec, 0);
    const rad = finiteOr(body.facingHeadingRad, 0);

    this.applyStance(pose.motion01, pose.crouch01);

    const speed = Math.hypot(velX, velY);
    // Dönüş de tempo kaynağıdır: yerinde dönen gövdenin ayak evleri teğetsel savrulur.
    const tangential = Math.abs(turnRate) * this.stanceRadiusPx;
    const tempo = clamp01(Math.max(speed, tangential) / gait.fullTempoSpeed);
    this.stepTuning.stepTriggerPx = lerp(gait.stepTriggerPx, gait.runStepTriggerPx, tempo);
    this.stepTuning.stepDurationMs = lerp(gait.stepDurationMs, gait.runStepDurationMs, tempo);
    this.stepTuning.maxStrainPx = gait.emergencyStrainPx;
    this.gait.setStepTuning(this.stepTuning);

    // Sıçrama hızı adım hedefini erişim dışına fırlatmasın: öngörü yürüyüş tavanında doyar.
    const leadScale = speed > gait.fullTempoSpeed ? gait.fullTempoSpeed / speed : 1;
    // Uçuşta ayaklar yere bağlı değildir: yürüyüş döngüsü donar. İnişte ayaklar gövdenin altına oturur.
    this.stepped = !air.airborne;
    if (!air.airborne) {
      if (air.landed) this.gait.reset(bodyX, bodyY, rad);
      this.gait.update(bodyX, bodyY, rad, velX * leadScale, velY * leadScale, stepMs);
    }
    this.readFeet(bodyX, bodyY, rad);
    this.blendAir(air, pose, deltaMs);
    this.place(pose, light);
  }

  /** O anda havada olan bacak sayısı. */
  get steppingCount(): number {
    return this.gait.steppingCount;
  }

  /** Sıra disiplinini delerek adıma girmiş bacak sayısı (acil rejim). */
  get emergencyCount(): number {
    return this.gait.emergencySteppingCount;
  }

  /** Bu karede yere basan ayakların dünya konumlarını gezer (toz, ses, gövde sarsıntısı); kırık bacak basmaz. */
  forEachPlant(visit: (x: number, y: number) => void): void {
    if (!this.stepped) return;
    for (let i = 0; i < this.legs.length; i++) {
      if (this.isBroken(i)) continue;
      if (this.gait.justPlanted(i)) visit(this.gait.footX(i), this.gait.footY(i));
    }
  }

  /** Bütün sağlam ayakların dünya konumunu gezer (sıçrama kalkış ve iniş tozu). */
  forEachFoot(visit: (x: number, y: number) => void): void {
    for (let i = 0; i < this.legs.length; i++) {
      if (!this.isBroken(i)) visit(this.gait.footX(i), this.gait.footY(i));
    }
  }

  /**
   * Kırık bacaklar: femurun kısa bir kütüğü kalır, tibia ve pençe yoktur, ayak yere basmaz ve temas
   * karartısı çizilmez.
   */
  setBroken(mask: number): void {
    this.broken = mask;
    this.legs.forEach((leg, index) => {
      const intact = !this.isBroken(index);
      leg.tibia.setVisible(intact);
      leg.tarsus.setVisible(intact);
      leg.contact.setVisible(intact);
    });
  }

  /** Gövdenin kırık yana çökmesi (gövde-yerel y, dünya birimi); görünüm yumuşatarak verir. */
  setSag(sag: number): void {
    this.sag = sag;
  }

  /**
   * Basılan yüzeyin yüksekliği ve adım tepesinin çarpanı: tırmanışta ayaklar zeminde değil kayanın
   * üstünde durur (taban yüksekliği) ve basamak çıkar gibi daha yükseğe kalkar.
   */
  setClimb(elevation: number, swingGain: number): void {
    this.elevation = elevation;
    this.swingGain = swingGain;
  }

  private isBroken(index: number): boolean {
    return (this.broken & (1 << index)) !== 0;
  }

  /** Bacağın dünyadaki ayak konumu ve havadaki payı — ölçüm ve sınama için. */
  footOf(index: number): { x: number; y: number; lift: number } {
    return { x: this.gait.footX(index), y: this.gait.footY(index), lift: this.gait.lift(index) };
  }

  get legCount(): number {
    return this.legs.length;
  }

  /** Bacağın gövde-yerel kalçası (yansıtılmış); sınama ve ölçüm için. */
  hipOf(index: number): SpiderHip {
    return this.legs[index].hip;
  }

  /** Bacak parçalarının çizim nesneleri: sınama, katman ve derinlik denetimi için. */
  partsOf(index: number): readonly Phaser.GameObjects.Image[] {
    const leg = this.legs[index];
    return [leg.femur, leg.tibia, leg.tarsus, leg.knee];
  }

  private applyStance(motion01: number, crouch01: number): void {
    for (let i = 0; i < this.legs.length; i++) {
      const home = this.restingHome(this.legs[i].hip, motion01, crouch01);
      this.gait.setLegHome(i, home.x, home.y);
    }
  }

  /** Bacağın gövde-yerel dinlenme ayak konumu; sonuç ödünç nesneye yazılır. */
  private restingHome(
    hip: SpiderHip,
    motion01: number,
    crouch01: number,
  ): { x: number; y: number } {
    const { leg } = this.look;
    const angle = hip.angleDeg * DEG;
    const reach = leg.restDistance * (1 + 0.03 * motion01) * (1 - leg.crouchReachDrop * crouch01);
    this.homeScratch.x = hip.x + Math.cos(angle) * reach;
    this.homeScratch.y = hip.y + Math.sin(angle) * reach;
    return this.homeScratch;
  }

  /** Bacağın gövde-yerel ayak konumu (hava pozu karışmış); sınama ve ölçüm için. */
  localFootOf(index: number): { x: number; y: number } {
    return { x: this.footX[index], y: this.footY[index] };
  }

  /** Hava pozunun ağırlığı [0, 1]: sınama ve ölçüm için. */
  get airWeight(): number {
    return this.airBlend;
  }

  /**
   * Hava pozunu yürüyüş pozuna karıştırır: kalkışta dolar, inişte boşalır. Uçuş ayakları gövde-yereldir
   * (gövdeyle uçar): kalkışta arka bacaklar itilir, zirvede hepsi toplanır, inişe doğru öndekiler öne
   * uzanır (öndekiler biraz erken). Ayak yüksekliği kalkışta hızla çıkar, inişe doğru yere iner.
   */
  private blendAir(air: LeapPhase, pose: SpiderPose, deltaMs: number): void {
    const leap = this.look.leap;
    if (!leap) {
      this.airBlend = 0;
      return;
    }
    const step = air.airborne ? deltaMs / AIR_BLEND.inMs : -deltaMs / AIR_BLEND.outMs;
    this.airBlend = clamp01(this.airBlend + step);
    if (air.airborne) this.airPhase = air.phase;
    if (this.airBlend <= 0) {
      this.airFoot = 0;
      return;
    }
    const phase = this.airPhase;
    const ramp = Math.min(1, phase / AIR_PHASE.footRamp, (1 - phase) / (AIR_PHASE.footRamp * 1.4));
    this.airFoot = air.airborne ? pose.hipHeight * leap.footLift * smooth(ramp) : 0;
    const push = phase < AIR_PHASE.pushEnd ? smooth(1 - phase / AIR_PHASE.pushEnd) : 0;
    const { restDistance } = this.look.leg;
    for (let i = 0; i < this.legs.length; i++) {
      const hip = this.legs[i].hip;
      const angle = hip.angleDeg * DEG;
      const forward = Math.cos(angle);
      const reach = clamp01(phase + AIR_PHASE.frontLead * forward);
      const land = smooth(clamp01((reach - AIR_PHASE.reachStart) / (1 - AIR_PHASE.reachStart)));
      const rear = clamp01(0.35 - forward * 0.65);
      const front = clamp01(0.35 + forward * 0.65);
      const span =
        restDistance *
        (leap.tuckReach +
          push * rear * (leap.pushReach - leap.tuckReach) +
          land * front * (leap.landReach - leap.tuckReach));
      const shift =
        leap.reachShiftPx * (land * Math.max(0, forward) - push * Math.max(0, -forward));
      const x = hip.x + pose.leanX + Math.cos(angle) * span + shift;
      const y = hip.y + pose.leanY + this.sag + Math.sin(angle) * span;
      this.footX[i] = lerp(this.footX[i], x, this.airBlend);
      this.footY[i] = lerp(this.footY[i], y, this.airBlend);
      this.lift[i] = lerp(this.lift[i], 1, this.airBlend);
    }
  }

  /** Yürüyüş döngüsünün dünya ayaklarını gövde-yerel uzaya çevirir. */
  private readFeet(bodyX: number, bodyY: number, rad: number): void {
    const cos = Math.cos(-rad);
    const sin = Math.sin(-rad);
    for (let i = 0; i < this.legs.length; i++) {
      const dx = this.gait.footX(i) - bodyX;
      const dy = this.gait.footY(i) - bodyY;
      this.footX[i] = dx * cos - dy * sin;
      this.footY[i] = dx * sin + dy * cos;
      this.lift[i] = this.gait.lift(i);
    }
  }

  /**
   * Kopmuş bacağın kütüğü: femur kısalmış ve aşağı sarkmış, ucunda diz mafsalı; gölgesi kısa bir çizgidir.
   * Kütük gövdenin hareketiyle sarkar, yürüyüş döngüsüne katılmaz.
   */
  private placeStump(
    leg: LegNodes,
    hipX: number,
    hipY: number,
    hipHeight: number,
    hipScale: number,
    light: LightLocal,
  ): void {
    const { leg: spec } = this.look;
    const hipPar = parallax(hipHeight);
    const hx = hipX * hipPar;
    const hy = hipY * hipPar;
    const angle = leg.hip.angleDeg * DEG + leg.side * STUMP.droop;
    const length = spec.femur * STUMP.length;
    const kx = hx + Math.cos(angle) * length;
    const ky = hy + Math.sin(angle) * length;
    leg.femur
      .setPosition(hx, hy)
      .setRotation(angle)
      .setScale(INV * STUMP.length, INV * hipScale);
    leg.knee.setPosition(kx, ky).setScale(INV * STUMP.knee);
    // Gölge zemin konumundan düşer (paralaks yalnız çizimi iter): kalça ve kütük ucu kendi yüksekliğiyle kayar.
    const { shadowWidth } = spec;
    this.jointX[0] = hipX + light.x * hipHeight;
    this.jointY[0] = hipY + light.y * hipHeight;
    this.jointX[1] = hipX + Math.cos(angle) * length + light.x * STUMP.height;
    this.jointY[1] = hipY + Math.sin(angle) * length + light.y * STUMP.height;
    this.jointWidth[0] = shadowWidth * hipScale;
    this.jointWidth[1] = shadowWidth * STUMP.knee;
    this.fillLimb(2);
  }

  /** Eklem tamponlarındaki uzvu tek çokgen olarak zemin gölgesine doldurur. */
  private fillLimb(joints: number): void {
    const outline = limbOutline(this.jointX, this.jointY, this.jointWidth, joints, this.outline);
    this.shadow.beginPath();
    this.shadow.moveTo(outline.points[0], outline.points[1]);
    for (let i = 1; i < outline.count; i++)
      this.shadow.lineTo(outline.points[i * 2], outline.points[i * 2 + 1]);
    this.shadow.closePath();
    this.shadow.fillPath();
  }

  /** Her bacağı iki kemiğe çözer ve parçaları, gölgeleri ve temas karartılarını yerleştirir. */
  private place(pose: SpiderPose, light: LightLocal): void {
    const { leg: spec, gait, parts } = this.look;
    const shadow = this.shadow;
    shadow.clear();
    shadow.fillStyle(0x000000, spec.shadowAlpha);
    const hipHeight = pose.hipHeight;
    const hipScale = perspective(hipHeight);

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const lift = this.lift[i];
      const hipX = leg.hip.x + pose.leanX;
      const hipY = leg.hip.y + pose.leanY + this.sag;
      if (this.isBroken(i)) {
        this.placeStump(leg, hipX, hipY, hipHeight, hipScale, light);
        continue;
      }
      const dx = this.footX[i] - hipX;
      const dy = this.footY[i] - hipY;
      const reach = Math.hypot(dx, dy);
      const dirX = reach > 1e-3 ? dx / reach : 1;
      const dirY = reach > 1e-3 ? dy / reach : 0;
      const ground = this.elevation + lift * spec.swingPeak * this.swingGain;
      const footHeight = this.airBlend > 0 ? lerp(ground, this.airFoot, this.airBlend) : ground;
      const tucked = Math.max(reach - gait.swingTuckPx * lift, spec.femur * 0.32);
      const sol = solveLeg(tucked, hipHeight, footHeight, spec.femur, spec.tibia, this.solution);

      // Yüksek noktalar gövde merkezinden dışarı itilir; ayak (yükseklik 0) yerinde kalır.
      const hipPar = parallax(hipHeight);
      const kneePar = parallax(sol.kneeHeight);
      const footPar = parallax(footHeight);
      const hx = hipX * hipPar;
      const hy = hipY * hipPar;
      const kx = (hipX + dirX * sol.kneeU) * kneePar;
      const ky = (hipY + dirY * sol.kneeU) * kneePar;
      const fx = (hipX + dirX * sol.footU) * footPar;
      const fy = (hipY + dirY * sol.footU) * footPar;

      const femurAngle = Math.atan2(ky - hy, kx - hx);
      const femurLength = Math.hypot(kx - hx, ky - hy);
      const kneeScale = perspective(sol.kneeHeight);
      const tibiaAngle = Math.atan2(fy - ky, fx - kx);
      const tibiaLength = Math.hypot(fx - kx, fy - ky);

      leg.femur
        .setPosition(hx, hy)
        .setRotation(femurAngle)
        .setScale((INV * femurLength) / spec.femur, (INV * (hipScale + kneeScale)) / 2);
      leg.tibia
        .setPosition(kx, ky)
        .setRotation(tibiaAngle)
        .setScale(
          (INV * tibiaLength) / spec.tibia,
          (INV * (kneeScale + perspective(footHeight))) / 2,
        );
      const curl = lerp(spec.clawPlantedCurlDeg, spec.clawLiftCurlDeg, lift) * DEG;
      leg.tarsus
        .setPosition(fx, fy)
        .setRotation(tibiaAngle + curl * leg.side)
        .setScale(INV * perspective(footHeight));
      leg.knee.setPosition(kx, ky).setScale(INV * kneeScale * 0.8);

      // Gölge: her eklem zemin konumundan KENDİ yüksekliğiyle orantılı kayar (paralaks çizimi iter, gölgeyi
      // değil) ve kemiğin kalınlığı kadar şerit olur; basılı ayak gölgesiyle birleşir.
      const gx1 = hipX + dirX * sol.kneeU;
      const gy1 = hipY + dirY * sol.kneeU;
      const gx2 = hipX + dirX * sol.footU;
      const gy2 = hipY + dirY * sol.footU;
      const s2x = gx2 + light.x * footHeight;
      const s2y = gy2 + light.y * footHeight;
      this.jointX[0] = hipX + light.x * hipHeight;
      this.jointY[0] = hipY + light.y * hipHeight;
      this.jointX[1] = gx1 + light.x * sol.kneeHeight;
      this.jointY[1] = gy1 + light.y * sol.kneeHeight;
      this.jointX[2] = s2x;
      this.jointY[2] = s2y;
      this.jointWidth[0] = spec.shadowWidth * hipScale;
      this.jointWidth[1] = spec.shadowWidth * KNEE_TAPER * kneeScale;
      this.jointWidth[2] = spec.shadowWidth * FOOT_TAPER * perspective(footHeight);
      this.fillLimb(3);
      leg.contact
        .setPosition(s2x, s2y)
        .setScale(INV * (spec.contactPx / parts.contact.width) * (1 - 0.45 * lift))
        .setAlpha(0.95 - 0.65 * lift);
    }
  }
}

/** Işığın gövde-yerel kayma yönü (yükseklik başına dünya birimi): gövde dönünce ışık dünyada sabit kalır. */
export interface LightLocal {
  x: number;
  y: number;
}

/** Işığın dünyadaki sabit yönünü gövde-yerel uzaya çevirir. */
export function lightLocal(hullRad: number, out: LightLocal): LightLocal {
  const cos = Math.cos(-hullRad);
  const sin = Math.sin(-hullRad);
  out.x = SPIDER_ART.light.x * cos - SPIDER_ART.light.y * sin;
  out.y = SPIDER_ART.light.x * sin + SPIDER_ART.light.y * cos;
  return out;
}
