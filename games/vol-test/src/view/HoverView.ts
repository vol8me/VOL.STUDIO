import Phaser from 'phaser';
import { poseSourceOf, PoseShadow, clamp01, type PoseSourceNode } from '@volstudio/core';
import { Spring1D } from '@volstudio/core/math';
import { SHOT_LOOK } from '@/config/fx';
import { HOVER_ART, HOVER_VIEW, type HoverArt } from '@/config/hoverView';
import { LIGHT } from '@/config/light';
import type { HoverSpec } from '@/config/vehicles';
import { TRACK_LEFT, TRACK_RIGHT } from '@/sim/chassis/parts';
import { mountPose, muzzlePose, type MuzzlePose } from '@/sim/muzzle';
import { CorePulse } from './CorePulse';
import { Feelers } from './Feelers';
import { TEXTURE, TEXTURE_SCALE, addHoverImage } from './textures';
import type { TankFrame, VehicleView } from './VehicleView';
import { WATER_VIEW } from '@/config/waterView';
import { setCharred, sinkRoot } from './charring';

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
  /** Her yuvanın ağız parlaması (çok namlulu araçta yuva başına bir tane) ve kalan süresi. */
  private readonly flashes: Phaser.GameObjects.Image[];
  private readonly flashMs: number[];
  /** Yan toplar (`HoverArt.gun`): her yuvada ayrı dönen resim ve kendi geri kayışı; yoksa boş. */
  private readonly guns: Array<{ image: Phaser.GameObjects.Image; recoil: Spring1D }>;
  private readonly mount: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private readonly core: CorePulse;
  private readonly feelers: Feelers;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly glow: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly bank = new Spring1D();
  private readonly barrel = new Spring1D();
  private readonly tip: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private broken = 0;
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
    // Reaktör çekirdeği gövdeyle yatar ve nefes alır; duyargalar gövdenin ALTINDAN çıkar (kapsayıcı
    // sırasında gövdeden önce gelir) ve taret hepsinin üstündedir.
    const { sensors } = art;
    this.core = new CorePulse(scene, sensors.core.scale, sensors.core.tint);
    this.core.place(sensors.core.x, sensors.core.y);
    this.feelers = new Feelers(scene, sensors.feelers);
    const gun = art.gun;
    this.guns = gun
      ? spec.armament.mounts.map(() => ({
          image: addHoverImage(scene, spec.id, 'gun')
            .setOrigin(gun.pivotX / gun.width, 0.5)
            .setScale(INV),
          recoil: new Spring1D(),
        }))
      : [];
    this.body = scene.add.container(0, 0, [
      ...this.feelers.objects,
      hull,
      this.core.image,
      ...this.guns.map((g) => g.image),
      this.turretRig,
    ]);
    this.root = scene.add.container(0, 0, [...this.pods, ...this.fans, ...this.nozzles, this.body]);
    this.root.setDepth(HOVER_VIEW.depth);
    this.shadowSource = poseSourceOf([
      ...this.pods,
      ...this.feelers.parts,
      hull,
      ...this.guns.map((g) => g.image),
      this.turret,
    ]);

    this.flashes = spec.armament.mounts.map(() =>
      scene.add
        .image(0, 0, TEXTURE.flash)
        .setTint(SHOT_LOOK[spec.armament.weapon.style].glow)
        .setOrigin(0, 0.5)
        .setScale(INV * art.flashScale)
        .setVisible(false),
    );
    this.flashMs = this.flashes.map(() => 0);
    for (const flash of this.flashes) lighting.add(flash);
    this.dust = scene.add
      .particles(0, 0, TEXTURE.spark, HOVER_VIEW.dust.emitter)
      .setDepth(HOVER_VIEW.dust.depth);
    this.glow = scene.add
      .particles(0, 0, TEXTURE.spark, { ...HOVER_VIEW.glow.emitter, tint: art.glow })
      .setDepth(HOVER_VIEW.glow.depth)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Atışta ateşleyen namlu geri teper ve ağız parlaması yanar; tek taretli araç `mount`u yok sayar. */
  fire(mount = 0): void {
    const index = Math.min(mount, this.flashes.length - 1);
    if (this.guns.length > 0) this.guns[index].recoil.velocity += this.art.barrel.kick;
    else this.barrel.velocity += this.art.barrel.kick;
    this.flashMs[index] = HOVER_VIEW.flashMs;
    const flash = this.flashes[index];
    flash.setScale(INV * this.art.flashScale * (0.85 + Math.random() * 0.35));
    flash.setVisible(true);
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
    // Yan toplar için kendi yayları: tek taretli araçta `guns` boştur.
    for (const gun of this.guns) {
      gun.recoil.update(0, deltaMs, art.barrel);
      gun.recoil.value = Phaser.Math.Clamp(gun.recoil.value, -art.barrel.max, 0);
    }
    const effort = clamp01(frame.speed / hover.maxSpeed);
    const bob = Math.sin((this.elapsedMs / HOVER_VIEW.bob.periodMs) * Math.PI * 2);
    const lean = HOVER_VIEW.bank;
    const bank = this.bank.update(
      Phaser.Math.Clamp(-frame.angularVelocity * lean.perTurn, -lean.max, lean.max),
      deltaMs,
      lean.spring,
    );
    this.body
      .setPosition(frame.pitch, frame.roll)
      .setRotation(bank)
      .setScale(1 + bob * HOVER_VIEW.bob.amount + (frame.boosting ? HOVER_VIEW.bob.boost : 0));
    // Yatış yalnız gövdeyi eğer: taret dünya açısını korur (nişan görseli kaymaz).
    this.turretRig.setRotation(frame.turret - frame.hull - bank);
    this.turret.setX(this.barrel.value);
    this.placeGuns(frame, bank);

    this.core.update(effort, frame.boosting, deltaMs);
    // Duyargalar gövde kapsayıcısının yerel uzayındadır: konum ve dönüş kapsayıcıdan gelir.
    this.feelers.update(
      0,
      0,
      0,
      1,
      { angularVelocity: frame.angularVelocity, effort },
      this.elapsedMs,
      deltaMs,
    );
    this.spinFans(frame, effort, deltaMs);
    this.glowNozzles(frame, effort);
    this.placeFlash(frame, deltaMs);
    this.exhaustTrail(frame, effort);
    this.shadow.update(this.shadowSource);
  }

  setPresent(present: boolean): void {
    this.root.setVisible(present);
    if (present) return;
    this.shadow.clear();
    this.barrel.value = 0;
    this.barrel.velocity = 0;
    this.flashes.forEach((flash, index) => {
      this.flashMs[index] = 0;
      flash.setVisible(false);
    });
    for (const gun of this.guns) {
      gun.recoil.value = 0;
      gun.recoil.velocity = 0;
    }
  }

  setWrecked(wrecked: boolean): void {
    setCharred(this.root, wrecked);
    if (!wrecked) return;
    this.flashes.forEach((flash, index) => {
      this.flashMs[index] = 0;
      flash.setVisible(false);
    });
  }

  sink(progress: number): void {
    sinkRoot(this.root, progress, WATER_VIEW.sink.scale);
    if (progress > 0) this.shadow.clear();
  }

  destroy(): void {
    this.shadow.destroy();
    for (const flash of this.flashes) flash.destroy();
    this.core.destroy();
    this.feelers.destroy();
    this.dust.destroy();
    this.glow.destroy();
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

  /** Yan topları yuvalarında `sim/muzzle` açısıyla döndürür; gövde yatışı topları da yatırır, nişan bozulmaz. */
  private placeGuns(frame: TankFrame, bank: number): void {
    const armament = this.spec.armament;
    this.guns.forEach((gun, index) => {
      const mount = armament.mounts[index];
      const pose = mountPose(frame, armament, index, this.mount);
      const local = pose.angle - frame.hull - bank;
      gun.image
        .setPosition(
          mount.x + Math.cos(local) * gun.recoil.value,
          mount.y + Math.sin(local) * gun.recoil.value,
        )
        .setRotation(local);
    });
  }

  private placeFlash(frame: TankFrame, deltaMs: number): void {
    const armament = this.spec.armament;
    this.flashes.forEach((flash, index) => {
      const kick = this.guns.length > 0 ? this.guns[index].recoil.value : this.barrel.value;
      const tip = muzzlePose(frame, armament, index, this.tip, armament.mounts[index].reach + kick);
      flash.setPosition(tip.x, tip.y).setRotation(tip.angle);
      if (this.flashMs[index] <= 0) return;
      this.flashMs[index] = Math.max(0, this.flashMs[index] - deltaMs);
      flash.setAlpha(this.flashMs[index] / HOVER_VIEW.flashMs);
      flash.setVisible(this.flashMs[index] > 0);
    });
  }

  /**
   * Süzülürken iticilerin arkasından zemini savuran toz ve yerinde sönen enerji kıvılcımı çıkar:
   * hız arttıkça yoğunlaşır, atılımda tavana varır. Kırık itici izsizdir.
   */
  private exhaustTrail(frame: TankFrame, effort: number): void {
    const { dust, glow } = HOVER_VIEW;
    const dusty = frame.speed >= dust.minSpeed;
    const sparkling = frame.speed >= glow.minSpeed;
    if (!dusty && !sparkling) return;
    const cos = Math.cos(frame.hull);
    const sin = Math.sin(frame.hull);
    const offset = this.spec.hover.trackOffset;
    const dustChance = frame.boosting ? 1 : 0.35 + effort * 0.55;
    const dustCount = frame.boosting ? dust.countMax : 1;
    const sparkCount = frame.boosting ? glow.countMax : 1;
    for (let index = 0; index < 2; index++) {
      if ((this.broken & (index === 0 ? TRACK_LEFT : TRACK_RIGHT)) !== 0) continue;
      const side = index === 0 ? -1 : 1;
      const back = this.art.nozzle.x - 3;
      const x = frame.x + back * cos - side * offset * sin;
      const y = frame.y + back * sin + side * offset * cos;
      if (dusty && Math.random() < dustChance) this.dust.emitParticleAt(x, y, dustCount);
      if (sparkling) this.glow.emitParticleAt(x, y, sparkCount);
    }
  }
}
