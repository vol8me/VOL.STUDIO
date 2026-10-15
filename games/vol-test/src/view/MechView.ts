import Phaser from 'phaser';
import { poseSourceOf, PoseShadow, clamp01, type PoseSourceNode } from '@volstudio/core';
import { Spring1D } from '@volstudio/core/math';
import { MECH_ART, MECH_VIEW, type MechArt } from '@/config/mechView';
import { LIGHT } from '@/config/light';
import { PARTS } from '@/config/parts';
import type { MechSpec } from '@/config/vehicles';
import { WATER_VIEW } from '@/config/waterView';
import { TRACK_LEFT, TRACK_RIGHT } from '@/sim/chassis/parts';
import { mountPose, muzzlePose, type MuzzlePose } from '@/sim/muzzle';
import { setCharred, sinkRoot, submergeRoot } from './charring';
import { CorePulse } from './CorePulse';
import type { FootPrintSink } from './SpiderView';
import { TEXTURE, TEXTURE_SCALE, addMechImage } from './textures';
import type { TankFrame, VehicleView } from './VehicleView';

const INV = 1 / TEXTURE_SCALE;

/** Bir bacağın durumu: ayak adım fazına ek kayma (boşta ayakları yan yana dizer) ve izleme sayaçları. */
interface Leg {
  readonly side: -1 | 1;
  readonly thigh: Phaser.GameObjects.Image;
  readonly shin: Phaser.GameObjects.Image;
  readonly hip: Phaser.GameObjects.Image;
  readonly knee: Phaser.GameObjects.Image;
  readonly ankle: Phaser.GameObjects.Image;
  readonly foot: Phaser.GameObjects.Image;
  offset: number;
  lastHalf: number;
  /** Bu bacağın katettiği mutlak yol (birim); topal çöküşün fazı. */
  ground: number;
  lastTread: number;
  /** Ayağın şu anki gövde-yerel konumu (toz ve iz için). */
  footX: number;
  footY: number;
}

/** Bir silah kolu: görüntü, geri kayış yayı ve ağız parlaması. */
interface Arm {
  readonly image: Phaser.GameObjects.Image;
  readonly flash: Phaser.GameObjects.Image;
  readonly recoil: Spring1D;
  flashMs: number;
}

/** Adım fazından ayağın merkeze göre x konumu ([-amp, amp]) ve havada olma oranı [0, 1]. */
export function gaitOf(phase: number, amp: number, out: { x: number; lift: number }): void {
  const f = phase - Math.floor(phase);
  if (f < 0.5) {
    out.x = amp - 4 * amp * f;
    out.lift = 0;
    return;
  }
  const s = (f - 0.5) * 2;
  out.x = -amp + 2 * amp * (0.5 - 0.5 * Math.cos(Math.PI * s));
  out.lift = Math.sin(Math.PI * s);
}

/**
 * İki bacaklı robotun (Warhound, Templar, Juggernaut) sahne karşılığı: hepsi el çizimi SVG parça.
 * Çizim sırası: yerde iki bacak (uyluk, baldır, eklem diskleri, ayak), onların üstünde gövde, çekirdek
 * ve silah kolları. Ayaklar gövdeye göre adım fazından türer ve basıldığı yerde kalır: faz iki bacağın
 * kendi katettiği yoldan gelir (simülasyondaki adım çukuruyla aynı `strideLength`), yani yerinde dönen
 * mech bacaklarını zıt yönde atar. Boşta ayaklar yan yana oturur. Her ayak basışı gövdeyi çöktürür,
 * toz ve bot izi bırakır; kopan bacak kısa bir kütüktür ve gövde o yana her adımda çöker. Kollar
 * yuvalarında `sim/muzzle` açısıyla döner: çizilen namlu atışın çıktığı yeri gösterir.
 */
