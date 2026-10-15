import Phaser from 'phaser';
import { GhostTrail, clamp01, poseSourceOf, type PoseSourceNode } from '@volstudio/core';
import { SPIDER_ART, SPIDER_TELEPORT_UNITS, type PartBox, type SpiderLook } from '@/config/spiders';
import type { WalkerSpec } from '@/config/vehicles';
import { LEGS_PER_SIDE, limpCollapse, lostLegs } from '@/sim/chassis/parts';
import { muzzlePose, mountPose, type MuzzlePose } from '@/sim/muzzle';
import { CorePulse } from './CorePulse';
import { Feelers } from './Feelers';
import { LocomotionReader } from './spider/LocomotionReader';
import { SpiderCannon } from './spider/SpiderCannon';
import { SpiderLegs, lightLocal, type LightLocal } from './spider/SpiderLegs';
import { SpiderMotion, type SpiderPose } from './spider/SpiderMotion';
import { FX } from '@/config/fx';
import { TEXTURE, TEXTURE_SCALE, addSpiderImage } from './textures';
import type { TankFrame, VehicleView } from './VehicleView';
import { WATER_VIEW } from '@/config/waterView';
import { setCharred, sinkRoot } from './charring';

/**
 * Yere basan ayağın izi: dünya konumu, gövde yönü ve boy ölçeği. `width` verilirse bu bir bot izidir
 * (mech): `scale` izin boyu, `width` eni (dünya birimi); verilmezse pençe deliğidir.
 */
export type FootPrintSink = (
  x: number,
  y: number,
  angle: number,
  scale: number,
  width?: number,
) => void;

const INV = 1 / TEXTURE_SCALE;
/** Gövdenin kırık yana en çok çökmesi (dünya birimi, kırık yan tam) ve çökmenin oturma süresi (ms). */
const SAG = { px: 3.2, settleMs: 180 } as const;
/**
 * Eksik bacaklı yanın her adımdaki çöküşü gövdeye yansır (`limpCollapse`, simülasyondaki tökezleme ile
 * aynı faz): kalça çöker, gövde o yana yatar ve göğüs kısa bir kıvrılır. Değerler dünya birimi ve radyandır.
 */
const LIMP = { dipPx: 7, swayPx: 8, yaw: 0.2, baseSeverity: 0.6 } as const;

/**
 * Sekiz bacaklı yürüyücülerin (Arachnid, Widow) sahne karşılığı: tamamen el çizimi SVG parçalardan
 * kurulur ve iki araç aynı sınıfı kullanır; fark `SpiderLook`tadır (parçalar, kalça yerleşimi, yürüyüş,
 * hareket, top). Çizim sırası SABİTTİR ve bacakları gövdenin altında tutar: zemin gölgeleri, bacaklar,
 * karın, göğüs, toplar. Bacaklar iki kemikli ve gerçek yüksekliktedir (`SpiderLegs`); gövde ayaklara
 * göre yaslanır, çöker, karnı geriden sallanır (`SpiderMotion`). Gölge her parçanın kendi yüksekliğiyle
 * orantılı kayar. Toplar yuvalarında poza göre döner; yuva açıları ve namlu uçları `sim/muzzle` ile
 * aynıdır, yani çizilen namlu atışın çıktığı yeri gösterir.
 */
