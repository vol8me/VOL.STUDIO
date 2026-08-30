import { describe, expect, it } from 'vitest';
import {
  assembleRig,
  buildRigDefinition,
  validateRigMetadata,
  type AssembledRig,
  type RigDefinition,
} from '@volstudio/pen.dev';
import arachnidMetadataRaw from '../../../../../devtools/pen.dev/pen_export/enemies/arachnid/metadata/arachnid.metadata.json';
import { BODY_PART_IDS, LEG_IDS, TAIL_IDS, prepareArachnidRig } from '@/runtime/rig/arachnidRig';

interface FakeTransform {
  x: number;
  y: number;
  rotation: number;
  parent: FakeContainer | null;
}

interface FakeContainer extends FakeTransform {
  list: FakeTransform[];
  add(child: FakeTransform): void;
}

interface FakeImage extends FakeTransform {
  key: string;
  scale: number;
  setScale(value: number): void;
}

const metadata = validateRigMetadata(arachnidMetadataRaw, 'arachnid test metadata');

function createHarness(definition: RigDefinition): { scene: unknown; transforms: FakeTransform[] } {
  const textureKeys = new Set(definition.parts.map((part) => part.textureKey));
  const transforms: FakeTransform[] = [];

  const scene = {
    textures: { exists: (key: string) => textureKeys.has(key) },
    add: {
      container: (x: number, y: number): FakeContainer => {
        const container: FakeContainer = {
          x,
          y,
          rotation: 0,
          parent: null,
          list: [],
          add(child) {
            child.parent = this;
            this.list.push(child);
          },
        };
        transforms.push(container);
        return container;
      },
      image: (x: number, y: number, key: string): FakeImage => {
        const image: FakeImage = {
          x,
          y,
          key,
          rotation: 0,
          parent: null,
          scale: 1,
          setScale(value) {
            this.scale = value;
          },
        };
        transforms.push(image);
        return image;
      },
    },
  };

  return { scene, transforms };
}

function assembleFixture(): AssembledRig {
  const urls = Object.fromEntries(
    metadata.parts.map((part) => [`/parts/${part.partId}.png`, `/mock/${part.partId}.png`]),
  );
  const definition = buildRigDefinition(metadata, urls);
  const harness = createHarness(definition);
  return assembleRig(harness.scene as never, definition);
}

function worldPosition(transform: FakeTransform): { x: number; y: number } {
  let x = transform.x;
  let y = transform.y;
  let parent = transform.parent;

  while (parent) {
    const cos = Math.cos(parent.rotation);
    const sin = Math.sin(parent.rotation);
    const nextX = parent.x + x * cos - y * sin;
    const nextY = parent.y + x * sin + y * cos;
    x = nextX;
    y = nextY;
    parent = parent.parent;
  }

  return { x, y };
}

const EXPECTED_HIPS = {
  r0: [34.41898, 34.00194],
  r1: [35.35214, 12.99755],
  r2: [35.99786, -3.95245],
  r3: [26.99513, -33.93008],
  l0: [-34.41102, 33.99806],
  l1: [-35.34786, 13.00245],
  l2: [-36.00214, -3.94755],
  l3: [-27.00487, -33.92992],
} as const;

describe('prepareArachnidRig', () => {
  it('ölçülmüş gövde merkezi ile sekiz bacak ve iki arka uzuv üretir', () => {
    const rig = prepareArachnidRig(metadata, assembleFixture());

    expect(rig.bodyCenterX).toBeCloseTo(171.14, 5);
    expect(rig.bodyCenterY).toBeCloseTo(93, 5);
    expect(rig.legs.map((leg) => leg.id)).toEqual(LEG_IDS);
    expect(rig.tails.map((tail) => tail.id)).toEqual(TAIL_IDS);
    expect(rig.bodyParts).toHaveLength(BODY_PART_IDS.length);
  });

  it('tüm bacaklarda ölçülmüş 90/72 px kemik uzunluklarını korur', () => {
    const rig = prepareArachnidRig(metadata, assembleFixture());

    for (const leg of rig.legs) {
      // Metadata konumları 0.01 px hassasiyetle yazıldığı için iki uçtan
      // hesaplanan uzunluklarda en fazla yüzdelik piksel yuvarlama payı vardır.
      expect(Math.abs(leg.upperLength - 90), `${leg.id} üst kemik`).toBeLessThan(0.01);
      expect(Math.abs(leg.lowerLength - 72), `${leg.id} alt kemik`).toBeLessThan(0.01);
    }
  });

  it('kalça noktalarını gövde merkezine göre ölçer ve sol/sağ bükümü aynalar', () => {
    const rig = prepareArachnidRig(metadata, assembleFixture());

    for (const leg of rig.legs) {
      const expected = EXPECTED_HIPS[leg.id as keyof typeof EXPECTED_HIPS];
      expect(leg.hipX, `${leg.id} kalça x`).toBeCloseTo(expected[0], 4);
      expect(leg.hipY, `${leg.id} kalça y`).toBeCloseTo(expected[1], 4);
      expect(leg.bendSign).toBe(leg.id.startsWith('l') ? -1 : 1);
      expect(leg.upper.x).toBeCloseTo(leg.hipX, 5);
      expect(leg.upper.y).toBeCloseTo(leg.hipY, 5);
    }
  });

  it('pivotları ekleme taşırken görünür çocukların dünya konumunu bozmaz', () => {
    const assembled = assembleFixture();
    const pivotIds = [
      ...LEG_IDS.flatMap((id) => [`leg_${id}_coxa`, `leg_${id}_tibia`]),
      ...TAIL_IDS.map((id) => `tail_${id}_tail_upper`),
    ];
    const tracked = pivotIds.flatMap((partId) => {
      const pivot = assembled.parts.get(partId) as unknown as FakeContainer;
      return pivot.list.map((child) => ({ child, before: worldPosition(child), partId }));
    });

    const rig = prepareArachnidRig(metadata, assembled);
    const rootSize = metadata.source.rootSizePx;
    if (!rootSize) throw new Error('test metadata rootSizePx taşımıyor');
    const shiftX = rootSize.width / 2 - rig.bodyCenterX;
    const shiftY = rootSize.height / 2 - rig.bodyCenterY;

    for (const { child, before, partId } of tracked) {
      const after = worldPosition(child);
      expect(after.x, `${partId} çocuk x`).toBeCloseTo(before.x + shiftX, 7);
      expect(after.y, `${partId} çocuk y`).toBeCloseTo(before.y + shiftY, 7);
    }
  });
});