export class MechView implements VehicleView {
  readonly root: Phaser.GameObjects.Container;
  private readonly art: MechArt;
  private readonly shadow: PoseShadow;
  private readonly shadowSource: PoseSourceNode;
  private readonly legs: Leg[];
  private readonly arms: Arm[];
  private readonly body: Phaser.GameObjects.Container;
  private readonly core: CorePulse;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly weight = new Spring1D();
  private readonly mount: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private readonly tip: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private readonly gait = { x: 0, lift: 0 };
  private broken = 0;
  private elapsedMs = 0;
  /** Boştaki ayakların oturma ilerlemesi [0, 1]: havada kalan ayak yavaşça iner. */
  private rest = 1;
  private strikeLeft = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly spec: MechSpec,
    lighting: Phaser.GameObjects.Container,
    private readonly footprint?: FootPrintSink,
  ) {
    const art = MECH_ART[spec.id];
    this.art = art;
    this.shadow = new PoseShadow(scene, {
      offsetX: LIGHT.x * MECH_VIEW.shadowHeight,
      offsetY: LIGHT.y * MECH_VIEW.shadowHeight,
      alpha: MECH_VIEW.shadowAlpha,
      depth: 9,
    });

    const place = (
      part: 'thigh' | 'shin' | 'joint' | 'foot',
      originX: number,
    ): Phaser.GameObjects.Image =>
      addMechImage(scene, spec.id, part).setOrigin(originX, 0.5).setScale(INV);
    this.legs = ([-1, 1] as const).map((side) => ({
      side,
      thigh: place('thigh', 0),
      shin: place('shin', 0),
      hip: place('joint', 0.5),
      knee: place('joint', 0.5),
      ankle: place('joint', 0.5),
      foot: place('foot', art.foot.ankleX / art.foot.width),
      offset: 0,
      lastHalf: 0,
      ground: 0,
      lastTread: 0,
      footX: 0,
      footY: 0,
    }));

    const hull = addMechImage(scene, spec.id, 'hull').setScale(INV);
    this.core = new CorePulse(scene, art.core.scale, art.core.tint, true);
    this.core.place(art.core.x, art.core.y);
    this.arms = spec.armament.mounts.map(() => ({
      image: addMechImage(scene, spec.id, 'arm')
        .setOrigin(art.arm.pivotX / art.arm.width, 0.5)
        .setScale(INV),
      flash: scene.add
        .image(0, 0, TEXTURE.flash)
        .setTint(art.glow)
        .setOrigin(0, 0.5)
        .setScale(INV * art.flashScale)
        .setVisible(false),
      recoil: new Spring1D(),
      flashMs: 0,
    }));
    for (const arm of this.arms) lighting.add(arm.flash);

    this.body = scene.add.container(0, 0, [
      hull,
      this.core.image,
      ...this.arms.map((a) => a.image),
    ]);
    const legImages = this.legs.flatMap((leg) => [
      leg.thigh,
      leg.shin,
      leg.hip,
      leg.knee,
      leg.ankle,
      leg.foot,
    ]);
    this.root = scene.add.container(0, 0, [...legImages, this.body]);
    this.root.setDepth(MECH_VIEW.depth);
    this.shadowSource = poseSourceOf([
      ...this.legs.flatMap((leg) => [leg.thigh, leg.shin, leg.foot]),
      hull,
      ...this.arms.map((a) => a.image),
    ]);
    this.dust = scene.add
      .particles(0, 0, TEXTURE.spark, MECH_VIEW.dust.emitter)
      .setDepth(MECH_VIEW.dust.depth);
  }

  /** Atışta ateşleyen kol geri kayar ve ağız parlaması yanar. */
  fire(mount: number): void {
    const arm = this.arms[mount] ?? this.arms[0];
    arm.recoil.velocity += this.art.recoil.kick;
    arm.flashMs = MECH_VIEW.flashMs;
    arm.flash.setScale(INV * this.art.flashScale * (0.85 + Math.random() * 0.35));
    arm.flash.setVisible(true);
  }

  /** Duvara çarpma gövdeyi çöktürür. */
  impact(strength: number): void {
    this.weight.velocity += this.art.weight.kick * 2.4 * strength;
  }

  /** Kopan bacak kısa bir kütüğe döner (bit 0 sol, bit 1 sağ). */
  setParts(mask: number): void {
    this.broken = mask;
    const stub = MECH_VIEW.stub;
    [TRACK_LEFT, TRACK_RIGHT].forEach((bit, index) => {
      const gone = (mask & bit) !== 0;
      const leg = this.legs[index];
      leg.shin.setVisible(!gone);
      leg.knee.setVisible(!gone);
      leg.ankle.setVisible(!gone);
      leg.foot.setVisible(!gone);
      leg.thigh.setTint(gone ? stub.tint : 0xffffff).setAlpha(gone ? stub.alpha : 1);
    });
  }

  update(frame: TankFrame, deltaMs: number): void {
    const { art } = this;
    const mech = this.spec.mech;
    const view = MECH_VIEW;
    this.elapsedMs += deltaMs;
    this.root.setPosition(frame.x, frame.y).setRotation(frame.hull);

    const effort = clamp01(frame.speed / mech.maxSpeed);
    const idle =
      frame.speed < view.settle.idleSpeed &&
      Math.abs(frame.angularVelocity) < view.settle.idleTurn &&
      !frame.boosting;
    const settle = 1 - Math.exp(-deltaMs / view.settle.tauMs);
    this.rest += ((idle ? 1 : 0) - this.rest) * settle;
    const amp = mech.strideLength / 4;
    const liftGain = (1 - this.rest) * (frame.boosting ? view.dash.liftGain : 1);

    let stance = 0;
    let collapse = 0;
    for (const [index, leg] of this.legs.entries()) {
      const tread = index === 0 ? frame.treadLeft : frame.treadRight;
      const travelled = Math.abs(tread - leg.lastTread);
      leg.lastTread = tread;
      if (travelled < mech.maxSpeed) leg.ground += travelled;
      const raw = tread / mech.strideLength + (index === 0 ? 0 : 0.5);
      if (idle) {
        const current = raw + leg.offset;
        const rest = 0.25 + 0.5 * Math.round((current - 0.25) / 0.5);
        leg.offset += (rest - raw - leg.offset) * settle;
      }
      const phase = raw + leg.offset;
      this.stepLeg(leg, index, phase, amp, liftGain, frame, effort);
      const f = phase - Math.floor(phase);
      if (index === 0) stance = -Math.sin(f * Math.PI * 2);
      const gone = (this.broken & (index === 0 ? TRACK_LEFT : TRACK_RIGHT)) !== 0;
      if (gone) {
        const ground = (leg.ground / PARTS.mech.stumble.stride) * Math.PI * 2;
        collapse += leg.side * 0.5 * (1 - Math.cos(ground));
      }
    }

    this.weight.update(0, deltaMs, view.weightSpring);
    this.weight.value = Phaser.Math.Clamp(this.weight.value, -6, 6);
    const moving = 1 - this.rest;
    const shift = stance * view.sway.px * moving * (0.35 + effort * 0.65);
    const limp = collapse * view.stub.sag;
    this.body
      .setPosition(
        frame.pitch + (frame.boosting ? view.dash.lean : 0) * moving,
        frame.roll + shift + limp,
      )
      .setRotation(-stance * view.sway.roll * moving * effort + collapse * view.stub.roll)
      .setScale(1 - this.weight.value * art.weight.dip);

    this.core.update(effort, frame.boosting, deltaMs);
    this.placeArms(frame, deltaMs);
    this.shadow.update(this.shadowSource);
  }

  setPresent(present: boolean): void {
    this.root.setVisible(present);
    if (present) return;
    this.shadow.clear();
    for (const arm of this.arms) {
      arm.flashMs = 0;
      arm.recoil.value = 0;
      arm.recoil.velocity = 0;
      arm.flash.setVisible(false);
    }
  }

  setWrecked(wrecked: boolean): void {
    setCharred(this.root, wrecked);
    if (!wrecked) return;
    for (const arm of this.arms) {
      arm.flashMs = 0;
      arm.flash.setVisible(false);
    }
  }

  submerge(depth: number): void {
    submergeRoot(this.root, depth);
  }

  sink(progress: number): void {
    sinkRoot(this.root, progress, WATER_VIEW.sink.scale);
    if (progress > 0) this.shadow.clear();
  }

  destroy(): void {
    this.shadow.destroy();
    for (const arm of this.arms) arm.flash.destroy();
    this.core.destroy();
    this.dust.destroy();
    this.root.destroy();
  }

  /** Bir bacağı fazdan çözer: ayak konumu, diz bükümü, kemik gerilmesi ve basış olayları. */
  private stepLeg(
    leg: Leg,
    index: number,
    phase: number,
    amp: number,
    liftGain: number,
    frame: TankFrame,
    effort: number,
  ): void {
    const { art } = this;
    const offset = this.spec.mech.trackOffset;
    const gait = this.gait;
    gaitOf(phase, amp, gait);
    const lift = gait.lift * liftGain;
    const hx = art.hipX;
    const hy = leg.side * offset;
    const fx = hx + art.gait.footCenter + gait.x;
    const fy = leg.side * (offset + art.gait.footOut * lift);
    leg.footX = fx;
    leg.footY = fy;

    const dx = fx - hx;
    const dy = fy - hy;
    const reach = art.gait.footCenter + amp;
    const bend = 1 - clamp01(Math.hypot(dx, dy) / reach);
    const kx = hx + dx * 0.5;
    const ky = hy + dy * 0.5 + leg.side * art.gait.kneeOut * bend;
    const gone = (this.broken & (index === 0 ? TRACK_LEFT : TRACK_RIGHT)) !== 0;

    leg.hip.setPosition(hx, hy);
    const stub = MECH_VIEW.stub;
    if (gone) {
      // Kütük: kalçadan dışa kısa bir uyluk; baldır ve ayak yoktur.
      const length = art.thigh.length * stub.length;
      leg.thigh
        .setPosition(hx, hy)
        .setRotation(leg.side * 0.5)
        .setScale((INV * length) / art.thigh.length, INV);
      return;
    }
    const upper = Math.hypot(kx - hx, ky - hy);
    const lower = Math.hypot(fx - kx, fy - ky);
    leg.thigh
      .setPosition(hx, hy)
      .setRotation(Math.atan2(ky - hy, kx - hx))
      .setScale((INV * upper) / art.thigh.length, INV);
    leg.shin
      .setPosition(kx, ky)
      .setRotation(Math.atan2(fy - ky, fx - kx))
      .setScale((INV * lower) / art.shin.length, INV);
    leg.knee.setPosition(kx, ky);
    leg.ankle.setPosition(fx, fy);
    const grow = 1 + art.gait.lift * lift;
    leg.foot
      .setPosition(fx, fy)
      .setRotation(leg.side * 0.1 * lift)
      .setScale(INV * grow);
    leg.ankle.setScale(INV * grow);

    this.detectPlant(leg, phase, frame, effort);
  }

  /** Yarım döngü çift sayıya geçince (ileri ya da geri yürürken) ayak yere basmıştır. */
  private detectPlant(leg: Leg, phase: number, frame: TankFrame, effort: number): void {
    const half = Math.floor(phase * 2);
    const previous = leg.lastHalf;
    leg.lastHalf = half;
    if (half === previous || Math.abs(half - previous) > 2) return;
    if (((half % 2) + 2) % 2 !== 0) return;
    this.weight.velocity += this.art.weight.kick * (0.45 + effort * 0.9);
    if (frame.speed < 6) return;
    const cos = Math.cos(frame.hull);
    const sin = Math.sin(frame.hull);
    const x = frame.x + leg.footX * cos - leg.footY * sin;
    const y = frame.y + leg.footX * sin + leg.footY * cos;
    const { dust } = MECH_VIEW;
    this.dust.emitParticleAt(
      x,
      y,
      Math.round(dust.countMin + (dust.countMax - dust.countMin) * effort),
    );
    this.footprint?.(x, y, frame.hull, this.art.foot.width * 0.8, this.art.foot.height * 0.9);
  }

  private placeArms(frame: TankFrame, deltaMs: number): void {
    const { art } = this;
    const armament = this.spec.armament;
    const bodyRotation = this.body.rotation;
    for (const [index, arm] of this.arms.entries()) {
      arm.recoil.update(0, deltaMs, art.recoil);
      arm.recoil.value = Phaser.Math.Clamp(arm.recoil.value, -art.recoil.max, 0);
      const mount = armament.mounts[index];
      const pose = mountPose(frame, armament, index, this.mount);
      const local = pose.angle - frame.hull - bodyRotation;
      arm.image
        .setPosition(
          mount.x + Math.cos(local) * arm.recoil.value,
          mount.y + Math.sin(local) * arm.recoil.value,
        )
        .setRotation(local);
      const tip = muzzlePose(frame, armament, index, this.tip, mount.reach + arm.recoil.value);
      arm.flash.setPosition(tip.x, tip.y).setRotation(tip.angle);
      if (arm.flashMs <= 0) continue;
      arm.flashMs = Math.max(0, arm.flashMs - deltaMs);
      arm.flash.setAlpha(arm.flashMs / MECH_VIEW.flashMs);
      arm.flash.setVisible(arm.flashMs > 0);
    }
  }
}
