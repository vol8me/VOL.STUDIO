import Phaser from 'phaser';
import { isCharred } from './charring';
import { VEHICLE_ATLAS } from './textures';

const WORLD = new Phaser.GameObjects.Components.TransformMatrix();

/**
 * Yerel poz tutucusu: araç kapsayıcısının uzayında sürülen, sahneye çizilmeyen görüntü. Görünüm kodu
 * onu kapsayıcıdaki bir ışık görüntüsü gibi sürer; çizimi `GlowMirror` ortak ışık katmanında yapar.
 */
export function addGlowPose(
  scene: Phaser.Scene,
  x: number,
  y: number,
  frame: string,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, VEHICLE_ATLAS, frame).removeFromDisplayList();
}

/**
 * Araç kapsayıcısı içindeki ADD görüntü, ona komşu normal görüntülerle karışınca WebGL grubunu her
 * geçişte böler (ADD↔NORMAL ≈ 2 boşaltma). Bu yüzden ışık görüntüsü kapsayıcıda değil ortak ADD
 * katmanında (`lighting`) çizilir: bu sınıf her kare çizimden hemen önce tutucunun yerel pozunu
 * `parent` kapsayıcısının dünya dönüşümüyle ortak katmandaki gerçek görüntüye taşır.
 * Atalardan biri gizliyse, soluksa ya da yanmışsa (`isCharred`) ışık da gizlenir ya da solar,
 * tıpkı kapsayıcının çocuğuymuş gibi. Renk oluşturulurken tutucudan bir kez kopyalanır.
 */
export class GlowMirror {
  private readonly shine: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    lighting: Phaser.GameObjects.Container,
    private readonly parent: Phaser.GameObjects.Container,
    readonly pose: Phaser.GameObjects.Image,
  ) {
    this.shine = scene.add
      .image(0, 0, pose.texture.key, pose.frame.name)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    if (pose.isTinted) this.shine.setTint(pose.tintTopLeft);
    lighting.add(this.shine);
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.sync, this);
  }

  /** Işığı tutucunun yerel pozundan dünya pozuna taşır; her çizimden önce çağrılır. */
  sync(): void {
    const { parent, pose, shine } = this;
    let alpha = pose.alpha;
    let shown = pose.visible && parent.active;
    for (let node: Phaser.GameObjects.Container | null = parent; node && shown;) {
      alpha *= node.alpha;
      shown = node.visible && !isCharred(node);
      node = node.parentContainer;
    }
    if (!shown || alpha <= 0) {
      shine.setVisible(false);
      return;
    }
    const world = parent.getWorldTransformMatrix(WORLD).decomposeMatrix();
    const cos = Math.cos(world.rotation);
    const sin = Math.sin(world.rotation);
    const x = pose.x * world.scaleX;
    const y = pose.y * world.scaleY;
    shine
      .setPosition(world.translateX + x * cos - y * sin, world.translateY + x * sin + y * cos)
      .setRotation(world.rotation + pose.rotation)
      .setScale(pose.scaleX * world.scaleX, pose.scaleY * world.scaleY)
      .setAlpha(alpha)
      .setVisible(true);
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.sync, this);
    this.shine.destroy();
    this.pose.destroy();
  }
}
