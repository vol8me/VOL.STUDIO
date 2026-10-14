import { describe, expect, it } from 'vitest';
import { arachnidMetadata, plasmaCannonMetadata } from '@/config/rigAssets';
import { ARACHNID } from '@/config/vehicles';
import {
  ARACHNID_ARTICULATION,
  BODY_SHELL_PART_IDS,
  GAZE_PART_ID,
  LIMB_CHAINS,
  PLASMA_CANNON_PARTS,
  SNOUT_PART_IDS,
} from '@/config/walkerRig';
import { BODY_MOTION, CANNON_MUZZLE_PX, GAIT, WALKER_ART, WORLD_TO_ART } from '@/config/walkerView';

const partIds = new Set(arachnidMetadata.parts.map((part) => part.partId));

describe('rig şeması', () => {
  it('her uzuv zinciri ve gövde kümesi gerçek parçalara işaret eder', () => {
    for (const chain of LIMB_CHAINS) {
      for (const partId of [
        chain.shoulderPartId,
        chain.upperPartId,
        chain.lowerPartId,
        chain.tipPartId,
      ]) {
        if (partId !== null) expect(partIds.has(partId), partId).toBe(true);
      }
    }
    for (const partId of [...BODY_SHELL_PART_IDS, ...SNOUT_PART_IDS, GAZE_PART_ID]) {
      expect(partIds.has(partId), partId).toBe(true);
    }
  });

  it('eklem şeması var olan parçaları bağlar ve kemikleri kardeş bırakmaz', () => {
    for (const [child, parent] of Object.entries(ARACHNID_ARTICULATION)) {
      expect(partIds.has(child), child).toBe(true);
      expect(partIds.has(parent), parent).toBe(true);
      expect(child).not.toBe(parent);
    }
    // Zincirin KÖKÜ dışındaki her kemik bir ebeveyne bağlı olmalı; yoksa export pozunda donar.
    for (const chain of LIMB_CHAINS) {
      expect(ARACHNID_ARTICULATION[chain.upperPartId], chain.id).toBe(chain.shoulderPartId);
      expect(ARACHNID_ARTICULATION[chain.lowerPartId], chain.id).toBe(chain.upperPartId);
      if (chain.tipPartId) {
        expect(ARACHNID_ARTICULATION[chain.tipPartId], chain.id).toBe(chain.lowerPartId);
      }
      expect(ARACHNID_ARTICULATION[chain.shoulderPartId]).toBeUndefined();
    }
  });

  it('kaynaktaki her yardımcı parça (eklem diski, parlama) bir kemiğe bağlıdır', () => {
    const orphans = arachnidMetadata.parts
      .map((part) => part.partId)
      .filter((partId) => /_joint|_femur_hi/.test(partId))
      .filter((partId) => !(partId in ARACHNID_ARTICULATION));
    expect(orphans).toEqual([]);
  });

  it('plazma topu parçaları metadata içinde var ve eklem zinciri kendi içinde taşınır', () => {
    const ids = new Map(plasmaCannonMetadata.parts.map((part) => [part.partId, part]));
    for (const partId of Object.values(PLASMA_CANNON_PARTS)) {
      expect(ids.has(partId), partId).toBe(true);
    }
    expect(ids.get(PLASMA_CANNON_PARTS.pivot)?.parentPartId ?? null).toBeNull();
    expect(ids.get(PLASMA_CANNON_PARTS.barrel)?.parentPartId).toBe(PLASMA_CANNON_PARTS.pivot);
  });

  it('yuvanın reach değeri top resminin ağız mesafesinin ölçeklenmişidir', () => {
    // Çizilen namlu ucu ile mermi çıkışı aynı noktada olmalı (bkz. `sim/muzzle`).
    const prong = plasmaCannonMetadata.parts.find((part) => part.partId === 'muzzle_prong_u');
    const housing = plasmaCannonMetadata.parts.find(
      (part) => part.partId === PLASMA_CANNON_PARTS.pivot,
    );
    if (!prong?.positionPx || !housing?.positionPx) throw new Error('metadata eksik');
    const tipPx = prong.positionPx.x + prong.logicalSizePx.width;
    const pivotPx = housing.positionPx.x + housing.logicalSizePx.width / 2;
    expect(tipPx - pivotPx).toBe(CANNON_MUZZLE_PX);
    for (const mount of ARACHNID.armament.mounts) {
      expect(mount.reach).toBeCloseTo(CANNON_MUZZLE_PX * WALKER_ART.cannonScale, 1);
    }
  });
});

