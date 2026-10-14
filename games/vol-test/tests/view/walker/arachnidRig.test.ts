import { describe, expect, it } from 'vitest';
import { arachnidMetadata } from '@/config/rigAssets';
import { BODY_SHELL_PART_IDS, LIMB_CHAINS, SNOUT_PART_IDS } from '@/config/walkerRig';
import { prepareArachnidRig } from '@/view/walker/arachnidRig';
import {
  assembleArachnid,
  rigScene,
  worldPosition,
  type FakeContainer,
} from '../../support/rigScene';
import { ARACHNID_RIG } from '@/config/rigAssets';

const metadata = arachnidMetadata;

function assembleFixture() {
  return assembleArachnid(rigScene(ARACHNID_RIG));
}

/** Ölçülen eklem aralıkları (kaynak metadata). */
const LEG_BONES = { root: 36, upper: 54, lower: 72 };
/*
 * Arka uzuvlarda kaynak dizilim ters olduğu için aralıklar TERS sırada atanır ve SABİT kök kemik
 * yoktur: uzun kemik doğrudan IK çiftinin ilkidir, uçtaki küçük parça alt kemiğe dahildir (26 + 12).
 */
const TAIL_BONES = { root: 0, upper: 50, lower: 38 };

const EXPECTED_HIPS: Readonly<Record<string, readonly [number, number]>> = {
  r0: [34.41898, 34.00194],
  r1: [35.35214, 12.99755],
  r2: [35.99786, -3.95245],
  r3: [26.99513, -33.93008],
  l0: [-34.41102, 33.99806],
  l1: [-35.34786, 13.00245],
  l2: [-36.00214, -3.94755],
  l3: [-27.00487, -33.92992],
  // Arka uzuvlarda kalça, KÖK KEMİĞİN gövdeye bakan ucudur: kaynak zincirin en iç noktası değil.
  tl: [-20.63398, 48.17946],
  tr: [20.63672, 48.18474],
};

