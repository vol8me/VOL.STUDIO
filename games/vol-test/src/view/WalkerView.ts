import type Phaser from 'phaser';
import {
  PoseShadow,
  assembleRig,
  clamp01,
  poseSourceOf,
  type AssembledRig,
  type PoseSourceNode,
} from '@volstudio/core';
import { Spring1D } from '@volstudio/core/math';
import { ARACHNID_RIG, arachnidMetadata } from '@/config/rigAssets';
import type { WalkerSpec } from '@/config/vehicles';
import { RIG_FACING_OFFSET_RAD } from '@/config/walkerRig';
import {
  ART_TO_WORLD,
  BODY_MOTION,
  FOOTFALL_DUST,
  TELEPORT_UNITS,
  WALKER_ART,
  WORLD_TO_ART,
} from '@/config/walkerView';
import { muzzlePose, mountPose, type MuzzlePose } from '@/sim/muzzle';
import { ArachnidLegs } from './walker/ArachnidLegs';
import { ArachnidMotion } from './walker/ArachnidMotion';
import { PlasmaCannon } from './walker/PlasmaCannon';
import { prepareArachnidRig } from './walker/arachnidRig';
import type { LocomotionSignals } from './walker/signals';
import { TEXTURE } from './textures';
import type { TankFrame, VehicleView } from './VehicleView';

/** Simülasyon adımı: ivme, hızın değiştiği iki kare arasından okunur ve bundan kısa süreye bölünmez. */
const SIM_STEP_SECONDS = 1 / 60;

/**
 * Altı bacaklı yürüyen aracın sahne karşılığı. Gövde ve uzuvlar dışa aktarılmış rig'dir
 * (`ARACHNID_RIG`): ayaklar dünyada sabitlenir, gövde ilerledikçe adım atar ve her uzvun açısı
 * ayağın nerede durduğundan ters kinematikle çıkar. Kabuk, hızdan ve ivmeden türeyen ikincil
 * harekete (yaslanma, çömelme, atılım gerilmesi, bakış) uyar. Üç plazma topu kendi yuvasında
 * poza göre döner; yuva açıları ve namlu uçları `sim/muzzle` ile aynıdır, yani çizilen namlu
 * atışın çıktığı yeri gösterir.
 */