describe('duruş tablosu', () => {
  const stances = Object.entries(GAIT.stance);

  it('her uzuv için tanımlıdır ve fazlası yoktur', () => {
    expect(Object.keys(GAIT.stance).sort()).toEqual(LIMB_CHAINS.map((chain) => chain.id).sort());
  });

  it('sağ ve sol taraf birebir aynalıdır', () => {
    for (const chain of LIMB_CHAINS) {
      const mirrorId = chain.id.startsWith('t')
        ? `t${chain.id[1] === 'l' ? 'r' : 'l'}`
        : `${chain.id[0] === 'l' ? 'r' : 'l'}${chain.id.slice(1)}`;
      const stance = GAIT.stance[chain.id];
      const mirror = GAIT.stance[mirrorId];
      expect(mirror, mirrorId).toBeDefined();
      expect(stance.angleDeg, chain.id).toBeCloseTo(-mirror.angleDeg, 9);
      expect(stance.bendSign, chain.id).toBe(-mirror.bendSign);
      expect(stance.group, chain.id).not.toBe(mirror.group);
      expect(stance.reach, chain.id).toBeCloseTo(mirror.reach, 9);
    }
  });

  it('adım grupları eşit büyüklüktedir; gövde her an desteklidir', () => {
    const counts = new Map<number, number>();
    for (const [, stance] of stances) {
      counts.set(stance.group, (counts.get(stance.group) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([0, 1]);
    expect(counts.get(0)).toBe(counts.get(1));
  });

  it('erişim oranları uzuv uzunluğunun içinde kalır; katlanma tabanı erişimin altındadır', () => {
    for (const [id, stance] of stances) {
      const widest =
        stance.reach + Math.max(0, stance.dashReachDelta) + Math.max(0, stance.pushReachGain);
      expect(widest, id).toBeLessThan(1);
      expect(stance.reach, id).toBeGreaterThan(0.5);
      expect(stance.minReach, id).toBeGreaterThan(0);
      expect(stance.minReach, id).toBeLessThan(stance.reach);
    }
  });

  it('BACAKLARIN katlanma tabanı kuyruklardan yüksektir', () => {
    const legs = stances.filter(([id]) => !id.startsWith('t')).map(([, s]) => s.minReach);
    const tails = stances.filter(([id]) => id.startsWith('t')).map(([, s]) => s.minReach);
    expect(legs).toHaveLength(8);
    expect(tails).toHaveLength(2);
    expect(Math.min(...legs)).toBeGreaterThan(Math.max(...tails));
  });

  it('koşu adımı normalden kısa ve geniştir; acil eşik koşu tetiğinin üstündedir', () => {
    expect(GAIT.runStepTriggerPx).toBeGreaterThan(GAIT.stepTriggerPx);
    expect(GAIT.runStepDurationMs).toBeLessThan(GAIT.stepDurationMs);
    expect(GAIT.emergencyStrainPx).toBeGreaterThan(GAIT.runStepTriggerPx);
  });

  it('kök payı yalnız SABİT kök kemiği olan uzuvlarda tanımlıdır', () => {
    for (const [id, stance] of stances) {
      if (id.startsWith('t')) {
        expect(stance.rootFollow, id).toBeUndefined();
        expect(stance.rootYawLimitDeg, id).toBeUndefined();
        continue;
      }
      expect(stance.rootFollow, id).toBeGreaterThan(0);
      expect(stance.rootFollow, id).toBeLessThanOrEqual(1);
      expect(stance.rootYawLimitDeg, id).toBeGreaterThan(0);
    }
  });
});

describe('sunum ölçüleri araç fiziğiyle tutarlıdır', () => {
  it('yürüyüş tavanı sanat uzayında yürüyüş döngüsünün kapasitesinin altındadır', () => {
    expect(GAIT.fullTempoSpeedPxPerSec).toBeCloseTo(ARACHNID.walker.maxSpeed * WORLD_TO_ART, 6);
    // Ölçülen kapasite: ~475 px/s'de acil adım başlar (ArachnidLegs.test.ts).
    expect(GAIT.fullTempoSpeedPxPerSec).toBeLessThan(475);
  });

  it('gövde yalpası dönüş tavanıyla aynı ölçeği paylaşır', () => {
    expect(BODY_MOTION.turnVelocityForMaxRadPerSec).toBe(ARACHNID.walker.maxTurnRate);
  });

  it('çömelme ve uyanıklık eşikleri tavanın altındadır', () => {
    expect(BODY_MOTION.standSpeedPxPerSec).toBeLessThan(GAIT.fullTempoSpeedPxPerSec);
    expect(BODY_MOTION.gaze.alertSpeedPxPerSec).toBeLessThan(GAIT.fullTempoSpeedPxPerSec);
  });

  it('çarpışan gövde çizilen kabuğun içinde kalır', () => {
    const shellUnits = 140 * WALKER_ART.scale;
    expect(ARACHNID.walker.halfLength * 2).toBeLessThanOrEqual(shellUnits + 1);
  });
});
