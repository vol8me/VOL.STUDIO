import { vi } from 'vitest';
import type { AssembledRig, RigDefinition } from '@volstudio/core';
import { assembleRig, buildRigDefinition, validateRigMetadata } from '@volstudio/core';
import { articulateRigDefinition } from '@volstudio/core';
import arachnidMetadataRaw from '@/assets/rig/arachnid.metadata.json';
import { ARACHNID_ARTICULATION } from '@/config/rig';

/**
 * Phaser'ın görüntü ağacının test ikizi.
 *
 * Gerçek bir `Phaser.Game` bir WebGL bağlamı ister; ölçülen şey ise saf
 * geometri (pivot, dönüş, ölçek) ve yaşam döngüsüdür. İkiz yalnız ağacın
 * dönüşüm sözleşmesini taşır ve dünya matrisini ebeveyn zincirinden hesaplar.
 */
export interface FakeTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  parent: FakeContainer | null;
}

export interface FakeContainer extends FakeTransform {
  list: FakeTransform[];
  add(child: FakeTransform): void;
  setPosition(x: number, y: number): void;
  setDepth(depth: number): void;
  setScale(x: number, y?: number): void;
  destroy(): void;
}

export interface FakeImage extends FakeTransform {
  key: string;
  frame: { name: string | number } | null;
  texture: { key: string };
  originX: number;
  originY: number;
  alpha: number;
  visible: boolean;
  depth: number;
  tint: number | null;
  blendMode: number | null;
  destroyed: boolean;
  setScale(x: number, y?: number): FakeImage;
  setTexture(key: string, frame?: string | number): FakeImage;
  setPosition(x: number, y: number): FakeImage;
  setRotation(radians: number): FakeImage;
  setOrigin(x: number, y: number): FakeImage;
  setAlpha(alpha: number): FakeImage;
  setTint(color: number): FakeImage;
  clearTint(): FakeImage;
  setVisible(visible: boolean): FakeImage;
  setDepth(depth: number): FakeImage;
  setBlendMode(mode: number): FakeImage;
  getWorldTransformMatrix(): { decomposeMatrix(): DecomposedTransform };
  destroy(): void;
}

