import type Phaser from 'phaser';
import { clamp01 } from '@volstudio/core';
import { SPIDER_ART, SPIDER_TELEPORT_UNITS, type PartBox, type SpiderLook } from '@/config/spiders';
import type { WalkerSpec } from '@/config/vehicles';
import { muzzlePose, mountPose, type MuzzlePose } from '@/sim/muzzle';
import { LocomotionReader } from './spider/LocomotionReader';
import { SpiderCannon } from './spider/SpiderCannon';
import { SpiderLegs, lightLocal, type LightLocal } from './spider/SpiderLegs';
import { SpiderMotion, type SpiderPose } from './spider/SpiderMotion';
import { TEXTURE, TEXTURE_SCALE, addSpiderImage } from './textures';
import type { TankFrame, VehicleView } from './VehicleView';

const INV = 1 / TEXTURE_SCALE;

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
  private readonly motion: SpiderMotion;
  private readonly cannons: SpiderCannon[];
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly light: LightLocal = { x: 0, y: 0 };
  private readonly mount: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private readonly tip: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private readonly locomotion: LocomotionReader;

  constructor(
    scene: Phaser.Scene,
    private readonly spec: WalkerSpec,
    private readonly look: SpiderLook,
    lighting: Phaser.GameObjects.Container,
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
    this.thoraxShadow = image('thorax-shadow', look.parts['thorax-shadow']).setAlpha(0.5);
    this.abdomenShadow = image('abdomen-shadow', look.parts['abdomen-shadow']).setAlpha(0.5);
    this.shadowRoot = scene.add
      .container(0, 0, [groundLayer, this.abdomenShadow, this.thoraxShadow])
      .setDepth(SPIDER_ART.depth - 1);

    const legLayer = scene.add.container(0, 0);
    this.legs = new SpiderLegs(scene, look, { ground: groundLayer, legs: legLayer });
    this.abdomen = image('abdomen', look.parts.abdomen);
    this.thorax = image('thorax', look.parts.thorax);
    this.art = scene.add.container(0, 0, [legLayer, this.abdomen, this.thorax]);

    this.cannons = this.spec.armament.mounts.map(
      () => new SpiderCannon(scene, look, lighting, this.shadowRoot),
    );
    this.root = scene.add.container(0, 0, [this.art, ...this.cannons.map((cannon) => cannon.root)]);
    this.root.setDepth(SPIDER_ART.depth);
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

  update(frame: TankFrame, deltaMs: number): void {
    this.root.setPosition(frame.x, frame.y).setRotation(frame.hull);
    this.shadowRoot.setPosition(frame.x, frame.y).setRotation(frame.hull);

    const signals = this.locomotion.signals;
    const fresh = this.locomotion.read(frame, deltaMs);
    lightLocal(frame.hull, this.light);
    const pose = this.motion.update(signals, deltaMs);
    if (fresh) this.legs.reset(signals.x, signals.y, frame.hull, pose, this.light);
    else this.legs.update(signals, pose, deltaMs, this.light);

    this.footfalls(frame.speed);
    this.placeBody(pose);
    this.placeCannons(frame, deltaMs);
  }

  destroy(): void {
    for (const cannon of this.cannons) cannon.destroy();
    this.dust.destroy();
    this.shadowRoot.destroy();
    this.root.destroy();
  }

  /** Bu karede yere basan her ayak, gövdeye kısa bir çökme ve hızla ölçeklenen bir toz tutamı verir. */
  private footfalls(speed: number): void {
    const { dust } = this.look;
    const effort = clamp01(speed / this.spec.walker.maxSpeed);
    const count = Math.round(dust.countMin + (dust.countMax - dust.countMin) * effort);
    this.legs.forEachPlant((x, y) => {
      this.motion.plant(0.4 + 0.6 * effort);
      this.dust.emitParticleAt(x, y, count);
    });
  }

  /** Göğüs, karın ve gölgeleri yerleştirir: parçalar yüksekliğiyle büyür, gölgeleri yüksekliğiyle kayar. */
  private placeBody(pose: SpiderPose): void {
    const { body } = this.look;
    const lift = pose.hipHeight - body.hipHeight;
    const thoraxScale = INV * (1 + lift * SPIDER_ART.perspective);
    const thoraxX = body.thoraxX + pose.leanX;
    this.thorax.setPosition(thoraxX, pose.leanY).setRotation(pose.thoraxYaw).setScale(thoraxScale);

    const pivotX = body.abdomenPivotX + pose.leanX * 0.7;
    const pivotY = pose.leanY * 0.7;
    const abdomenScaleX = INV * pose.abdomenScale;
    this.abdomen
      .setPosition(pivotX, pivotY)
      .setRotation(pose.abdomenYaw)
      .setScale(abdomenScaleX, INV);

    const light = this.light;
    const thoraxHeight = body.thoraxHeight + lift;
    this.thoraxShadow
      .setPosition(thoraxX + light.x * thoraxHeight, pose.leanY + light.y * thoraxHeight)
      .setRotation(pose.thoraxYaw)
      .setScale(thoraxScale);

    const abdomenHeight = body.abdomenHeight + lift;
    this.abdomenShadow
      .setPosition(pivotX + light.x * abdomenHeight, pivotY + light.y * abdomenHeight)
      .setRotation(pose.abdomenYaw)
      .setScale(abdomenScaleX, INV);
  }

  /**
   * Topları yuvalarına yerleştirir. Konum ve açı `sim/muzzle` işlevlerindendir: görünüm kendi
   * geometrisini türetmez, yoksa çizilen namlu ile mermi çıkışı kayardı.
   */
  private placeCannons(frame: TankFrame, deltaMs: number): void {
    const armament = this.spec.armament;
    const light = this.light;
    this.cannons.forEach((cannon, index) => {
      const mount = armament.mounts[index];
      cannon.advance(deltaMs);
      mountPose(frame, armament, index, this.mount);
      const x = frame.pitch + mount.x;
      const y = frame.roll + mount.y;
      const angle = this.mount.angle - frame.hull;
      cannon.root.setPosition(x, y).setRotation(angle);
      cannon.shadowAt(x, y, angle, light.x, light.y);
      muzzlePose(frame, armament, index, this.tip, mount.reach + cannon.recoilWorld);
      cannon.flashAt(deltaMs, this.tip.x, this.tip.y, this.tip.angle);
    });
  }
}