describe('prepareArachnidRig', () => {
  it('ölçülmüş gövde merkezi ile on uzuv ve gövde parça kümelerini üretir', () => {
    const rig = prepareArachnidRig(metadata, assembleFixture());

    expect(rig.bodyCenterX).toBeCloseTo(171.14, 5);
    expect(rig.bodyCenterY).toBeCloseTo(93, 5);
    expect(rig.limbs.map((limb) => limb.id)).toEqual(LIMB_CHAINS.map((spec) => spec.id));
    expect(rig.shellParts).toHaveLength(BODY_SHELL_PART_IDS.length);
    expect(rig.snoutParts).toHaveLength(SNOUT_PART_IDS.length);
    expect(rig.gazePart).toBeDefined();
  });

  it('her uzuvda üç kemiğin ölçülmüş uzunluklarını korur', () => {
    const rig = prepareArachnidRig(metadata, assembleFixture());

    for (const limb of rig.limbs) {
      const expected = limb.id.startsWith('t') ? TAIL_BONES : LEG_BONES;
      // Metadata konumları 0.01 px hassasiyetle yazıldığı için iki uçtan hesaplanan uzunluklarda
      // en fazla yüzdelik piksel yuvarlama payı vardır.
      expect(Math.abs(limb.rootLength - expected.root), `${limb.id} kök`).toBeLessThan(0.02);
      expect(Math.abs(limb.upperLength - expected.upper), `${limb.id} üst`).toBeLessThan(0.02);
      expect(Math.abs(limb.lowerLength - expected.lower), `${limb.id} alt`).toBeLessThan(0.02);
    }
  });

  it('kalça noktalarını gövde merkezine göre ölçer', () => {
    const rig = prepareArachnidRig(metadata, assembleFixture());

    for (const limb of rig.limbs) {
      const expected = EXPECTED_HIPS[limb.id];
      expect(limb.hipX, `${limb.id} kalça x`).toBeCloseTo(expected[0], 4);
      expect(limb.hipY, `${limb.id} kalça y`).toBeCloseTo(expected[1], 4);
      const chainStart = limb.root ?? limb.upper;
      expect(chainStart.x).toBeCloseTo(limb.hipX, 5);
      expect(chainStart.y).toBeCloseTo(limb.hipY, 5);
    }
  });

  it('her uzvun bilek gibi davranan bir uç parçası vardır', () => {
    const rig = prepareArachnidRig(metadata, assembleFixture());

    for (const limb of rig.limbs) expect(limb.tip, `${limb.id} uç parça`).not.toBeNull();
  });

  it('ters dizilmiş arka zinciri KALINDAN İNCEYE yeniden kurar', () => {
    const rig = prepareArachnidRig(metadata, assembleFixture());

    for (const id of ['tl', 'tr']) {
      const limb = rig.limbs.find((item) => item.id === id);
      if (!limb) throw new Error(`${id} uzvu yok`);
      // Sabit kök YOKTUR: uzun kemik doğrudan IK çiftinin ilkidir, yoksa ayak duruş ekseni
      // boyunca gidip gelirken uzuv salınmaz, sürüklenir.
      expect(limb.root, id).toBeNull();
      expect(limb.rootLength, id).toBe(0);
      // Kalın çubuk (`tail_upper`) gövdede, ince uç ayakta.
      expect(limb.upperLength, id).toBeGreaterThan(limb.lowerLength);
      // Uzuv fiziksel boyunu korur: kaynak aralıkların toplamı değişmez.
      expect(limb.upperLength + limb.lowerLength).toBeCloseTo(88, 0);
      // Zincir kopuk değildir: her kemik bir öncekinin ucuna oturur.
      expect(limb.upper.x, `${id} kalça`).toBeCloseTo(limb.hipX, 6);
      expect(limb.upper.y).toBeCloseTo(limb.hipY, 6);
      expect(limb.lower.x, `${id} alt kemik`).toBeCloseTo(limb.upperLength, 6);
      expect(limb.lower.y).toBeCloseTo(0, 9);
      expect(limb.tip, id).not.toBeNull();
    }
  });

  it('ara kemikleri ZİNCİRE bağlar: üst kemiği döndürmek alt kemiği taşır', () => {
    const rig = prepareArachnidRig(metadata, assembleFixture());
    const limb = rig.limbs[0];

    const before = worldPosition(limb.lower as never);
    limb.upper.rotation += Math.PI / 2;
    const after = worldPosition(limb.lower as never);

    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(1);
  });

  it('pivotları eklem taşırken görünür çocukların dünya konumunu bozmaz', () => {
    const assembled = assembleFixture();
    // Yeniden kurulan zincirler bu kuralın DIŞINDADIR: onlarda parça konumları bilerek yeniden
    // yazılır (bkz. `sourceChainReversed`).
    const trackedIds = LIMB_CHAINS.filter((spec) => !spec.sourceChainReversed).flatMap((spec) =>
      [spec.shoulderPartId, spec.upperPartId, spec.lowerPartId, spec.tipPartId].filter(
        (id): id is string => id !== null,
      ),
    );
    const tracked = trackedIds.flatMap((partId) => {
      const pivot = assembled.parts.get(partId) as unknown as FakeContainer;
      return pivot.list
        .filter((child) => child.kind !== 'container')
        .map((child) => ({ child, before: worldPosition(child), partId }));
    });

    const rig = prepareArachnidRig(metadata, assembled);
    const rootSize = metadata.source.rootSizePx;
    if (!rootSize) throw new Error('metadata rootSizePx taşımıyor');
    const shiftX = rootSize.width / 2 - rig.bodyCenterX;
    const shiftY = rootSize.height / 2 - rig.bodyCenterY;

    expect(tracked.length).toBeGreaterThan(0);
    for (const { child, before, partId } of tracked) {
      const after = worldPosition(child);
      expect(after.x, `${partId} çocuk x`).toBeCloseTo(before.x + shiftX, 7);
      expect(after.y, `${partId} çocuk y`).toBeCloseTo(before.y + shiftY, 7);
    }
  });

  it('kök container döndüğünde parçaların dünya dönüşümü birlikte döner', () => {
    const assembled = assembleFixture();
    const part = assembled.parts.get('abdomen_shell');
    if (!part) throw new Error('abdomen_shell parçası yok');
    const before = worldPosition(part as never);

    assembled.container.rotation = Math.PI / 3;
    const after = worldPosition(part as never);

    // Konum kök etrafında döner: yarıçap korunur.
    expect(Math.hypot(after.x, after.y)).toBeCloseTo(Math.hypot(before.x, before.y), 6);
  });
});
