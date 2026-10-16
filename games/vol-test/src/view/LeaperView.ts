import Phaser from 'phaser';
import {
  poseSourceOf,
  PoseShadow,
  clamp01,
  type PoseShadowOptions,
  type PoseSourceNode,
} from '@volstudio/core';
import { Spring1D, angleDelta } from '@volstudio/core/math';
import { LEAPER_ART, LEAPER_VIEW, type LeaperArt } from '@/config/leaperView';
import { LIGHT } from '@/config/light';
import { PARTS } from '@/config/parts';
import type { LeaperSpec } from '@/config/vehicles';
import { WATER_VIEW } from '@/config/waterView';
import { LEAPER_LEGS_PER_SIDE, legBit, limpCollapse } from '@/sim/chassis/parts';
import { mountPose, muzzlePose, type MuzzlePose } from '@/sim/muzzle';
import { setCharred, sinkRoot, submergeRoot } from './charring';
import { CorePulse } from './CorePulse';
import { gaitOf } from './MechView';
import type { FootPrintSink } from './SpiderView';
import { TEXTURE, TEXTURE_SCALE, addMechImage } from './textures';
import type { TankFrame, VehicleView } from './VehicleView';

const INV = 1 / TEXTURE_SCALE;
/** Ön ve arka bacak istasyonları: `PARTS.leaper.stations` ve kırık bacak bitiyle aynı sıra. */
const FRONT = 0;
const REAR = 1;

/** Bir bacağın durumu: kalça, ayak adım fazına ek kayma (boşta ayakları oturtur) ve izleme sayaçları. */
interface Leg {
  readonly side: -1 | 1;
  readonly station: 0 | 1;
  /** Bu bacağın `Chassis.parts` biti (sol bacaklar 0-1, sağ bacaklar 4-5). */
  readonly bit: number;
  readonly thigh: Phaser.GameObjects.Image;
  readonly shin: Phaser.GameObjects.Image;
  readonly hip: Phaser.GameObjects.Image;
  readonly knee: Phaser.GameObjects.Image;
  readonly ankle: Phaser.GameObjects.Image;
  readonly foot: Phaser.GameObjects.Image;
  offset: number;
  lastHalf: number;
  lastTread: number;
  /** Bu bacağın yanının katettiği mutlak yol (birim); topal çöküşün fazı. */
  ground: number;
  /** Ayağın şu anki gövde-yerel konumu (toz ve iz için). */
  footX: number;
  footY: number;
}

/** Bir silah yuvası: görüntü, geri kayış yayı ve ağız parlaması. */
interface Arm {
  readonly image: Phaser.GameObjects.Image;
  readonly flash: Phaser.GameObjects.Image;
  readonly recoil: Spring1D;
  flashMs: number;
}

/** Arka sıçrama iticisinin alevi: ADD katmanında, arkaya doğru uzar. */
interface Flame {
  readonly image: Phaser.GameObjects.Image;
}

/**
 * Dört bacaklı sıçrayıcının (Jackal, Panther, Rhino) sahne karşılığı: hepsi el çizimi SVG parça.
 * Çizim sırası: yerde dört bacak (uyluk, baldır, eklem diskleri, pençe), üstünde gövde, çekirdek ve
 * silah yuvaları. Yürüyüş bir SEKMEDİR: ön ve arka çift yarım faz arayla basar, sol ve sağ bacak
 * çok az gecikmeyle; faz iki yanın katettiği yoldan türer (simülasyondaki sekme çukuruyla aynı
 * `strideLength`). Boşta pençeler yan yana oturur.
 *
 * Sıçrama (atılım, `frame.boosting`): bacaklar toplanıp öne ve arkaya uzanır, gövde tepe noktasında
 * büyür, gölge ayrılıp küçülür, arka iticiler alev çakar; iniş gövdeyi çöktürür, toz ve pençe izi
 * bırakır. Kopan bacak kısa bir kütüktür; gövde o yana her adımda çöker. Silahlar yuvalarında
 * `sim/muzzle` açısıyla döner: çizilen namlu atışın çıktığı yeri gösterir.
 */