export class SpiderView implements VehicleView {
  readonly root: Phaser.GameObjects.Container;
  private readonly shadowRoot: Phaser.GameObjects.Container;
  private readonly art: Phaser.GameObjects.Container;
  private readonly abdomen: Phaser.GameObjects.Image;
  private readonly abdomenShadow: Phaser.GameObjects.Image;
  private readonly thorax: Phaser.GameObjects.Image;
  private readonly thoraxShadow: Phaser.GameObjects.Image;
  private readonly legs: SpiderLegs;
  private readonly core: CorePulse;
  private readonly feelers: Feelers;
  private readonly motion: SpiderMotion;
  private readonly cannons: SpiderCannon[];
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly light: LightLocal = { x: 0, y: 0 };
  private readonly mount: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private readonly tip: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private readonly locomotion: LocomotionReader;
  private readonly ghosts: GhostTrail;
  private readonly ghostSource: PoseSourceNode;
  private dashing = false;
  private elapsedMs = 0;
  private sag = 0;
  private sagTarget = 0;
  private lostLeft = 0;
  private lostRight = 0;
  /** O karenin tökezleme yatışı (dünya birimi): `sag` yavaş oturur, bu adım hızında salınır. */
  private limpSway = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly spec: WalkerSpec,
    private readonly look: SpiderLook,
    lighting: Phaser.GameObjects.Container,
    private readonly footprint?: FootPrintSink,
  ) {
    this.motion = new SpiderMotion(look);
    this.locomotion = new LocomotionReader({
      worldToArt: 1,
      dashSpring: look.motion.dashSpring,
      impactFalloffMs: look.motion.impactFalloffMs,
      teleportUnits: SPIDER_TELEPORT_UNITS,
    });
    const image = (part: keyof SpiderLook['parts'], box: PartBox): Phaser.GameObjects.Image =>
      addSpiderImage(scene, look.id, part)
        .setOrigin(box.pivotX / box.width, box.pivotY / box.height)
        .setScale(INV);

    // Gölge katmanı: dünyada bacağın altında; ışık dünyada sabit olduğundan gövdeyle döner ve kaymayı
    // her karede gövde-yerel yöne çevirir.
    const groundLayer = scene.add.container(0, 0);
    this.thoraxShadow = image('thorax-shadow', look.parts['thorax-shadow']).setAlpha(
      SPIDER_ART.shadowAlpha,
    );
    this.abdomenShadow = image('abdomen-shadow', look.parts['abdomen-shadow']).setAlpha(
      SPIDER_ART.shadowAlpha,
    );
    this.shadowRoot = scene.add
      .container(0, 0, [groundLayer, this.abdomenShadow, this.thoraxShadow])
      .setDepth(SPIDER_ART.depth - 1);

    const legLayer = scene.add.container(0, 0);
    this.legs = new SpiderLegs(scene, look, { ground: groundLayer, legs: legLayer });
    this.abdomen = image('abdomen', look.parts.abdomen);
    this.thorax = image('thorax', look.parts.thorax);
    // Çekirdek ve duyargalar göğsün üstündedir; toplar onlardan da yukarıdadır.
    const { sensors } = look;
    this.core = new CorePulse(scene, sensors.core.scale, sensors.core.tint);
    this.feelers = new Feelers(scene, sensors.feelers);
    this.art = scene.add.container(0, 0, [
      legLayer,
      this.abdomen,
      this.thorax,
      this.core.image,
      ...this.feelers.objects,
    ]);

    this.cannons = this.spec.armament.mounts.map(
      () => new SpiderCannon(scene, look, lighting, this.shadowRoot),
    );
    this.root = scene.add.container(0, 0, [this.art, ...this.cannons.map((cannon) => cannon.root)]);
    this.root.setDepth(SPIDER_ART.depth);
    // Hayalet gövdenin ve bacakların o anki gerçek pozunu taşır (CORE `GhostTrail`); dünyada kalıp söner.
    this.ghostSource = poseSourceOf([this.art]);
    this.ghosts = new GhostTrail(scene, {
      maxGhosts: look.ghost.count,
      lifespanMs: look.ghost.lifeMs,
      captureIntervalMs: look.ghost.intervalMs,
      startAlpha: look.ghost.alpha,
      tint: look.ghost.tint,
      blendMode: Phaser.BlendModes.ADD,
      depth: SPIDER_ART.depth - 0.5,
    });
    this.dust = scene.add
      .particles(0, 0, TEXTURE.spark, look.dust.emitter)
      .setDepth(look.dust.depth);
  }

  fire(mount: number): void {
    this.cannons[mount]?.fire();
  }

  impact(strength: number): void {
    this.locomotion.impact(strength);
  }

  setParts(mask: number): void {
    this.legs.setBroken(mask);
    this.lostLeft = lostLegs(mask, 0);
    this.lostRight = lostLegs(mask, 1);
    this.sagTarget = ((lostLegs(mask, 1) - lostLegs(mask, 0)) / LEGS_PER_SIDE) * SAG.px;
  }

  update(frame: TankFrame, deltaMs: number): void {
    this.root.setPosition(frame.x, frame.y).setRotation(frame.hull);
    this.shadowRoot.setPosition(frame.x, frame.y).setRotation(frame.hull);

    const signals = this.locomotion.signals;
    const fresh = this.locomotion.read(frame, deltaMs);
    lightLocal(frame.hull, this.light);
    this.sag += (this.sagTarget - this.sag) * (1 - Math.exp(-deltaMs / SAG.settleMs));
    const pose = this.motion.update(signals, deltaMs);
    this.stumble(frame, pose);
    this.legs.setSag(this.sag + this.limpSway);
    if (fresh) this.legs.reset(signals.x, signals.y, frame.hull, pose, this.light);
    else this.legs.update(signals, pose, deltaMs, this.light);

    this.elapsedMs += deltaMs;
    this.ghosts.update(deltaMs);
    if (signals.dash01 > 0.35) this.ghosts.capture(this.ghostSource);
    this.huntBurst(frame.boosting);
    this.footfalls(frame.speed, frame.hull);
    this.placeBody(pose);
    this.animateSensors(frame, pose, deltaMs);
    this.placeCannons(frame, deltaMs, pose);
  }

  /**
   * Eksik bacaklı yan adım döngüsünde çöker: kalça iner, gövde o yana yatar. Faz, simülasyonun
   * yürüyüş yolundan (`treadLeft/Right`) türer; sağlam yürüyücüde bu işlev hiçbir şey değiştirmez.
   */
  private stumble(frame: TankFrame, pose: SpiderPose): void {
    if (this.lostLeft + this.lostRight === 0) {
      this.limpSway = 0;
      return;
    }
    // Tek bacak kaybı da net okunur: şiddet kayıpla `baseSeverity`den tam çöküşe çıkar.
    const severity = (lost: number): number =>
      lost === 0 ? 0 : LIMP.baseSeverity + (1 - LIMP.baseSeverity) * (lost / LEGS_PER_SIDE);
    const left = severity(this.lostLeft) * limpCollapse(LEGS_PER_SIDE, Math.abs(frame.treadLeft));
    const right =
      severity(this.lostRight) * limpCollapse(LEGS_PER_SIDE, Math.abs(frame.treadRight));
    const moving = clamp01(frame.speed / this.spec.walker.maxSpeed);
    pose.hipHeight -= LIMP.dipPx * (left + right) * moving;
    pose.thoraxYaw += LIMP.yaw * (right - left) * moving;
    this.limpSway = LIMP.swayPx * (right - left) * moving;
  }

  setPresent(present: boolean): void {
    this.root.setVisible(present);
    this.shadowRoot.setVisible(present);
    if (present) return;
    this.ghosts.clear();
    for (const cannon of this.cannons) cannon.silence();
    this.dashing = false;
  }

  setWrecked(wrecked: boolean): void {
    setCharred(this.root, wrecked);
    if (!wrecked) return;
    this.ghosts.clear();
    for (const cannon of this.cannons) cannon.silence();
    this.dashing = false;
  }

  sink(progress: number): void {
    sinkRoot(this.root, progress, WATER_VIEW.sink.scale);
    this.shadowRoot.setAlpha(1 - progress * progress);
  }

  destroy(): void {
    this.ghosts.destroy();
    for (const cannon of this.cannons) cannon.destroy();
    this.core.destroy();
    this.feelers.destroy();
    this.dust.destroy();
    this.shadowRoot.destroy();
    this.root.destroy();
  }

  /** Av atılışının başladığı karede arka ayakların altından bir toz patlaması fırlar. */
  private huntBurst(dashing: boolean): void {
    if (dashing && !this.dashing) {
      const { dust } = this.look;
      this.legs.forEachFoot((x, y) => this.dust.emitParticleAt(x, y, dust.countMax * 2));
    }
    this.dashing = dashing;
  }

  /** Bu karede yere basan her ayak, gövdeye kısa bir çökme ve hızla ölçeklenen bir toz tutamı verir. */
  private footfalls(speed: number, hull: number): void {
    const { dust } = this.look;
    const effort = clamp01(speed / this.spec.walker.maxSpeed);
    const scale = this.spec.walker.halfWidth / FX.feet.refHalfWidth;
    const count = Math.round(dust.countMin + (dust.countMax - dust.countMin) * effort);
    this.legs.forEachPlant((x, y) => {
      this.motion.plant(0.4 + 0.6 * effort);
      this.dust.emitParticleAt(x, y, count);
      this.footprint?.(x, y, hull, scale);
    });
  }

  /** Göğüs, karın ve gölgeleri yerleştirir: parçalar yüksekliğiyle büyür, gölgeleri yüksekliğiyle kayar. */
  private placeBody(pose: SpiderPose): void {
    const { body } = this.look;
    const lift = pose.hipHeight - body.hipHeight;
    const thoraxScale = INV * (1 + lift * SPIDER_ART.perspective);
    const leanY = pose.leanY + this.sag + this.limpSway;
    const thoraxX = body.thoraxX + pose.leanX;
    this.thorax.setPosition(thoraxX, leanY).setRotation(pose.thoraxYaw).setScale(thoraxScale);

    const pivotX = body.abdomenPivotX + pose.leanX * 0.7;
    const pivotY = leanY * 0.7;
    const abdomenScaleX = INV * pose.abdomenScale;
    this.abdomen
      .setPosition(pivotX, pivotY)
      .setRotation(pose.abdomenYaw)
      .setScale(abdomenScaleX, INV);

    const light = this.light;
    const thoraxHeight = body.thoraxHeight + lift;
    this.thoraxShadow
      .setPosition(thoraxX + light.x * thoraxHeight, leanY + light.y * thoraxHeight)
      .setRotation(pose.thoraxYaw)
      .setScale(thoraxScale);

    const abdomenHeight = body.abdomenHeight + lift;
    this.abdomenShadow
      .setPosition(pivotX + light.x * abdomenHeight, pivotY + light.y * abdomenHeight)
      .setRotation(pose.abdomenYaw)
      .setScale(abdomenScaleX, INV);
  }

  /**
   * Çekirdek göğsün lensinde atar ve duyargalar göğüse bağlı yaylanır: ikisi de göğüsle birlikte yaslanır,
   * döner ve perspektifle büyür. Hız ve atılım nabzı sıklaştırır, dönüş duyargaları geride sürükler.
   */
  private animateSensors(frame: TankFrame, pose: SpiderPose, deltaMs: number): void {
    const { body, sensors } = this.look;
    const size = 1 + (pose.hipHeight - body.hipHeight) * SPIDER_ART.perspective;
    const x = body.thoraxX + pose.leanX;
    const y = pose.leanY + this.sag + this.limpSway;
    const cos = Math.cos(pose.thoraxYaw);
    const sin = Math.sin(pose.thoraxYaw);
    const { core } = sensors;
    this.core.place(
      x + (core.x * cos - core.y * sin) * size,
      y + (core.x * sin + core.y * cos) * size,
    );
    const effort = clamp01(frame.speed / this.spec.walker.maxSpeed);
    this.core.update(effort, frame.boosting, deltaMs, size);
    this.feelers.update(
      x,
      y,
      pose.thoraxYaw,
      size,
      { angularVelocity: frame.angularVelocity, effort },
      this.elapsedMs,
      deltaMs,
    );
  }

  /**
   * Topları yuvalarına yerleştirir. Konum ve açı `sim/muzzle` işlevlerindendir: görünüm kendi
   * geometrisini türetmez, yoksa çizilen namlu ile mermi çıkışı kayardı.
   */
  private placeCannons(frame: TankFrame, deltaMs: number, pose: SpiderPose): void {
    const lift = pose.hipHeight - this.look.body.hipHeight;
    const leanX = pose.leanX;
    const leanY = pose.leanY + this.sag + this.limpSway;
    const armament = this.spec.armament;
    const light = this.light;
    this.cannons.forEach((cannon, index) => {
      const mount = armament.mounts[index];
      cannon.advance(deltaMs);
      mountPose(frame, armament, index, this.mount);
      // Toplar göğüsle birlikte yaslanır ve çöker; yalnız ağız parlaması simülasyondaki gerçek çıkışta kalır.
      const x = frame.pitch + mount.x + leanX;
      const y = frame.roll + mount.y + leanY;
      const angle = this.mount.angle - frame.hull;
      cannon.root.setPosition(x, y).setRotation(angle);
      cannon.shadowAt(x, y, angle, light.x, light.y, lift);
      muzzlePose(frame, armament, index, this.tip, mount.reach + cannon.recoilWorld);
      cannon.flashAt(deltaMs, this.tip.x, this.tip.y, this.tip.angle);
    });
  }
}