export class WalkerView implements VehicleView {
  readonly root: Phaser.GameObjects.Container;
  private readonly assembled: AssembledRig;
  private readonly legs: ArachnidLegs;
  private readonly motion: ArachnidMotion;
  private readonly cannons: PlasmaCannon[];
  private readonly shadow: PoseShadow;
  private readonly shadowSource: PoseSourceNode;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly dashSpring = new Spring1D();
  private readonly mount: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private readonly tip: MuzzlePose = { x: 0, y: 0, angle: 0 };
  /** Uzuv ve kabuk sürücülerinin ödünç okuduğu kare sinyalleri; her karede yeniden yazılır. */
  private readonly signals: LocomotionSignals = {
    x: 0,
    y: 0,
    velX: 0,
    velY: 0,
    speed: 0,
    accelX: 0,
    accelY: 0,
    travelHeadingRad: 0,
    facingHeadingRad: 0,
    turnRateRadPerSec: 0,
    dash01: 0,
    impact01: 0,
  };
  private placed = false;
  private lastX = 0;
  private lastY = 0;
  private lastVx = 0;
  private lastVy = 0;
  private sinceVelocityChangeMs = 0;
  private impact01 = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly spec: WalkerSpec,
    lighting: Phaser.GameObjects.Container,
  ) {
    this.assembled = assembleRig(scene, ARACHNID_RIG);
    const rig = prepareArachnidRig(arachnidMetadata, this.assembled);
    this.assembled.container.setScale(ART_TO_WORLD).setRotation(RIG_FACING_OFFSET_RAD);

    this.legs = new ArachnidLegs(rig);
    this.motion = new ArachnidMotion(rig);
    this.cannons = this.spec.armament.mounts.map(() => new PlasmaCannon(scene, lighting));

    this.root = scene.add.container(0, 0, [
      this.assembled.container,
      ...this.cannons.map((cannon) => cannon.root),
    ]);
    this.root.setDepth(WALKER_ART.depth);
    this.shadow = new PoseShadow(scene, WALKER_ART.shadow);
    this.shadowSource = poseSourceOf([
      this.assembled.container,
      ...this.cannons.map((cannon) => cannon.solid),
    ]);
    this.dust = scene.add
      .particles(0, 0, TEXTURE.spark, FOOTFALL_DUST.emitter)
      .setDepth(FOOTFALL_DUST.depth);
  }

  fire(mount: number): void {
    this.cannons[mount]?.fire();
  }

  impact(strength: number): void {
    this.impact01 = Math.max(this.impact01, clamp01(strength));
  }

  update(frame: TankFrame, deltaMs: number): void {
    this.root.setPosition(frame.x, frame.y).setRotation(frame.hull);

    const teleported =
      this.placed && Math.hypot(frame.x - this.lastX, frame.y - this.lastY) > TELEPORT_UNITS;
    this.lastX = frame.x;
    this.lastY = frame.y;
    this.readSignals(frame, deltaMs, teleported);
    if (!this.placed || teleported) {
      this.legs.reset(this.signals.x, this.signals.y, frame.hull);
      this.placed = true;
    }

    const pose = this.motion.update(this.signals, deltaMs);
    this.legs.update(this.signals, pose, deltaMs);
    this.footfalls(frame.speed);
    this.placeCannons(frame, deltaMs);
    this.shadow.update(this.shadowSource);
  }

  destroy(): void {
    this.shadow.destroy();
    this.dust.destroy();
    for (const cannon of this.cannons) cannon.destroy();
    this.root.destroy();
  }

  /**
   * Kare sinyallerini simülasyon durumundan türetir. Hız yalnız simülasyon adımında değişir;
   * ivme de değiştiği anda iki değişim arasındaki süreye bölünerek okunur ve bir sonrakine kadar
   * tutulur. Her çizim karesinde fark almak, yüksek kare hızında adımlar arasında sıfır, adım
   * karesinde ise gerçek ivmenin birkaç katı üretirdi.
   */
  private readSignals(frame: TankFrame, deltaMs: number, teleported: boolean): void {
    const signals = this.signals;
    const velX = frame.vx * WORLD_TO_ART;
    const velY = frame.vy * WORLD_TO_ART;
    this.sinceVelocityChangeMs += deltaMs;
    // İlk kare (ya da ışınlanma) yürüyen bir araçta sahte bir ivme sıçraması üretmesin.
    if (!this.placed || teleported) {
      this.lastVx = velX;
      this.lastVy = velY;
      signals.accelX = 0;
      signals.accelY = 0;
      this.sinceVelocityChangeMs = 0;
    }

    if (velX !== this.lastVx || velY !== this.lastVy) {
      const span = Math.max(this.sinceVelocityChangeMs / 1000, SIM_STEP_SECONDS);
      signals.accelX = (velX - this.lastVx) / span;
      signals.accelY = (velY - this.lastVy) / span;
      this.lastVx = velX;
      this.lastVy = velY;
      this.sinceVelocityChangeMs = 0;
    }

    signals.x = frame.x * WORLD_TO_ART;
    signals.y = frame.y * WORLD_TO_ART;
    signals.velX = velX;
    signals.velY = velY;
    signals.speed = Math.hypot(velX, velY);
    signals.facingHeadingRad = frame.hull;
    // Gövde durunca hızın yönü anlamsızdır; bakış yönüne düşülür (bkz. `LocomotionSignals`).
    signals.travelHeadingRad = signals.speed > 1e-3 ? Math.atan2(velY, velX) : frame.hull;
    signals.turnRateRadPerSec = frame.angularVelocity;
    signals.dash01 = clamp01(
      this.dashSpring.update(frame.boosting ? 1 : 0, deltaMs, BODY_MOTION.dashSpring),
    );
    // Sönme kare başında alınır: bu karede kurulan yankı anında sönmez.
    this.impact01 = Math.max(0, this.impact01 - deltaMs / BODY_MOTION.impactFalloffMs);
    signals.impact01 = this.impact01;
  }

  /** Bu karede yere basan her ayak, hızla ölçeklenen bir toz tutamı bırakır. */
  private footfalls(speed: number): void {
    const effort = clamp01(speed / this.spec.walker.maxSpeed);
    const count = Math.round(
      FOOTFALL_DUST.countMin + (FOOTFALL_DUST.countMax - FOOTFALL_DUST.countMin) * effort,
    );
    this.legs.forEachPlant((x, y) =>
      this.dust.emitParticleAt(x * ART_TO_WORLD, y * ART_TO_WORLD, count),
    );
  }

  /**
   * Topları yuvalarına yerleştirir. Konum ve açı `sim/muzzle` işlevlerindendir: görünüm kendi
   * geometrisini türetmez, yoksa çizilen namlu ile mermi çıkışı kayardı.
   */
  private placeCannons(frame: TankFrame, deltaMs: number): void {
    const armament = this.spec.armament;
    this.cannons.forEach((cannon, index) => {
      const mount = armament.mounts[index];
      cannon.advance(deltaMs);
      mountPose(frame, armament, index, this.mount);
      cannon.root
        .setPosition(frame.pitch + mount.x, frame.roll + mount.y)
        .setRotation(this.mount.angle - frame.hull);
      muzzlePose(frame, armament, index, this.tip, mount.reach + cannon.recoilWorld);
      cannon.flashAt(deltaMs, this.tip.x, this.tip.y, this.tip.angle);
    });
  }
}