export class LeaperView implements VehicleView {
  readonly root: Phaser.GameObjects.Container;
  private readonly art: LeaperArt;
  private readonly shadow: PoseShadow;
  private readonly shadowOptions: PoseShadowOptions;
  private readonly shadowSource: PoseSourceNode;
  private readonly legs: Leg[];
  private readonly arms: Arm[];
  private readonly flames: Flame[];
  private readonly body: Phaser.GameObjects.Container;
  private readonly core: CorePulse;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly weight = new Spring1D();
  /** Dönüşte gövdenin yana kayması ve yönünün hizadan geri kalması: iki yay dönüş bitince sallanır. */
  private readonly lean = new Spring1D();
  private readonly twist = new Spring1D();
  /** Kafanın nişana bakışı (rad, gövdeye göre) ve kuyruğun savrulması (rad): iki yay. */
  private readonly gaze = new Spring1D();
  private readonly swing = new Spring1D();
  private readonly head: Phaser.GameObjects.Image;
  private readonly tail: Phaser.GameObjects.Image;
  /** Bu karenin dönüş yükü [-1, 1] (işaret açısal hızınki): bacak kaldırma ve toz bunu okur. */
  private turnLoad = 0;
  private readonly mount: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private readonly tip: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private readonly gait = { x: 0, lift: 0 };
  /** Sıçramanın tahmini süresi (ms): depo kapasitesi / boşalma hızı. */
  private readonly leapMs: number;
  private broken = 0;
  /** Boştaki ayakların oturma ilerlemesi [0, 1]: havada kalan ayak yavaşça iner. */
  private rest = 1;
  /** Havada olma ilerlemesi [0, 1] (bacak pozu) ve sıçramanın başlangıcından geçen süre (ms). */
  private air = 0;
  private flightMs = 0;
  private wasBoosting = false;

