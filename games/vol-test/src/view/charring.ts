import Phaser from 'phaser';

/** Yanmış enkazın rengi: çarpan renk, orijinal rengi koyu ve isli bir tona çeker. */
export const CHAR_TINT = 0x3b3633;

interface Remembered {
  /** Kararmadan önceki renk; `null` ise nesne boyasızdı. */
  readonly tint: number | null;
  /** Işık katmanı (ADD) nesnesi kararırken gizlenir ve geri gelince açılır. */
  readonly glow: boolean;
}

const remembered = new WeakMap<object, Remembered>();

function walk(node: Phaser.GameObjects.GameObject, visit: (object: Tintable) => void): void {
  const container = node as Phaser.GameObjects.Container;
  if (Array.isArray(container.list)) {
    for (const child of container.list) walk(child, visit);
    return;
  }
  visit(node);
}

type Tintable = Phaser.GameObjects.GameObject &
  Partial<
    Pick<
      Phaser.GameObjects.Image,
      'setTint' | 'clearTint' | 'isTinted' | 'tintTopLeft' | 'setVisible'
    >
  > & { blendMode?: number | string };

/**
 * Bir görünüm köküne bağlı her görüntüyü karartır (`on`) ya da eski rengine döndürür. Ölen araç olduğu
 * yerde yanmış bir gövde olarak kalır: ışık ve parlama katmanları (ADD) söner, gövde isli renge çekilir.
 * Önceki renkler hatırlanır; kırık itici kütüğü gibi kendi rengi olan parçalar geri gelince bozulmaz.
 * Gölge katmanı kökün dışındadır ve bu işlevden etkilenmez.
 */
export function setCharred(root: Phaser.GameObjects.Container, on: boolean): void {
  walk(root, (object) => {
    if (typeof object.setTint !== 'function' || typeof object.clearTint !== 'function') return;
    const glow = object.blendMode === Phaser.BlendModes.ADD;
    if (on) {
      if (!remembered.has(object))
        remembered.set(object, {
          tint: object.isTinted ? (object.tintTopLeft ?? null) : null,
          glow,
        });
      object.setTint(CHAR_TINT);
      if (glow) object.setVisible?.(false);
      return;
    }
    const before = remembered.get(object);
    if (!before) return;
    remembered.delete(object);
    if (before.tint === null) object.clearTint();
    else object.setTint(before.tint);
    if (before.glow) object.setVisible?.(true);
  });
}
