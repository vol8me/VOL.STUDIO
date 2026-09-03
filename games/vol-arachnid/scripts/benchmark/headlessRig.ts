/**
 * Benchmark'ın headless rig'i.
 *
 * `tests/support/phaserFakes.ts` ile aynı işi yapan bir ikiz DEĞİLDİR ve
 * bilinçli olarak ayrıdır: test ikizi vitest casusları (`vi.fn()`) taşır ve
 * doğrulama kolaylıkları sunar; bir benchmark bunların hiçbirine bağlanmamalı,
 * çünkü ölçtüğü şey üretim kodunun maliyetidir, testin değil.
 *
 * Kayma riski düşük: montajın GERÇEK matematiği CORE'un `assembleRig`indedir ve
 * ikisi de onu kullanır. Buradaki kod yalnız konum/dönüş/ölçek taşıyan aptal
 * bir ağaçtır.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface HeadlessTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  parent: HeadlessContainer | null;
}

export interface HeadlessContainer extends HeadlessTransform {
  list: HeadlessTransform[];
  add(child: HeadlessTransform): void;
  setPosition(x: number, y: number): void;
  setDepth(depth: number): void;
  setScale(x: number, y?: number): void;
  destroy(): void;
}

interface HeadlessImage extends HeadlessTransform {
  texture: { key: string };
  frame: { name: string | number } | null;
  originX: number;
  originY: number;
  alpha: number;
  visible: boolean;
  tint: number;
  setOrigin(x: number, y: number): HeadlessImage;
  setScale(x: number, y?: number): HeadlessImage;
  setDepth(depth: number): HeadlessImage;
  setAlpha(alpha: number): HeadlessImage;
  setTint(tint: number): HeadlessImage;
  setVisible(visible: boolean): HeadlessImage;
  setPosition(x: number, y: number): HeadlessImage;
  setRotation(rotation: number): HeadlessImage;
  setTexture(key: string): HeadlessImage;
  setFrame(frame: string | number): HeadlessImage;
  destroy(): void;
  /** Poz örnekleyicinin beklediği yüzey: matris değil, ÇÖZÜMLEME. */
  getWorldTransformMatrix(): { decomposeMatrix(): DecomposedTransform };
}

interface DecomposedTransform {
  translateX: number;
  translateY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface HeadlessScene {
  textures: { exists(key: string): boolean };
  load: { image(key: string, url: string): void };
  add: {
    container(x: number, y: number): HeadlessContainer;
    image(x: number, y: number, key: string): HeadlessImage;
  };
  images: HeadlessImage[];
}

function createContainer(x: number, y: number): HeadlessContainer {
  const container: HeadlessContainer = {
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    parent: null,
    list: [],
    add(child) {
      child.parent = container;
      container.list.push(child);
    },
    setPosition(nextX, nextY) {
      container.x = nextX;
      container.y = nextY;
    },
    setDepth() {},
    setScale(scaleX, scaleY = scaleX) {
      container.scaleX = scaleX;
      container.scaleY = scaleY;
    },
    destroy() {
      container.list.length = 0;
    },
  };
  return container;
}

/** Dünya dönüşümünü ebeveyn zincirinden hesaplar — poz örnekleyicinin girdisi. */
function worldTransformOf(node: HeadlessTransform): DecomposedTransform {
  let x = 0;
  let y = 0;
  let rotation = 0;
  let scaleX = 1;
  let scaleY = 1;
  const chain: HeadlessTransform[] = [];
  for (let cursor: HeadlessTransform | null = node; cursor; cursor = cursor.parent) {
    chain.unshift(cursor);
  }
  for (const item of chain) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    x += (item.x * scaleX * cos - item.y * scaleY * sin) as number;
    y += (item.x * scaleX * sin + item.y * scaleY * cos) as number;
    rotation += item.rotation;
    scaleX *= item.scaleX;
    scaleY *= item.scaleY;
  }
  return { translateX: x, translateY: y, rotation, scaleX, scaleY };
}

function createImage(x: number, y: number, key: string): HeadlessImage {
  const image: HeadlessImage = {
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    parent: null,
    texture: { key },
    frame: null,
    originX: 0.5,
    originY: 0.5,
    alpha: 1,
    visible: true,
    tint: 0xffffff,
    setOrigin(originX, originY) {
      image.originX = originX;
      image.originY = originY;
      return image;
    },
    setScale(scaleX, scaleY = scaleX) {
      image.scaleX = scaleX;
      image.scaleY = scaleY;
      return image;
    },
    setDepth() {
      return image;
    },
    setAlpha(alpha) {
      image.alpha = alpha;
      return image;
    },
    setTint(tint) {
      image.tint = tint;
      return image;
    },
    setVisible(visible) {
      image.visible = visible;
      return image;
    },
    setPosition(nextX, nextY) {
      image.x = nextX;
      image.y = nextY;
      return image;
    },
    setRotation(rotation) {
      image.rotation = rotation;
      return image;
    },
    setTexture(key2) {
      image.texture = { key: key2 };
      return image;
    },
    setFrame(frame) {
      image.frame = { name: frame };
      return image;
    },
    destroy() {},
    getWorldTransformMatrix() {
      const decomposed = worldTransformOf(image);
      return { decomposeMatrix: () => decomposed };
    },
  };
  return image;
}

/** Gönderilen metadata — oyunun gerçekten yüklediği dosya. */
export function readShippedMetadata(): unknown {
  const path = resolve(import.meta.dirname, '../../src/assets/rig/arachnid.metadata.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function createHeadlessScene(textureKeys: readonly string[]): HeadlessScene {
  const keys = new Set(textureKeys);
  const images: HeadlessImage[] = [];
  return {
    textures: { exists: (key) => keys.has(key) },
    load: { image: (key) => keys.add(key) },
    add: {
      container: (x, y) => createContainer(x, y),
      image: (x, y, key) => {
        const image = createImage(x, y, key);
        images.push(image);
        return image;
      },
    },
    images,
  };
}