  constructor(
    scene: Phaser.Scene,
    private readonly spec: LeaperSpec,
    lighting: Phaser.GameObjects.Container,
    private readonly footprint?: FootPrintSink,
  ) {
    const art = LEAPER_ART[spec.id];
    this.art = art;
    const config = spec.leaper;
    this.leapMs = (config.boostCapacity / config.boostDrain) * 1000;
    this.shadowOptions = {
      offsetX: LIGHT.x * LEAPER_VIEW.shadowHeight,
      offsetY: LIGHT.y * LEAPER_VIEW.shadowHeight,
      alpha: LEAPER_VIEW.shadowAlpha,
      depth: 9,
    };
    this.shadow = new PoseShadow(scene, this.shadowOptions);

    const place = (
      part: 'thigh' | 'shin' | 'joint' | 'foot',
      originX: number,
    ): Phaser.GameObjects.Image =>
      addMechImage(scene, spec.id, part).setOrigin(originX, 0.5).setScale(INV);
    const stations = [FRONT, REAR] as const;
    this.legs = ([-1, 1] as const).flatMap((side) =>
      stations.map((station): Leg => ({
        side,
        station,
        bit: legBit(side === -1 ? 0 : 1, station),
        thigh: place('thigh', 0),
        shin: place('shin', 0),
        hip: place('joint', 0.5),
        knee: place('joint', 0.5),
        ankle: place('joint', 0.5),
        foot: place('foot', art.foot.ankleX / art.foot.width),
        offset: 0,
        lastHalf: 0,
        lastTread: 0,
        ground: 0,
        footX: 0,
        footY: 0,
      })),
    );

    const hull = addMechImage(scene, spec.id, 'hull').setScale(INV);
    this.head = addMechImage(scene, spec.id, 'head')
      .setOrigin(art.head.pivotX / art.head.width, 0.5)
      .setScale(INV)
      .setPosition(art.head.x, art.head.y);
    // Kuyruk kökünden geriye uzanır: resim sağa çizilidir, yarım tur döndürülür.
    this.tail = addMechImage(scene, spec.id, 'tail')
      .setOrigin(0, 0.5)
      .setScale(INV)
      .setPosition(art.tail.x, art.tail.y)
      .setRotation(Math.PI);
    this.core = new CorePulse(scene, art.core.scale, art.core.tint, true);
    this.core.place(art.core.x, art.core.y);
    this.arms = spec.armament.mounts.map(() => ({
      image: addMechImage(scene, spec.id, 'arm')
        .setOrigin(art.arm.pivotX / art.arm.width, 0.5)
        .setScale(INV),
      flash: scene.add.image(0, 0, TEXTURE.flash).setTint(art.glow).setOrigin(0, 0.5).setScale(INV),
      recoil: new Spring1D(),
      flashMs: 0,
    }));
    for (const arm of this.arms) {
      arm.flash.setScale(INV * art.flashScale).setVisible(false);
      lighting.add(arm.flash);
    }
    this.flames = art.thrusters.map(() => ({
      image: scene.add
        .image(0, 0, TEXTURE.flash)
        .setTint(art.glow)
        .setTintMode(Phaser.TintModes.FILL)
        .setOrigin(0, 0.5)
        .setScale(INV)
        .setVisible(false),
    }));
    for (const flame of this.flames) lighting.add(flame.image);

    const armImages = this.arms.map((a) => a.image);
    // Omuz silahlı sıçrayıcıda kafa silahların üstündedir (kulaklar görünür); sırt raylıda silah kafanın üstünden geçer.
    this.body = scene.add.container(0, 0, [
      this.tail,
      hull,
      ...(art.head.over ? [...armImages, this.head] : [this.head, ...armImages]),
      this.core.image,
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
    this.root.setDepth(LEAPER_VIEW.depth);
    this.shadowSource = poseSourceOf([
      ...this.legs.flatMap((leg) => [leg.thigh, leg.shin, leg.foot]),
      this.tail,
      hull,
      this.head,
      ...armImages,
    ]);
    this.dust = scene.add
      .particles(0, 0, TEXTURE.spark, LEAPER_VIEW.dust.emitter)
      .setDepth(LEAPER_VIEW.dust.depth);
  }

  /** Atışta ateşleyen yuva geri kayar ve ağız parlaması yanar. */
  fire(mount: number): void {
    const arm = this.arms[mount] ?? this.arms[0];
    arm.recoil.velocity += this.art.recoil.kick;
    arm.flashMs = LEAPER_VIEW.flashMs;
    arm.flash.setScale(INV * this.art.flashScale * (0.85 + Math.random() * 0.35));
    arm.flash.setVisible(true);
  }

  /** Duvara çarpma gövdeyi çöktürür. */
  impact(strength: number): void {
    this.weight.velocity += this.art.weight.kick * 2.4 * strength;
  }

  /** Kopan bacak kısa bir kütüğe döner (bitler `PARTS.leaper` istasyonlarıyla aynıdır). */
  setParts(mask: number): void {
    this.broken = mask;
    const stub = LEAPER_VIEW.stub;
    for (const leg of this.legs) {
      const gone = (mask & leg.bit) !== 0;
      leg.shin.setVisible(!gone);
      leg.knee.setVisible(!gone);
      leg.ankle.setVisible(!gone);
      leg.foot.setVisible(!gone);
      leg.thigh.setTint(gone ? stub.tint : 0xffffff).setAlpha(gone ? stub.alpha : 1);
    }
  }

  update(frame: TankFrame, deltaMs: number): void {
    // Parçacıklar sahnenin saatiyle akar: duraklatmada (süre 0) emisyon ve ömür birlikte durur.
    this.dust.timeScale = deltaMs > 0 ? 1 : 0;
    const { art } = this;
    const config = this.spec.leaper;
    const view = LEAPER_VIEW;
    this.root.setPosition(frame.x, frame.y).setRotation(frame.hull);

    const effort = clamp01(frame.speed / config.maxSpeed);
    const leaping = frame.boosting;
    const idle =
      frame.speed < view.settle.idleSpeed &&
      Math.abs(frame.angularVelocity) < view.settle.idleTurn &&
      !leaping;
    const settle = 1 - Math.exp(-deltaMs / view.settle.tauMs);
    this.rest += ((idle ? 1 : 0) - this.rest) * settle;
    this.trackLeap(frame, leaping, deltaMs);
    // Havadaki bacak pozuna giriş ve çıkış: toplanma yumuşak, birden değişmez.
    this.air += ((leaping ? 1 : 0) - this.air) * (1 - Math.exp(-deltaMs / view.leap.poseMs));
    const arc = leaping ? Math.sin(Math.PI * clamp01(this.flightMs / this.leapMs)) : 0;

    // Dönüş yükü: açısal hız tavana oranlanır, koşu hızıyla ağırlaşır (havada gövde dönmez).
    const turnLoad =
      clamp01(Math.abs(frame.angularVelocity) / config.maxTurnRate) *
      Math.sign(frame.angularVelocity) *
      (0.35 + 0.65 * effort) *
      (1 - this.air);
    this.turnLoad = turnLoad;
    this.lean.update(-turnLoad * view.turn.shift, deltaMs, view.turn.spring);
    this.twist.update(-turnLoad * view.turn.twist, deltaMs, view.turn.spring);

    const amp = config.strideLength / 4;
    const liftGain = (1 - this.rest) * (1 + this.air);
    const collapse = this.stepLegs(frame, amp, liftGain, idle ? settle : 0, effort);

    this.weight.update(0, deltaMs, view.weightSpring);
    this.weight.value = Phaser.Math.Clamp(this.weight.value, -6, 6);
    const moving = 1 - this.rest;
    // Ağırlık aktarımı: ön ve arka çiftin basış farkı gövdeyi yana yatırır (önde basan sol bacak).
    const strideAngle = ((frame.treadLeft + frame.treadRight) * Math.PI) / config.strideLength;
    const stance = Math.sin(strideAngle);
    const ground = moving * (1 - this.air);
    const shift = stance * view.sway.px * moving * (0.35 + effort * 0.65);
    const limp = collapse * view.stub.sag;
    // Koşuda gövde sekmeyle ileri-geri savrulur ve her basışta (sekmede iki kez) hafifçe yükselir.
    const surge = Math.cos(strideAngle) * view.stride.surge * effort * ground;
    const bob = 1 + Math.cos(strideAngle * 2) * view.stride.bob * effort * ground;
    const stretch = Math.sin(strideAngle * 2) * view.stride.stretch * effort * ground;
    this.body
      .setPosition(
        frame.pitch + surge,
        frame.roll + shift * (1 - this.air) + limp + this.lean.value,
      )
      .setRotation(
        -stance * view.sway.roll * moving * effort * (1 - this.air) +
          collapse * view.stub.roll +
          this.twist.value,
      )
      .setScale(
        (1 + view.leap.rise * arc) * bob * (1 - this.weight.value * art.weight.dip) * (1 + stretch),
        (1 + view.leap.rise * arc) * bob * (1 - this.weight.value * art.weight.dip) * (1 - stretch),
      );

    this.placeHead(frame, deltaMs);
    this.placeTail(turnLoad, strideAngle, effort * ground, deltaMs);
    this.core.update(effort, leaping, deltaMs);
    this.placeArms(frame, deltaMs);
    this.placeFlames(frame, leaping);
    this.liftShadow(arc);
    this.shadow.update(this.shadowSource);
  }

  setPresent(present: boolean): void {
    this.root.setVisible(present);
    if (present) return;
    this.shadow.clear();
    this.air = 0;
    this.flightMs = 0;
    this.wasBoosting = false;
    this.gaze.value = 0;
    this.gaze.velocity = 0;
    this.swing.value = 0;
    this.swing.velocity = 0;
    for (const flame of this.flames) flame.image.setVisible(false);
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
    for (const flame of this.flames) flame.image.setVisible(false);
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
    for (const flame of this.flames) flame.image.destroy();
    this.core.destroy();
    this.dust.destroy();
    this.root.destroy();
  }

  /** Sıçramanın başlangıcı ve inişi: kalkışta çömelme ve toz, inişte çöküş, toz ve pençe izleri. */
  private trackLeap(frame: TankFrame, leaping: boolean, deltaMs: number): void {
    const view = LEAPER_VIEW.leap;
    if (leaping) this.flightMs += deltaMs;
    if (leaping && !this.wasBoosting) {
      this.flightMs = 0;
      this.weight.velocity += this.art.weight.kick * view.landKick;
      this.burst(frame, -this.spec.leaper.halfLength, 0, view.pawsDust);
    } else if (!leaping && this.wasBoosting) {
      this.weight.velocity += this.art.weight.kick * view.landKick * 1.6;
      this.swing.velocity += LEAPER_VIEW.tail.whip * (this.swing.value >= 0 ? -1 : 1);
      this.burst(frame, 0, 0, view.landDust);
      for (const leg of this.legs) this.stamp(frame, leg);
      this.flightMs = 0;
    }
    this.wasBoosting = leaping;
  }

  /** Bacakların hepsini fazdan çözer ve kırık yanların çöküş toplamını döner. */
  private stepLegs(
    frame: TankFrame,
    amp: number,
    liftGain: number,
    settle: number,
    effort: number,
  ): number {
    // `settle` 0 değilse araç boştadır: pençeler en yakın oturma fazına yaklaşır.
    const config = this.spec.leaper;
    const { bound } = LEAPER_VIEW;
    let collapse = 0;
    for (const leg of this.legs) {
      const tread = leg.side === -1 ? frame.treadLeft : frame.treadRight;
      const travelled = Math.abs(tread - leg.lastTread);
      leg.lastTread = tread;
      if (travelled < config.maxSpeed * config.dashMultiplier) leg.ground += travelled;
      const raw =
        tread / config.strideLength +
        (leg.station === REAR ? bound.pairOffset : 0) +
        (leg.side === 1 ? bound.sideLag : 0);
      if (settle > 0) {
        const current = raw + leg.offset;
        const rest = 0.25 + 0.5 * Math.round((current - 0.25) / 0.5);
        leg.offset += (rest - raw - leg.offset) * settle;
      }
      const phase = raw + leg.offset;
      // Dönüşün iç yanındaki bacaklar daha yüksek kalkar: ayak izini kısalan yayın içine toplar.
      const inner = Math.max(0, leg.side * this.turnLoad);
      this.stepLeg(leg, phase, amp, liftGain * (1 + LEAPER_VIEW.turn.lift * inner), frame, effort);
      if ((this.broken & leg.bit) !== 0) {
        const lost = limpCollapse(1, leg.ground, LEAPER_LEGS_PER_SIDE, PARTS.leaper.stumble.stride);
        collapse += leg.side * lost;
      }
    }
    return collapse;
  }

  /** Bir bacağı fazdan çözer: ayak konumu, diz bükümü, kemik gerilmesi ve basış olayları. */
  private stepLeg(
    leg: Leg,
    phase: number,
    amp: number,
    liftGain: number,
    frame: TankFrame,
    effort: number,
  ): void {
    const { art } = this;
    const offset = this.spec.leaper.trackOffset;
    const front = leg.station === FRONT;
    const gait = this.gait;
    gaitOf(phase, amp, gait);
    const hx = front ? art.hips.front : art.hips.rear;
    const hy = leg.side * offset;
    const walkX = hx + (front ? art.gait.footFront : art.gait.footRear) + gait.x;
    // Havada ön pençe öne, arka pençe arkaya uzanır (av atılışı pozu).
    const leapX = hx + (front ? art.gait.footFront + art.gait.leapReach : -art.gait.leapReach);
    const fx = walkX + (leapX - walkX) * this.air;
    const lift = Math.max(gait.lift * liftGain, this.air);
    // Ayaklar gövdenin kaydığı yöne kayar: dış bacak yana açılır, iç bacak kalçasına toplanır.
    const brace = -this.turnLoad * LEAPER_VIEW.turn.brace;
    const fy = leg.side * (offset + art.gait.splay + art.gait.footOut * lift) + brace;
    leg.footX = fx;
    leg.footY = fy;

    const dx = fx - hx;
    const dy = fy - hy;
    const reach = art.thigh.length + art.shin.length;
    const bend = 1 - clamp01(Math.hypot(dx, dy) / reach);
    // Ön bacağın dirseği geriye, arka bacağın dizi ileriye bakar; ikisi de dışa bükülür.
    const shift = (front ? -1 : 1) * art.gait.kneeShift * bend;
    const kx = hx + dx * 0.5 + shift;
    const ky = hy + dy * 0.5 + leg.side * (art.gait.kneeOut * bend + art.gait.kneeLift * lift);
    const gone = (this.broken & leg.bit) !== 0;

    leg.hip.setPosition(hx, hy);
    if (gone) {
      // Kütük: kalçadan dışa kısa bir uyluk; baldır ve ayak yoktur.
      const stub = LEAPER_VIEW.stub;
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
      .setRotation(leg.side * 0.12 * lift)
      .setScale(INV * grow);
    leg.ankle.setScale(INV * grow);

    this.detectPlant(leg, phase, frame, effort);
  }

  /** Yarım döngü çift sayıya geçince (ileri ya da geri yürürken) ayak yere basmıştır; havada basış yoktur. */
  private detectPlant(leg: Leg, phase: number, frame: TankFrame, effort: number): void {
    const half = Math.floor(phase * 2);
    const previous = leg.lastHalf;
    leg.lastHalf = half;
    if (this.air > 0.3 || half === previous || Math.abs(half - previous) > 2) return;
    if (((half % 2) + 2) % 2 !== 0) return;
    this.weight.velocity += this.art.weight.kick * (0.3 + effort * 0.8);
    if (frame.speed < 6) return;
    const { dust, turn } = LEAPER_VIEW;
    // Sert dönüşte dışa basan pençe toz savurur: dönüş yükü ek toz sayısıdır.
    const outer = Math.max(0, -leg.side * this.turnLoad);
    const count = dust.countMin + (dust.countMax - dust.countMin) * effort + turn.dust * outer;
    this.stamp(frame, leg, Math.round(count));
  }

  /** Ayağın dünya konumuna toz ve pençe izi bırakır. */
  private stamp(frame: TankFrame, leg: Leg, dust = 1): void {
    const cos = Math.cos(frame.hull);
    const sin = Math.sin(frame.hull);
    const x = frame.x + leg.footX * cos - leg.footY * sin;
    const y = frame.y + leg.footX * sin + leg.footY * cos;
    this.dust.emitParticleAt(x, y, dust);
    this.footprint?.(x, y, frame.hull, this.art.foot.width / 11.5);
  }

  /** Gövde-yerel `(x, y)` noktasında `count` toz parçası saçar. */
  private burst(frame: TankFrame, x: number, y: number, count: number): void {
    const cos = Math.cos(frame.hull);
    const sin = Math.sin(frame.hull);
    this.dust.emitParticleAt(frame.x + x * cos - y * sin, frame.y + x * sin + y * cos, count);
  }

  /**
   * Kafa nişana bakar (gövde yönünden `yaw` kadar sapar, yay oturur); sıçramada öne uzanır, ağırlık
   * çöküşüyle birlikte hafifçe aşağı iner. Silah yuvaları nişanı zaten sürer; kafa bunu yumuşak izler.
   */
  private placeHead(frame: TankFrame, deltaMs: number): void {
    const { head } = this.art;
    const view = LEAPER_VIEW.head;
    // Kafa gövdeden önce dönüşe bakar: dönüş yükü nişana eklenir (işaret açısal hızınki).
    const wanted = Phaser.Math.Clamp(
      angleDelta(frame.hull, frame.turret) * head.follow +
        this.turnLoad * head.yaw * LEAPER_VIEW.turn.lead,
      -head.yaw,
      head.yaw,
    );
    this.gaze.update(wanted, deltaMs, view.spring);
    const reach = head.reach * this.air;
    const dip = 1 - Math.max(0, this.weight.value) * this.art.weight.dip * view.dip;
    this.head
      .setPosition(head.x + reach, head.y)
      .setRotation(this.gaze.value)
      .setScale(INV * dip);
  }

  /**
   * Kuyruk: dönüşün dışına savrulur, koşuda sekmeyle kıvrılır, havada düz uzanır; inişte gövdeyle gelen
   * ağırlık darbesi yayı kırbaç gibi atar.
   */
  private placeTail(turnLoad: number, strideAngle: number, run: number, deltaMs: number): void {
    const { tail } = this.art;
    const view = LEAPER_VIEW.tail;
    const wag = Math.sin(strideAngle) * view.stride * run;
    const wanted = (turnLoad * 1.4 + wag) * tail.swing * (1 - this.air);
    this.swing.update(wanted, deltaMs, view.spring);
    this.swing.value = Phaser.Math.Clamp(this.swing.value, -tail.swing, tail.swing);
    const rise = view.lift * this.air;
    this.tail.setRotation(Math.PI + this.swing.value).setScale(INV * (1 + rise), INV);
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
      arm.flash.setAlpha(arm.flashMs / LEAPER_VIEW.flashMs);
      arm.flash.setVisible(arm.flashMs > 0);
    }
  }

  /** Sıçramanın ilk anında arka iticiler alev çakar; havada kısık yanar, iniş anında söner. */
  private placeFlames(frame: TankFrame, leaping: boolean): void {
    const { art } = this;
    const { flameMs } = LEAPER_VIEW.leap;
    const burn = leaping ? Math.max(0.3, 1 - this.flightMs / flameMs) : 0;
    const cos = Math.cos(frame.hull);
    const sin = Math.sin(frame.hull);
    for (const [index, flame] of this.flames.entries()) {
      flame.image.setVisible(burn > 0);
      if (burn <= 0) continue;
      const point = art.thrusters[index];
      flame.image
        .setPosition(
          frame.x + point.x * cos - point.y * sin,
          frame.y + point.x * sin + point.y * cos,
        )
        .setRotation(frame.hull + Math.PI)
        .setAlpha(burn)
        .setScale(INV * art.flame * (0.8 + 0.5 * burn));
    }
  }

  /** Gölge sıçramada yerde kalır: ışığın tersine uzaklaşır ve seyrelir. */
  private liftShadow(arc: number): void {
    const view = LEAPER_VIEW;
    const height = view.shadowHeight + view.leap.shadowLift * arc;
    this.shadowOptions.offsetX = LIGHT.x * height;
    this.shadowOptions.offsetY = LIGHT.y * height;
    this.shadowOptions.alpha = view.shadowAlpha * (1 - 0.35 * arc);
  }
}
