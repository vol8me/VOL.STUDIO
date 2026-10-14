import Phaser from 'phaser';
import { poseSourceOf, PoseShadow, clamp01, type PoseSourceNode } from '@volstudio/core';
import { Spring1D } from '@volstudio/core/math';
import { SHOT_LOOK } from '@/config/fx';
import { HOVER_ART, HOVER_VIEW, type HoverArt } from '@/config/hoverView';
import { LIGHT } from '@/config/light';
import type { HoverSpec } from '@/config/vehicles';
import { TRACK_LEFT, TRACK_RIGHT } from '@/sim/chassis/parts';
import { muzzlePose, type MuzzlePose } from '@/sim/muzzle';
import { TEXTURE, TEXTURE_SCALE, addHoverImage } from './textures';
import type { TankFrame, VehicleView } from './VehicleView';

const INV = 1 / TEXTURE_SCALE;
/** Işık dokusu (`TEXTURE.blast`) 64 px'tir. */
const GLOW_TEXTURE_PX = 64;
/** Kopan iticinin kütüğü: koyu, kısa ve yarı saydam. */
const STUB = { tint: 0x2b2326, length: 0.55, alpha: 0.9 } as const;

/**
 * Süzülen aracın (Manta) sahne karşılığı: hepsi el çizimi SVG parça. Çizim sırası: zeminde iki yan
 * itici ve üstlerinde dönen kaldırma pervaneleri, onların üstünde gövde ve taret. Gövde süzüldüğü için
 * nefes alır (yavaş ölçek salınımı) ve süspansiyonun yunuslama/yalpasıyla kayar; iticiler bundan daha az
 * kayar. Gölge tanktan çok daha yüksekten düşer, yani gövdeden belirgin ayrılır ve araç zeminde yüzer
 * görünür. Kırık itici kısalmış koyu bir kütük olarak kalır, pervanesi durur. Ağız parlaması
 * `sim/muzzle` ucundadır: çizilen namlu atışın çıktığı yeri gösterir.
 */
