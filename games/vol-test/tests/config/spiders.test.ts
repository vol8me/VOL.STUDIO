import { describe, expect, it } from 'vitest';
import { SPIDER_LOOKS, SPIDER_PARTS } from '@/config/spiders';
import { VEHICLES, WALKER_IDS, type WalkerSpec } from '@/config/vehicles';

describe.each(WALKER_IDS.map((id) => [id, SPIDER_LOOKS[id], VEHICLES[id] as WalkerSpec] as const))(
  'SpiderLook (%s)',
  (_id, look, spec) => {
    it('her parçanın kutusu geçerli ve eklem merkezi kutunun içindedir', () => {
      for (const part of SPIDER_PARTS) {
        const box = look.parts[part];
        expect(box.width, part).toBeGreaterThan(0);
        expect(box.height, part).toBeGreaterThan(0);
        expect(box.pivotX, part).toBeGreaterThanOrEqual(0);
        expect(box.pivotX, part).toBeLessThanOrEqual(box.width);
        expect(box.pivotY, part).toBeGreaterThanOrEqual(0);
        expect(box.pivotY, part).toBeLessThanOrEqual(box.height);
      }
    });

    it('gölge parçaları gövde parçalarıyla aynı kutu ve merkezdedir', () => {
      expect(look.parts['thorax-shadow']).toEqual(look.parts.thorax);
      expect(look.parts['abdomen-shadow']).toEqual(look.parts.abdomen);
    });

    it('kemik boyları parça kutusuna sığar (femur ve tibia çizimin uzunluğudur)', () => {
      expect(look.parts.femur.width - look.parts.femur.pivotX).toBeGreaterThan(look.leg.femur);
      expect(look.parts.tibia.width - look.parts.tibia.pivotX).toBeGreaterThan(look.leg.tibia);
    });

    it('yürüyüş erişimin içindedir: dinlenme mesafesi ve adım payı kemik erişimini aşmaz', () => {
      const limit = Math.sqrt((look.leg.femur + look.leg.tibia) ** 2 - look.body.hipHeight ** 2);
      const excursion =
        look.gait.runStepTriggerPx +
        look.gait.fullTempoSpeed * (look.gait.runStepDurationMs / 1000);
      expect(look.leg.restDistance + excursion).toBeLessThan(limit);
      expect(look.gait.emergencyStrainPx).toBeGreaterThan(look.gait.stepTriggerPx);
    });

    it('dört kalça önden arkaya sıralıdır ve açılar öne bakandan arkaya bakana dizilir', () => {
      expect(look.hips).toHaveLength(4);
      for (let i = 1; i < look.hips.length; i++) {
        expect(look.hips[i].x).toBeLessThan(look.hips[i - 1].x);
        expect(look.hips[i].angleDeg).toBeGreaterThan(look.hips[i - 1].angleDeg);
      }
    });

    it('toplar simetrik omuz yuvalarındadır ve mil ile ağız çizimden gelir', () => {
      const { mounts, pivot, salvo } = spec.armament;
      expect(mounts).toHaveLength(2);
      expect(salvo).toEqual([[0], [1]]);
      expect(mounts[0].y).toBe(-mounts[1].y);
      expect(mounts[0].x).toBe(mounts[1].x);
      expect(pivot).toEqual({ x: mounts[0].x, y: 0 });
      for (const mount of mounts) expect(mount.reach).toBe(look.cannon.muzzleX);
      const barrels = look.parts['cannon-barrels'];
      expect(look.cannon.muzzleX).toBeLessThan(barrels.width);
      expect(look.cannon.coilX).toBeLessThan(look.cannon.muzzleX);
    });

    it('yuva göğüs kabuğunun üstüne oturur, ağız kabuğun önüne taşar', () => {
      const thoraxFront = look.body.thoraxX + (look.parts.thorax.width - look.parts.thorax.pivotX);
      const mount = spec.armament.mounts[0];
      expect(mount.x).toBeGreaterThan(look.body.thoraxX - 4);
      expect(mount.x).toBeLessThan(thoraxFront);
      expect(mount.x + mount.reach).toBeGreaterThan(thoraxFront);
    });
  },
);

describe('iki örümcek ayrışır', () => {
  it('silüet, bacak ve silah farklıdır: Widow uzun ve yüksek, Arachnid kısa ve alçak', () => {
    const arachnid = SPIDER_LOOKS.arachnid;
    const widow = SPIDER_LOOKS.widow;
    expect(widow.body.hipHeight).toBeGreaterThan(arachnid.body.hipHeight);
    expect(widow.leg.femur + widow.leg.tibia).toBeGreaterThan(
      arachnid.leg.femur + arachnid.leg.tibia,
    );
    expect(widow.parts.abdomen.width).toBeGreaterThan(arachnid.parts.abdomen.width);
    expect(widow.parts.thorax.width).toBeLessThan(arachnid.parts.thorax.width);
    expect(widow.cannon.glow).not.toBe(arachnid.cannon.glow);
  });
});