export interface DecomposedTransform {
  translateX: number;
  translateY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface GraphicsCall {
  op: string;
  args: number[];
}

export interface FakeGraphics {
  calls: GraphicsCall[];
  destroyed: boolean;
  depth: number;
  lineStyle(width: number, color: number, alpha?: number): FakeGraphics;
  fillStyle(color: number, alpha?: number): FakeGraphics;
  fillCircle(x: number, y: number, radius: number): FakeGraphics;
  generateTexture(key: string, width: number, height: number): FakeGraphics;
  beginPath(): FakeGraphics;
  moveTo(x: number, y: number): FakeGraphics;
  lineTo(x: number, y: number): FakeGraphics;
  strokePath(): FakeGraphics;
  strokeRect(x: number, y: number, width: number, height: number): FakeGraphics;
  clear(): FakeGraphics;
  setDepth(depth: number): FakeGraphics;
  destroy(): void;
}

export interface FakeEmitter {
  bursts: Array<{ x: number; y: number; count: number }>;
  killed: number;
  destroyed: boolean;
  depth: number;
  setDepth(depth: number): void;
  emitParticleAt(x: number, y: number, count: number): void;
  killAll(): void;
  destroy(): void;
}

export interface FakeScene {
  textures: { exists: (key: string) => boolean; keys: Set<string> };
  load: { image: (key: string, url: string) => void };
  add: {
    container(x: number, y: number): FakeContainer;
    image(x: number, y: number, key: string, frame?: string | number): FakeImage;
    graphics(): FakeGraphics;
    particles(x: number, y: number, key: string, config: unknown): FakeEmitter;
  };
  cameras: {
    main: {
      zoom: number;
      width: number;
      height: number;
      midPoint: { x: number; y: number };
      setZoom(zoom: number): void;
      centerOn(x: number, y: number): void;
      shake(durationMs: number, intensity: number): void;
      centeredOn: { x: number; y: number } | null;
      shakes: Array<{ durationMs: number; intensity: number }>;
    };
  };
  scale: { on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> };
  events: { once: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> };
  game: { canvas: { parentElement: HTMLElement | null } };
  graphics: FakeGraphics[];
  emitters: FakeEmitter[];
  images: FakeImage[];
}

/**
 * Testler GÖNDERİLEN metadata'yı sürer, export ağacındakini değil.
 *
 * Bir dönem burası `devtools/pen.dev/pen_export/`e uzanıyordu; o hâlde testler
 * oyunun gerçekten yüklediği dosyayı değil, onun üretildiği ARA ÇIKTIYI
 * doğruluyordu. İkisi ayrıştığında (senkron atlanmış, bir parça yeniden
 * adlandırılmış) testler yeşil kalır, oyun kırılırdı.
 */
export const arachnidTestMetadata = validateRigMetadata(
  arachnidMetadataRaw,
  'arachnid test metadata',
);

/** Eklem şeması UYGULANMIŞ tanım — üretimdeki montajın birebir aynısı. */
export function buildTestRigDefinition(): RigDefinition {
  const urls = Object.fromEntries(
    arachnidTestMetadata.parts.map((part) => [
      `/parts/${part.partId}.png`,
      `/mock/${part.partId}.png`,
    ]),
  );
  return articulateRigDefinition(
    buildRigDefinition(arachnidTestMetadata, urls),
    ARACHNID_ARTICULATION,
  );
}

export function createFakeScene(definition?: RigDefinition): FakeScene {
  const keys = new Set<string>(definition?.parts.map((part) => part.textureKey) ?? []);
  const graphics: FakeGraphics[] = [];
  const emitters: FakeEmitter[] = [];
  const images: FakeImage[] = [];

  const scene: FakeScene = {
    textures: { exists: (key) => keys.has(key), keys },
    load: { image: (key) => keys.add(key) },
    add: {
      container: (x, y) => createContainer(x, y),
      image: (x, y, key) => {
        const image = createImage(x, y, key);
        images.push(image);
        return image;
      },
      graphics: () => {
        const item = createGraphics(keys);
        graphics.push(item);
        return item;
      },
      particles: (_x, _y, _key, _config) => {
        const emitter = createEmitter();
        emitters.push(emitter);
        return emitter;
      },
    },
    cameras: {
      main: {
        zoom: 1,
        width: 1280,
        height: 720,
        midPoint: { x: 0, y: 0 },
        centeredOn: null,
        shakes: [],
        setZoom(zoom) {
          this.zoom = zoom;
        },
        centerOn(x, y) {
          this.centeredOn = { x, y };
          this.midPoint = { x, y };
        },
        shake(durationMs, intensity) {
          this.shakes.push({ durationMs, intensity });
        },
      },
    },
    scale: { on: vi.fn(), off: vi.fn() },
    events: { once: vi.fn(), off: vi.fn() },
    game: { canvas: { parentElement: null } },
    graphics,
    emitters,
    images,
  };

  return scene;
}

/** Fake sahne üstünde eklemli rig'i montajlar. */
export function assembleTestRig(scene: FakeScene, definition: RigDefinition): AssembledRig {
  return assembleRig(scene as never, definition);
}

function createContainer(x: number, y: number): FakeContainer {
  const container: FakeContainer = {
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    parent: null,
    list: [],
    add(child) {
      child.parent = this;
      this.list.push(child);
    },
    setPosition(nextX, nextY) {
      this.x = nextX;
      this.y = nextY;
    },
    setDepth() {},
    setScale(sx, sy) {
      this.scaleX = sx;
      this.scaleY = sy ?? sx;
    },
    destroy() {},
  };
  return container;
}

function createImage(x: number, y: number, key: string): FakeImage {
  const image: FakeImage = {
    x,
    y,
    key,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    parent: null,
    frame: null,
    texture: { key },
    originX: 0.5,
    originY: 0.5,
    alpha: 1,
    visible: true,
    depth: 0,
    tint: null,
    blendMode: null,
    destroyed: false,
    setScale(sx, sy) {
      this.scaleX = sx;
      this.scaleY = sy ?? sx;
      return this;
    },
    setTexture(nextKey, frame) {
      this.key = nextKey;
      this.texture = { key: nextKey };
      this.frame = frame === undefined ? null : { name: frame };
      return this;
    },
    setPosition(nextX, nextY) {
      this.x = nextX;
      this.y = nextY;
      return this;
    },
    setRotation(radians) {
      this.rotation = radians;
      return this;
    },
    setOrigin(ox, oy) {
      this.originX = ox;
      this.originY = oy;
      return this;
    },
    setAlpha(alpha) {
      this.alpha = alpha;
      return this;
    },
    setTint(color) {
      this.tint = color;
      return this;
    },
    clearTint() {
      this.tint = null;
      return this;
    },
    setVisible(visible) {
      this.visible = visible;
      return this;
    },
    setDepth(depth) {
      this.depth = depth;
      return this;
    },
    setBlendMode(mode) {
      this.blendMode = mode;
      return this;
    },
    getWorldTransformMatrix() {
      const decomposed = decomposeWorld(image);
      return { decomposeMatrix: () => decomposed };
    },
    destroy() {
      this.destroyed = true;
    },
  };
  return image;
}

/** Dünya dönüşümünü ebeveyn zincirinden toplar. */
export function decomposeWorld(node: FakeTransform): DecomposedTransform {
  let x = node.x;
  let y = node.y;
  let rotation = node.rotation;
  let scaleX = node.scaleX;
  let scaleY = node.scaleY;
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

function createGraphics(keys: Set<string>): FakeGraphics {
  const graphics: FakeGraphics = {
    calls: [],
    destroyed: false,
    depth: 0,
    lineStyle(width, color, alpha = 1) {
      this.calls.push({ op: 'lineStyle', args: [width, color, alpha] });
      return this;
    },
    fillStyle(color, alpha = 1) {
      this.calls.push({ op: 'fillStyle', args: [color, alpha] });
      return this;
    },
    fillCircle(x, y, radius) {
      this.calls.push({ op: 'fillCircle', args: [x, y, radius] });
      return this;
    },
    generateTexture(key, width, height) {
      keys.add(key);
      this.calls.push({ op: 'generateTexture', args: [width, height] });
      return this;
    },
    beginPath() {
      this.calls.push({ op: 'beginPath', args: [] });
      return this;
    },
    moveTo(x, y) {
      this.calls.push({ op: 'moveTo', args: [x, y] });
      return this;
    },
    lineTo(x, y) {
      this.calls.push({ op: 'lineTo', args: [x, y] });
      return this;
    },
    strokePath() {
      this.calls.push({ op: 'strokePath', args: [] });
      return this;
    },
    strokeRect(x, y, width, height) {
      this.calls.push({ op: 'strokeRect', args: [x, y, width, height] });
      return this;
    },
    clear() {
      this.calls.push({ op: 'clear', args: [] });
      return this;
    },
    setDepth(depth) {
      this.depth = depth;
      return this;
    },
    destroy() {
      this.destroyed = true;
    },
  };
  return graphics;
}

function createEmitter(): FakeEmitter {
  return {
    bursts: [],
    killed: 0,
    destroyed: false,
    depth: 0,
    setDepth(depth) {
      this.depth = depth;
    },
    emitParticleAt(x, y, count) {
      this.bursts.push({ x, y, count });
    },
    killAll() {
      this.killed++;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}
