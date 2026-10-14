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
import type { LocomotionSignals } from './signals';
import { solveLeg, type LegSolution } from './legSolve';
import type { SpiderPose } from './SpiderMotion';

const DEG = Math.PI / 180;
const INV = 1 / TEXTURE_SCALE;

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
  private readonly footX: number[];
  private readonly footY: number[];
  private readonly lift: number[];
  private readonly stepTuning = { stepTriggerPx: 0, stepDurationMs: 0, maxStrainPx: 0 };
  private readonly solution: LegSolution = { kneeU: 0, kneeHeight: 0, footU: 0 };
  private readonly stanceRadiusPx: number;
  private readonly homeScratch = { x: 0, y: 0 };

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
        const home = this.restingHome(mirrored, 0, 0, 1);
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
    this.applyStance(0, 0, 1);
    this.gait.reset(bodyX, bodyY, bodyRad);
    this.readFeet(bodyX, bodyY, bodyRad);
    this.place(pose, light);
  }

  update(body: LocomotionSignals, pose: SpiderPose, deltaMs: number, light: LightLocal): void {
    const { gait } = this.look;
    const stepMs = clampSimulationStep(deltaMs);
    const bodyX = finiteOr(body.x, 0);
    const bodyY = finiteOr(body.y, 0);
    const velX = finiteOr(body.velX, 0);
    const velY = finiteOr(body.velY, 0);
    const turnRate = finiteOr(body.turnRateRadPerSec, 0);
    const dash01 = clamp01(finiteOr(body.dash01, 0));
    const rad = finiteOr(body.facingHeadingRad, 0);

    this.applyStance(pose.motion01, dash01, pose.crouch01);

    const speed = Math.hypot(velX, velY);
    // Dönüş de tempo kaynağıdır: yerinde dönen gövdenin ayak evleri teğetsel savrulur.
    const tangential = Math.abs(turnRate) * this.stanceRadiusPx;
    const tempo = clamp01(Math.max(speed, tangential) / gait.fullTempoSpeed);
    // Av atılışında adımlar kısalır ve sıklaşır: bacaklar yürüyüşten çok koşu/atlayış gibi çalışır.
    this.stepTuning.stepTriggerPx =
      lerp(gait.stepTriggerPx, gait.runStepTriggerPx, tempo) * (1 - gait.dashTriggerCut * dash01);
    this.stepTuning.stepDurationMs =
      lerp(gait.stepDurationMs, gait.runStepDurationMs, tempo) *
      (1 - gait.dashDurationCut * dash01);
    this.stepTuning.maxStrainPx = gait.emergencyStrainPx * (1 - gait.dashStrainCut * dash01);
    this.gait.setStepTuning(this.stepTuning);

    // Atılış hızı adım hedefini erişim dışına fırlatmasın: öngörü, atılışta genişleyen bir tavanda doyar.
    const leadCap = gait.fullTempoSpeed * (1 + gait.dashLeadGain * dash01);
    const leadScale = speed > leadCap ? leadCap / speed : 1;
    this.gait.update(bodyX, bodyY, rad, velX * leadScale, velY * leadScale, stepMs);
    this.readFeet(bodyX, bodyY, rad);
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

  /** Bu karede yere basan ayakların dünya konumlarını gezer (toz, ses, gövde sarsıntısı). */
  forEachPlant(visit: (x: number, y: number) => void): void {
    for (let i = 0; i < this.legs.length; i++) {
      if (this.gait.justPlanted(i)) visit(this.gait.footX(i), this.gait.footY(i));
    }
  }

  /** Bütün ayakların dünya konumunu gezer (atılış başlangıç tozu). */
  forEachFoot(visit: (x: number, y: number) => void): void {
    for (let i = 0; i < this.legs.length; i++) visit(this.gait.footX(i), this.gait.footY(i));
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

  private applyStance(motion01: number, dash01: number, crouch01: number): void {
    for (let i = 0; i < this.legs.length; i++) {
      const home = this.restingHome(this.legs[i].hip, motion01, dash01, crouch01);
      this.gait.setLegHome(i, home.x, home.y);
    }
  }

  /** Bacağın gövde-yerel dinlenme ayak konumu; sonuç ödünç nesneye yazılır. */
  private restingHome(
    hip: SpiderHip,
    motion01: number,
    dash01: number,
    crouch01: number,
  ): { x: number; y: number } {
    const { leg } = this.look;
    const angle = hip.angleDeg * DEG;
    const reach =
      leg.restDistance *
      (1 + leg.dashReachGain * dash01 + 0.03 * motion01) *
      (1 - leg.crouchReachDrop * crouch01);
    // Av atılışı: öndeki bacaklar ileri fırlar, arkadakiler geride itiş verir (daha az: kemik erişimi dar).
    const forward = Math.cos(angle);
    const lunge = leg.dashLungePx * dash01 * (forward > 0 ? forward : forward * 0.35);
    this.homeScratch.x = hip.x + Math.cos(angle) * reach + lunge;
    this.homeScratch.y = hip.y + Math.sin(angle) * reach;
    return this.homeScratch;
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

  /** Her bacağı iki kemiğe çözer ve parçaları, gölgeleri ve temas karartılarını yerleştirir. */
  private place(pose: SpiderPose, light: LightLocal): void {
    const { leg: spec, gait, parts } = this.look;
    const shadow = this.shadow;
    shadow.clear();
    shadow.lineStyle(spec.shadowWidth, 0x000000, spec.shadowAlpha);
    const hipHeight = pose.hipHeight;
    const hipScale = perspective(hipHeight);

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const lift = this.lift[i];
      const hipX = leg.hip.x + pose.leanX;
      const hipY = leg.hip.y + pose.leanY;
      const dx = this.footX[i] - hipX;
      const dy = this.footY[i] - hipY;
      const reach = Math.hypot(dx, dy);
      const dirX = reach > 1e-3 ? dx / reach : 1;
      const dirY = reach > 1e-3 ? dy / reach : 0;
      const footHeight = lift * spec.swingPeak;
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

      // Gölge: her nokta KENDİ yüksekliğiyle orantılı kayar; basılı ayak gölgesiyle birleşir.
      const s0x = hx + light.x * hipHeight;
      const s0y = hy + light.y * hipHeight;
      const s1x = kx + light.x * sol.kneeHeight;
      const s1y = ky + light.y * sol.kneeHeight;
      const s2x = fx + light.x * footHeight;
      const s2y = fy + light.y * footHeight;
      shadow.beginPath();
      shadow.moveTo(s0x, s0y);
      shadow.lineTo(s1x, s1y);
      shadow.lineTo(s2x, s2y);
      shadow.strokePath();
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