export class HoverView implements VehicleView {
  readonly root: Phaser.GameObjects.Container;
  private readonly shadow: PoseShadow;
  private readonly shadowSource: PoseSourceNode;
  private readonly art: HoverArt;
  private readonly body: Phaser.GameObjects.Container;
  private readonly turretRig: Phaser.GameObjects.Container;
  private readonly turret: Phaser.GameObjects.Image;
  private readonly pods: Phaser.GameObjects.Image[];
  private readonly fans: Phaser.GameObjects.Image[];
  private readonly nozzles: Phaser.GameObjects.Image[];
  private readonly flash: Phaser.GameObjects.Image;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly barrel = new Spring1D();
  private readonly tip: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private broken = 0;
  private flashMs = 0;
  private elapsedMs = 0;
  private fanAngle = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly spec: HoverSpec,
    lighting: Phaser.GameObjects.Container,
  ) {
    const art = HOVER_ART[spec.id];
    this.art = art;
    const offset = spec.hover.trackOffset;
    this.shadow = new PoseShadow(scene, {
      offsetX: LIGHT.x * HOVER_VIEW.shadowHeight,
      offsetY: LIGHT.y * HOVER_VIEW.shadowHeight,
      alpha: HOVER_VIEW.shadowAlpha,
      depth: 9,
    });

    // Sol yan (−y) sağın aynasıdır: dikey ölçek eksiye döner, ışık çizimi yan boyunca tutarlı kalır.
    this.pods = [-1, 1].map((side) =>
      addHoverImage(scene, spec.id, 'pod', art.pod.x, side * offset).setScale(INV, side * INV),
    );
    this.fans = [-1, 1].map((side) =>
      addHoverImage(scene, spec.id, 'fan', art.pod.x + art.fan.x, side * offset).setScale(INV, INV),
    );
    this.nozzles = [-1, 1].map((side) =>
      scene.add
        .image(art.nozzle.x, side * offset, TEXTURE.blast)
        .setScale((art.nozzle.scale * 24) / GLOW_TEXTURE_PX)
        .setTint(art.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.3),
    );

    const hull = addHoverImage(scene, spec.id, 'hull').setScale(INV);
    this.turret = addHoverImage(scene, spec.id, 'turret')
      .setOrigin(art.turret.pivotX / art.turret.width, 0.5)
      .setScale(INV);
    this.turretRig = scene.add.container(0, 0, [this.turret]);
    this.body = scene.add.container(0, 0, [hull, this.turretRig]);
    this.root = scene.add.container(0, 0, [...this.pods, ...this.fans, ...this.nozzles, this.body]);
    this.root.setDepth(HOVER_VIEW.depth);
    this.shadowSource = poseSourceOf([...this.pods, hull, this.turret]);

    this.flash = scene.add
      .image(0, 0, TEXTURE.flash)
      .setTint(SHOT_LOOK[spec.armament.weapon.style].glow)
      .setOrigin(0, 0.5)
      .setScale(INV * art.flashScale)
      .setVisible(false);
    lighting.add(this.flash);
    this.dust = scene.add
      .particles(0, 0, TEXTURE.spark, HOVER_VIEW.dust.emitter)
      .setDepth(HOVER_VIEW.dust.depth);
  }

  /** Atışta namlu geri teper ve ağız parlaması yanar. */
  fire(): void {
    this.barrel.velocity += this.art.barrel.kick;
    this.flashMs = HOVER_VIEW.flashMs;
    this.flash.setScale(INV * this.art.flashScale * (0.85 + Math.random() * 0.35));
    this.flash.setVisible(true);
  }

  /** Kopan iticinin pervanesi durur ve itici kısa bir kütüğe döner (bit 0 sol, bit 1 sağ). */
  setParts(mask: number): void {
    this.broken = mask;
    [TRACK_LEFT, TRACK_RIGHT].forEach((bit, index) => {
      const gone = (mask & bit) !== 0;
      const side = index === 0 ? -1 : 1;
      this.pods[index]
        .setScale(INV * (gone ? STUB.length : 1), side * INV)
        .setTint(gone ? STUB.tint : 0xffffff)
        .setAlpha(gone ? STUB.alpha : 1);
      this.fans[index].setVisible(!gone);
    });
  }

  update(frame: TankFrame, deltaMs: number): void {
    const { art } = this;
    const hover = this.spec.hover;
    this.elapsedMs += deltaMs;
    this.root.setPosition(frame.x, frame.y).setRotation(frame.hull);

    this.barrel.update(0, deltaMs, art.barrel);
    this.barrel.value = Phaser.Math.Clamp(this.barrel.value, -art.barrel.max, 0);
    const effort = clamp01(frame.speed / hover.maxSpeed);
    const bob = Math.sin((this.elapsedMs / HOVER_VIEW.bob.periodMs) * Math.PI * 2);
    this.body
      .setPosition(frame.pitch, frame.roll)
      .setScale(1 + bob * HOVER_VIEW.bob.amount + (frame.boosting ? HOVER_VIEW.bob.boost : 0));
    this.turretRig.setRotation(frame.turret - frame.hull);
    this.turret.setX(this.barrel.value);

    this.spinFans(frame, effort, deltaMs);
    this.glowNozzles(frame, effort);
    this.placeFlash(frame, deltaMs);
    this.exhaustDust(frame);
    this.shadow.update(this.shadowSource);
  }

  setPresent(present: boolean): void {
    this.root.setVisible(present);
    if (present) return;
    this.shadow.clear();
    this.flashMs = 0;
    this.barrel.value = 0;
    this.barrel.velocity = 0;
    this.flash.setVisible(false);
  }

  destroy(): void {
    this.shadow.destroy();
    this.flash.destroy();
    this.dust.destroy();
    this.root.destroy();
  }

  /** İticiler gövdeden az sarsılır; pervane hız ve atılımla hızlanır, kırık yanın pervanesi durur. */
  private spinFans(frame: TankFrame, effort: number, deltaMs: number): void {
    const { fan } = HOVER_VIEW;
    const rate = frame.boosting ? fan.boost : fan.idle + frame.speed * fan.perSpeed;
    this.fanAngle += rate * (deltaMs / 1000);
    const offset = this.spec.hover.trackOffset;
    for (let index = 0; index < 2; index++) {
      const side = index === 0 ? -1 : 1;
      const x = this.art.pod.x + frame.pitch * HOVER_VIEW.podFollow;
      const y = side * offset + frame.roll * HOVER_VIEW.podFollow;
      this.pods[index].setPosition(x, y);
      this.fans[index]
        .setPosition(x + this.art.fan.x, y)
        .setRotation(this.fanAngle * (side === 1 ? 1 : -1))
        .setAlpha(0.78 + effort * 0.2);
    }
  }

  /** Arka lülelerin ışığı hızla ve atılımla parlar; kırık itici sönüktür. */
  private glowNozzles(frame: TankFrame, effort: number): void {
    const offset = this.spec.hover.trackOffset;
    for (let index = 0; index < 2; index++) {
      const side = index === 0 ? -1 : 1;
      const gone = (this.broken & (index === 0 ? TRACK_LEFT : TRACK_RIGHT)) !== 0;
      const nozzle = this.nozzles[index];
      nozzle.setPosition(
        this.art.nozzle.x + frame.pitch * HOVER_VIEW.podFollow,
        side * offset + frame.roll * HOVER_VIEW.podFollow,
      );
      const flare = frame.boosting ? 0.5 : 0;
      nozzle.setAlpha(gone ? 0 : 0.28 + effort * 0.32 + flare);
      nozzle.setScale(
        ((this.art.nozzle.scale * 24) / GLOW_TEXTURE_PX) * (1 + effort * 0.5 + flare),
      );
    }
  }

  private placeFlash(frame: TankFrame, deltaMs: number): void {
    const armament = this.spec.armament;
    const tip = muzzlePose(
      frame,
      armament,
      0,
      this.tip,
      armament.mounts[0].reach + this.barrel.value,
    );
    this.flash.setPosition(tip.x, tip.y).setRotation(tip.angle);
    if (this.flashMs <= 0) return;
    this.flashMs = Math.max(0, this.flashMs - deltaMs);
    this.flash.setAlpha(this.flashMs / HOVER_VIEW.flashMs);
    this.flash.setVisible(this.flashMs > 0);
  }

  /** Hızlı süzülürken iticilerin arkasından zemini savuran hafif toz çıkar. */
  private exhaustDust(frame: TankFrame): void {
    const { dust } = HOVER_VIEW;
    if (frame.speed < dust.minSpeed) return;
    const count = frame.boosting ? dust.countMax : Math.random() < 0.35 ? 1 : 0;
    if (count === 0) return;
    const cos = Math.cos(frame.hull);
    const sin = Math.sin(frame.hull);
    const offset = this.spec.hover.trackOffset;
    for (let index = 0; index < 2; index++) {
      if ((this.broken & (index === 0 ? TRACK_LEFT : TRACK_RIGHT)) !== 0) continue;
      const side = index === 0 ? -1 : 1;
      const back = this.art.nozzle.x - 3;
      this.dust.emitParticleAt(
        frame.x + back * cos - side * offset * sin,
        frame.y + back * sin + side * offset * cos,
        count,
      );
    }
  }
}
