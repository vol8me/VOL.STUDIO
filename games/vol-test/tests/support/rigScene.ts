import type { AssembledRig, RigDefinition } from '@volstudio/core';
import { assembleRig } from '@volstudio/core';
import { ARACHNID_RIG, PLASMA_CANNON_RIG } from '@/config/rigAssets';

/**
 * Phaser görüntü ağacının dönüşüm taşıyan test ikizi.
 *
 * Gerçek bir `Phaser.Game` WebGL bağlamı ister; rig testlerinde ölçülen şey saf geometridir
 * (pivot, dönüş, ölçek) ve yaşam döngüsüdür. Bu ikiz yalnız ağacın dönüşüm sözleşmesini taşır ve
 * dünya matrisini ebeveyn zincirinden hesaplar. Sıradan görünüm testleri `fakeScene` kullanır;
 * bu yalnız dönüşümün gerçekten okunduğu yerlerde gerekir.
 */
export interface FakeTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  parent: FakeContainer | null;
}

export interface DecomposedTransform {
  translateX: number;
  translateY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

interface FakeNode extends FakeTransform {
  readonly kind: 'container' | 'image' | 'particles';
  depth: number;
  alpha: number;
  visible: boolean;
  destroyed: boolean;
  setPosition(x: number, y: number): this;
  setX(x: number): this;
  setRotation(radians: number): this;
  setScale(x: number, y?: number): this;
  setDepth(depth: number): this;
  setAlpha(alpha: number): this;
  setVisible(visible: boolean): this;
  setBlendMode(mode: number): this;
  destroy(): void;
}

export interface FakeContainer extends FakeNode {
  readonly kind: 'container';
  list: FakeNode[];
  blendMode: number | null;
  add(child: FakeNode | FakeNode[]): this;
}

export interface FakeImage extends FakeNode {
  readonly kind: 'image';
  texture: { key: string };
  frame: { name: string | number } | null;
  originX: number;
  originY: number;
  tint: number | null;
  blendMode: number | null;
  setOrigin(x: number, y?: number): this;
  setTint(color: number): this;
  setTexture(key: string, frame?: string | number): this;
  setFrame(frame: string | number): this;
  getWorldTransformMatrix(): { decomposeMatrix(): DecomposedTransform };
}

export interface FakeEmitter extends FakeNode {
  readonly kind: 'particles';
  bursts: Array<{ x: number; y: number; count: number }>;
  emitParticleAt(x: number, y: number, count?: number): this;
}

export interface RigScene {
  textures: { exists: (key: string) => boolean; keys: Set<string> };
  load: { image: (key: string, url: string) => void };
  add: {
    container(x?: number, y?: number, children?: FakeNode[]): FakeContainer;
    image(x: number, y: number, key: string, frame?: string | number): FakeImage;
    particles(x: number, y: number, key: string, config?: unknown): FakeEmitter;
  };
  readonly images: FakeImage[];
  readonly containers: FakeContainer[];
  readonly emitters: FakeEmitter[];
}

/** Dünya dönüşümünü ebeveyn zincirinden toplar. */
export function decomposeWorld(node: FakeTransform): DecomposedTransform {
  let { x, y, rotation, scaleX, scaleY } = node;
  let parent = node.parent;
  while (parent) {
    const cos = Math.cos(parent.rotation);
    const sin = Math.sin(parent.rotation);
    const px = x * parent.scaleX;
    const py = y * parent.scaleY;
    x = parent.x + px * cos - py * sin;
    y = parent.y + px * sin + py * cos;
    rotation += parent.rotation;
    scaleX *= parent.scaleX;
    scaleY *= parent.scaleY;
    parent = parent.parent;
  }
  return { translateX: x, translateY: y, rotation, scaleX, scaleY };
}

export function worldPosition(node: FakeTransform): { x: number; y: number } {
  const decomposed = decomposeWorld(node);
  return { x: decomposed.translateX, y: decomposed.translateY };
}

function node<K extends FakeNode['kind']>(kind: K, x: number, y: number): FakeNode & { kind: K } {
  const result: FakeNode & { kind: K } = {
    kind,
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    parent: null,
    depth: 0,
    alpha: 1,
    visible: true,
    destroyed: false,
    setPosition(nextX, nextY) {
      this.x = nextX;
      this.y = nextY;
      return this;
    },
    setX(nextX) {
      this.x = nextX;
      return this;
    },
    setRotation(radians) {
      this.rotation = radians;
      return this;
    },
    setScale(sx, sy) {
      this.scaleX = sx;
      this.scaleY = sy ?? sx;
      return this;
    },
    setDepth(depth) {
      this.depth = depth;
      return this;
    },
    setAlpha(alpha) {
      this.alpha = alpha;
      return this;
    },
    setVisible(visible) {
      this.visible = visible;
      return this;
    },
    setBlendMode(mode) {
      (this as unknown as { blendMode: number }).blendMode = mode;
      return this;
    },
    destroy() {
      this.destroyed = true;
      this.parent?.list.splice(this.parent.list.indexOf(this), 1);
      this.parent = null;
    },
  };
  return result;
}

function createContainer(x: number, y: number, children: FakeNode[] = []): FakeContainer {
  const container = {
    ...node('container', x, y),
    list: [] as FakeNode[],
    blendMode: null as number | null,
    add(child: FakeNode | FakeNode[]) {
      for (const item of Array.isArray(child) ? child : [child]) {
        // Phaser'da başka bir kapsayıcıya eklenen nesne eskisinden çıkar.
        item.parent?.list.splice(item.parent.list.indexOf(item), 1);
        item.parent = container;
        container.list.push(item);
      }
      return container;
    },
  } as unknown as FakeContainer;
  container.add(children);
  return container;
}

function createImage(x: number, y: number, key: string): FakeImage {
  const image = {
    ...node('image', x, y),
    texture: { key },
    frame: null as { name: string | number } | null,
    originX: 0.5,
    originY: 0.5,
    tint: null as number | null,
    blendMode: null as number | null,
    setOrigin(ox: number, oy?: number) {
      image.originX = ox;
      image.originY = oy ?? ox;
      return image;
    },
    setTint(color: number) {
      image.tint = color;
      return image;
    },
    setTexture(next: string, frame?: string | number) {
      image.texture = { key: next };
      image.frame = frame === undefined ? null : { name: frame };
      return image;
    },
    setFrame(frame: string | number) {
      image.frame = { name: frame };
      return image;
    },
    getWorldTransformMatrix() {
      const decomposed = decomposeWorld(image);
      return { decomposeMatrix: () => decomposed };
    },
  } as unknown as FakeImage;
  return image;
}

function createEmitter(x: number, y: number): FakeEmitter {
  const emitter = {
    ...node('particles', x, y),
    bursts: [] as Array<{ x: number; y: number; count: number }>,
    emitParticleAt(at: number, ay: number, count = 1) {
      emitter.bursts.push({ x: at, y: ay, count });
      return emitter;
    },
  } as unknown as FakeEmitter;
  return emitter;
}

/** Verilen rig tanımlarının dokularını önceden yüklenmiş sayan sahne. */
export function rigScene(...definitions: RigDefinition[]): RigScene {
  const keys = new Set<string>(
    definitions.flatMap((definition) => definition.parts.map((part) => part.textureKey)),
  );
  const images: FakeImage[] = [];
  const containers: FakeContainer[] = [];
  const emitters: FakeEmitter[] = [];
  return {
    textures: { exists: (key) => keys.has(key), keys },
    load: { image: (key) => keys.add(key) },
    add: {
      container: (x = 0, y = 0, children) => {
        const container = createContainer(x, y, children);
        containers.push(container);
        return container;
      },
      image: (x, y, key) => {
        const image = createImage(x, y, key);
        images.push(image);
        return image;
      },
      particles: (x, y) => {
        const emitter = createEmitter(x, y);
        emitters.push(emitter);
        return emitter;
      },
    },
    images,
    containers,
    emitters,
  };
}

/** Arachnid ve plazma topu dokuları yüklü sahne: `WalkerView` için. */
export function walkerScene(): RigScene {
  return rigScene(ARACHNID_RIG, PLASMA_CANNON_RIG);
}

/** Eklemli arachnid rig'ini sahnede montajlar. */
export function assembleArachnid(scene: RigScene): AssembledRig {
  return assembleRig(scene as never, ARACHNID_RIG);
}
