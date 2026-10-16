import Phaser from 'phaser';
import { WATER_VIEW } from '@/config/waterView';

/** Yanmış enkazın rengi: çarpan renk, orijinal rengi koyu ve isli bir tona çeker. */
export const CHAR_TINT = 0x3b3633;

interface Remembered {
  /** Kararmadan önceki renk; `null` ise nesne boyasızdı. */
  readonly tint: number | null;
  /** Işık katmanı (ADD) nesnesi kararırken gizlenir ve geri gelince açılır. */
  readonly glow: boolean;
}

const remembered = new WeakMap<object, Remembered>();
const charredRoots = new WeakSet<object>();

/** Kök (ya da kökün atası) yanmış mı: kapsayıcı dışında çizilen ışıklar (`GlowMirror`) buna göre söner. */
export function isCharred(node: object): boolean {
  return charredRoots.has(node);
}

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
  if (on) charredRoots.add(root);
  else charredRoots.delete(root);
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

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
const ease = (t: number): number => t * t * (3 - 2 * t);

/** Suya çekme ve batış tintleri ayrı hafızalardadır: biri diğerinin eski rengini ezmez. */
const wetTint = new WeakMap<object, number | null>();
const sinkTint = new WeakMap<object, number | null>();
const lastMix = new WeakMap<object, number>();

function mixColor(from: number, to: number, t: number): number {
  const r = Math.round(((from >> 16) & 0xff) * (1 - t) + ((to >> 16) & 0xff) * t);
  const g = Math.round(((from >> 8) & 0xff) * (1 - t) + ((to >> 8) & 0xff) * t);
  const b = Math.round((from & 0xff) * (1 - t) + (to & 0xff) * t);
  return (r << 16) | (g << 8) | b;
}

/**
 * Bir kökün bütün görüntülerini `color`a `t` oranında çeker (0 eski renge döndürür). Işık katmanları
 * (ADD) dokunulmaz. Eski renk ilk çekişte `store`a yazılır ve 0'da geri gelir.
 */
function tintTree(
  root: Phaser.GameObjects.Container,
  store: WeakMap<object, number | null>,
  color: number,
  t: number,
): void {
  walk(root, (object) => {
    if (typeof object.setTint !== 'function' || typeof object.clearTint !== 'function') return;
    if (object.blendMode === Phaser.BlendModes.ADD) return;
    if (t <= 0) {
      if (!store.has(object)) return;
      const before = store.get(object) ?? null;
      store.delete(object);
      if (before === null) object.clearTint();
      else object.setTint(before);
      return;
    }
    if (!store.has(object))
      store.set(object, object.isTinted ? (object.tintTopLeft ?? null) : null);
    object.setTint(mixColor(store.get(object) ?? 0xffffff, color, t));
  });
}

/**
 * Suya batan CANLI aracın gövdesi: `depth` [0, 1] derinleştikçe suyun rengine çekilir ve solar; 0
 * (kıyıda) görünümü eski hâline getirir. Her karede çağrılabilir: karışım değişmedikçe iş yapmaz.
 */
export function submergeRoot(root: Phaser.GameObjects.Container, depth: number): void {
  const cfg = WATER_VIEW.submerge;
  const t = clamp01((depth - cfg.startDepth) / (1 - cfg.startDepth));
  const mix = Math.round(t * cfg.tintMax * 100) / 100;
  if (lastMix.get(root) === mix) return;
  lastMix.set(root, mix);
  tintTree(root, wetTint, cfg.tint, mix);
  root.setAlpha(1 - t * (1 - cfg.alphaMin));
}

interface SinkBase {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

const sinkBase = new WeakMap<object, SinkBase>();

/**
 * Batan aracın gövdesi: `progress` [0, 1] ile ilk anda kabarır (hava), sonra yan yatar, hafifçe titrer,
 * suyun rengine kararır, küçülür ve solar; 0 görünümü eski hâline getirir. Gölge katmanı kökün
 * dışındadır, onu görünüm kendisi söndürür.
 */
export function sinkRoot(
  root: Phaser.GameObjects.Container,
  progress: number,
  endScale: number,
): void {
  const p = clamp01(progress);
  const cfg = WATER_VIEW.sink;
  if (p === 0) {
    const base = sinkBase.get(root);
    if (base) {
      root.setPosition(base.x, base.y).setRotation(base.rotation);
      sinkBase.delete(root);
    }
    // Renk katmanları iç içedir (suya çekilme → isli → batış) ve ters sırayla çözülür: burada yalnız
    // batış geri alınır; isli renk `setCharred(false)`, suya çekilme ise sonraki `submergeRoot` karesinde
    // (karışım hafızası silindiği için sıfır da işlenir) geri alınır. Yoksa yeniden doğan araç soluk kalır.
    tintTree(root, sinkTint, cfg.tint, 0);
    lastMix.delete(root);
    root.setAlpha(1);
    root.setScale(1);
    return;
  }
  let base = sinkBase.get(root);
  if (!base) {
    base = { x: root.x, y: root.y, rotation: root.rotation };
    sinkBase.set(root, base);
  }
  const eased = ease(p);
  const gurgle = 1 + cfg.swell * Math.sin(clamp01(p / 0.2) * Math.PI);
  root.setScale((1 - (1 - endScale) * eased) * gurgle);
  root.setAlpha(1 - p ** 2.4);
  // Yatış yönü konumdan türer (rastgelelik yok): aynı yerde batan hep aynı yana yatar.
  const side = Math.floor(base.x / 8) % 2 === 0 ? 1 : -1;
  root.setRotation(base.rotation + side * cfg.list * eased);
  const shake = Math.sin(p * cfg.wobbleCycles * Math.PI * 2) * cfg.wobble * (1 - p);
  root.setPosition(base.x + shake, base.y + shake * 0.6);
  tintTree(root, sinkTint, cfg.tint, clamp01(p / 0.55));
}
