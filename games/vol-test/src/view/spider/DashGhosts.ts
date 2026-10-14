import Phaser from 'phaser';
import type { SpiderLook } from '@/config/spiders';
import { TEXTURE_SCALE, addSpiderImage } from '../textures';
import type { SpiderPose } from './SpiderMotion';

const INV = 1 / TEXTURE_SCALE;

interface Ghost {
  readonly thorax: Phaser.GameObjects.Image;
  readonly abdomen: Phaser.GameObjects.Image;
  ageMs: number;
}

/**
 * Atılış hayaleti: av atılışı sürerken gövdenin (göğüs ve karın) yakın geçmişinden soluk, parlak
 * kopyalar dünyada kalır ve söner. Bacaklar hayalete girmez (hız izi gövde siluetiyle okunur).
 * Görüntüler ilk atılışta yaratılır ve havuzdan yeniden kullanılır; atılış yoksa maliyet sıfırdır.
 */
export class DashGhosts {
  private readonly ghosts: Ghost[] = [];
  private sinceCaptureMs = 0;
  private next = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly look: SpiderLook,
    private readonly depth: number,
  ) {}

  /** Yaşayan hayalet sayısı (ölçüm ve sınama). */
  get active(): number {
    return this.ghosts.filter((ghost) => ghost.ageMs < this.look.ghost.lifeMs).length;
  }

  /** Atılış `dash01` (0–1) boyunca yeni kopyalar alır; hepsini `deltaMs` kadar yaşlandırır. */
  update(
    x: number,
    y: number,
    hull: number,
    pose: SpiderPose,
    dash01: number,
    deltaMs: number,
  ): void {
    const spec = this.look.ghost;
    for (const ghost of this.ghosts) {
      ghost.ageMs += deltaMs;
      const fade = 1 - ghost.ageMs / spec.lifeMs;
      const visible = fade > 0;
      ghost.thorax.setVisible(visible);
      ghost.abdomen.setVisible(visible);
      if (visible) {
        const alpha = spec.alpha * fade;
        ghost.thorax.setAlpha(alpha);
        ghost.abdomen.setAlpha(alpha);
      }
    }
    this.sinceCaptureMs += deltaMs;
    if (dash01 < 0.35 || this.sinceCaptureMs < spec.intervalMs || deltaMs <= 0) return;
    this.sinceCaptureMs = 0;
    this.capture(x, y, hull, pose);
  }

  destroy(): void {
    for (const ghost of this.ghosts) {
      ghost.thorax.destroy();
      ghost.abdomen.destroy();
    }
    this.ghosts.length = 0;
  }

  private capture(x: number, y: number, hull: number, pose: SpiderPose): void {
    const { body } = this.look;
    const slot = this.slot();
    const cos = Math.cos(hull);
    const sin = Math.sin(hull);
    const place = (
      image: Phaser.GameObjects.Image,
      localX: number,
      localY: number,
      rotation: number,
      scaleX: number,
      scaleY: number,
    ): void => {
      image
        .setPosition(x + localX * cos - localY * sin, y + localX * sin + localY * cos)
        .setRotation(hull + rotation)
        .setScale(scaleX, scaleY)
        .setVisible(true);
    };
    const lift = pose.hipHeight - body.hipHeight;
    const thoraxScale = INV * (1 + lift * 0.0117);
    place(
      slot.thorax,
      body.thoraxX + pose.leanX,
      pose.leanY,
      pose.thoraxYaw,
      thoraxScale,
      thoraxScale,
    );
    place(
      slot.abdomen,
      body.abdomenPivotX + pose.leanX * 0.7,
      pose.leanY * 0.7,
      pose.abdomenYaw,
      INV * pose.abdomenScale,
      INV,
    );
    slot.ageMs = 0;
  }

  /** Sıradaki boş (ya da en yaşlı) yuva; havuz yoksa kurulur. */
  private slot(): Ghost {
    const spec = this.look.ghost;
    if (this.ghosts.length < spec.count) {
      const make = (part: 'thorax' | 'abdomen'): Phaser.GameObjects.Image => {
        const box = this.look.parts[part];
        return addSpiderImage(this.scene, this.look.id, part)
          .setOrigin(box.pivotX / box.width, box.pivotY / box.height)
          .setTint(spec.tint)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(this.depth)
          .setVisible(false);
      };
      const ghost: Ghost = { thorax: make('thorax'), abdomen: make('abdomen'), ageMs: spec.lifeMs };
      this.ghosts.push(ghost);
      return ghost;
    }
    const ghost = this.ghosts[this.next];
    this.next = (this.next + 1) % this.ghosts.length;
    return ghost;
  }
}
