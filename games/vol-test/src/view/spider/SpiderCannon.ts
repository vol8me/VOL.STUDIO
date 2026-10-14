import Phaser from 'phaser';
import { Spring1D } from '@volstudio/core/math';
import type { SpiderLook } from '@/config/spiders';
import { TEXTURE, TEXTURE_SCALE, addSpiderImage } from '../textures';

const INV = 1 / TEXTURE_SCALE;
/** Işık dokusu (`TEXTURE.blast`) 64 px'tir. */
const GLOW_TEXTURE_PX = 64;

/**
 * Bir yuvadaki top: iki parça el çizimi SVG (yuva, namlu demeti). Namlu demeti yuvanın altından
 * çıkar ve atışta geri kayar, yuva sarsılır ve ısınma ışığı yanıp söner. Çağıran `root`u yuvanın
 * gövde-yerel konumuna koyup yuva açısıyla döndürür; gölge ayrı katmandadır ve aynı pozdan, ışığın
 * yönünde kayarak çizilir. Plazma topu ve iğne atıcı aynı sınıftır: fark `SpiderLook.cannon`dadır.
 */
export class SpiderCannon {
  readonly root: Phaser.GameObjects.Container;
  private readonly housing: Phaser.GameObjects.Image;
  private readonly barrels: Phaser.GameObjects.Image;
  private readonly coil: Phaser.GameObjects.Image;
  private readonly housingShadow: Phaser.GameObjects.Image;
  private readonly barrelShadow: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Image;
  private readonly recoil = new Spring1D();
  private readonly kick = new Spring1D();
  private flashMs = 0;
  private heatMs = 0;
  private elapsedMs = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly look: SpiderLook,
    lighting: Phaser.GameObjects.Container,
    shadowLayer: Phaser.GameObjects.Container,
  ) {
    const { parts, cannon } = look;
    const housingBox = parts['cannon-housing'];
    const barrelBox = parts['cannon-barrels'];
    const place = (
      image: Phaser.GameObjects.Image,
      box: { width: number; height: number; pivotX: number; pivotY: number },
    ): Phaser.GameObjects.Image =>
      image.setOrigin(box.pivotX / box.width, box.pivotY / box.height).setScale(INV);

    this.barrels = place(addSpiderImage(scene, look.id, 'cannon-barrels'), barrelBox);
    this.housing = place(addSpiderImage(scene, look.id, 'cannon-housing'), housingBox);
    this.coil = scene.add
      .image(cannon.coilX, 0, TEXTURE.blast)
      .setScale(cannon.coilGlowPx / GLOW_TEXTURE_PX)
      .setTint(cannon.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.root = scene.add.container(0, 0, [this.barrels, this.housing, this.coil]);

    const dark = (image: Phaser.GameObjects.Image): Phaser.GameObjects.Image =>
      image.setTint(0x000000).setAlpha(0.3);
    this.housingShadow = dark(place(addSpiderImage(scene, look.id, 'cannon-housing'), housingBox));
    this.barrelShadow = dark(place(addSpiderImage(scene, look.id, 'cannon-barrels'), barrelBox));
    shadowLayer.add([this.barrelShadow, this.housingShadow]);

    this.flash = scene.add
      .image(0, 0, TEXTURE.blast)
      .setTint(cannon.glow)
      .setOrigin(0.25, 0.5)
      .setVisible(false);
    lighting.add(this.flash);
  }

  /** Atışta demeti geri iter, yuvayı sarsar ve ağız parlamasıyla ısınmayı başlatır. */
  fire(): void {
    const { cannon } = this.look;
    this.recoil.velocity += cannon.recoil.kick;
    this.kick.velocity += cannon.housingKick.kick;
    this.flashMs = cannon.flashMs;
    this.heatMs = cannon.heatMs;
    this.flash.setVisible(true);
  }

  /** Demetin geri kayışı kadar kısalmış yuva erişimi (dünya birimi): parlama bu uçta açılır. */
  get recoilWorld(): number {
    return this.recoil.value;
  }

  /** Yayları ve ısınma ışığını ilerletir. */
  advance(deltaMs: number): void {
    const { cannon } = this.look;
    this.elapsedMs += deltaMs;
    this.recoil.update(0, deltaMs, cannon.recoil);
    this.recoil.value = Phaser.Math.Clamp(this.recoil.value, -cannon.recoil.max, 0);
    this.kick.update(0, deltaMs, cannon.housingKick);
    this.kick.value = Phaser.Math.Clamp(this.kick.value, -cannon.housingKick.max, 0);

    this.barrels.x = this.recoil.value;
    this.housing.x = this.kick.value;
    this.heatMs = Math.max(0, this.heatMs - deltaMs);
    const heat = this.heatMs / cannon.heatMs;
    const idle = cannon.idleGlow;
    const breath =
      idle.alpha + idle.pulseAlpha * Math.sin((this.elapsedMs / 1000) * idle.pulseHz * Math.PI * 2);
    this.coil.setX(cannon.coilX + this.recoil.value).setAlpha(Math.min(1, breath + heat));
  }

  /**
   * Gölgeyi topun şu anki pozuna koyar. `x`/`y`/`angle` topun gövde-yerel konumu ve yönüdür; kayma
   * ışığın gövde-yerel yönüdür (dünya birimi/yükseklik).
   */
  shadowAt(x: number, y: number, angle: number, lightX: number, lightY: number): void {
    const height = this.look.cannon.height;
    const px = x + lightX * height;
    const py = y + lightY * height;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.housingShadow
      .setPosition(px + cos * this.kick.value, py + sin * this.kick.value)
      .setRotation(angle);
    this.barrelShadow
      .setPosition(px + cos * this.recoil.value, py + sin * this.recoil.value)
      .setRotation(angle);
  }

  /** Ağız parlamasını geri teperken kısalan demetin ucuna (dünya uzayı) koyar ve söndürür. */
  flashAt(deltaMs: number, x: number, y: number, angle: number): void {
    if (this.flashMs <= 0) return;
    const { cannon } = this.look;
    this.flashMs = Math.max(0, this.flashMs - deltaMs);
    const phase = this.flashMs / cannon.flashMs;
    this.flash
      .setPosition(x, y)
      .setRotation(angle)
      .setScale(
        cannon.flashLengthScale * cannon.flashScale * (0.6 + 0.4 * phase),
        cannon.flashWidthScale * cannon.flashScale * phase,
      )
      .setAlpha(phase)
      .setVisible(phase > 0);
  }

  /** Ağız parlamasını söndürür ve yayları sıfırlar: gizlenen araçtan ışık kalmaz. */
  silence(): void {
    this.flashMs = 0;
    this.heatMs = 0;
    this.recoil.value = 0;
    this.recoil.velocity = 0;
    this.kick.value = 0;
    this.kick.velocity = 0;
    this.flash.setVisible(false);
  }

  destroy(): void {
    this.flash.destroy();
    this.housingShadow.destroy();
    this.barrelShadow.destroy();
    this.root.destroy();
  }
}
