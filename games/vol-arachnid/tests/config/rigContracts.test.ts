import { describe, expect, it } from 'vitest';
import { arenaConfig } from '@/config/arena';
import { bodyMotionConfig } from '@/config/bodyMotion';
import { playerConfig } from '@/config/player';
import { arachnidUiConfig } from '@/config/ui';
import { fxConfig, FX_DEPTH } from '@/config/fx';
import { gaitConfig } from '@/config/gait';
import {
  ARACHNID_ARTICULATION,
  BODY_SHELL_PART_IDS,
  GAZE_PART_ID,
  LIMB_CHAINS,
  SNOUT_PART_IDS,
} from '@/config/rig';
import { arachnidTestMetadata as metadata } from '../support/phaserFakes';

const partIds = new Set(metadata.parts.map((part) => part.partId));

describe('rig şeması', () => {
  it('her uzuv zinciri gerçek parçalara işaret eder', () => {
    for (const chain of LIMB_CHAINS) {
      for (const partId of [
        chain.shoulderPartId,
        chain.upperPartId,
        chain.lowerPartId,
        chain.tipPartId,
      ]) {
        if (partId === null) continue;
        expect(partIds.has(partId), partId).toBe(true);
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

    // Zincirin KÖKÜ dışındaki her kemik bir ebeveyne bağlanmış olmalı; aksi
    // halde o kemik export pozunda donar ve uzuv kopuk görünür.
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
    const orphans = metadata.parts
      .map((part) => part.partId)
      .filter((partId) => /_joint|_femur_hi/.test(partId))
      .filter((partId) => !(partId in ARACHNID_ARTICULATION));

    expect(orphans).toEqual([]);
  });
});

describe('duruş tablosu', () => {
  it('her uzuv için tanımlıdır ve fazlası yoktur', () => {
    expect(Object.keys(gaitConfig.stance).sort()).toEqual(
      LIMB_CHAINS.map((chain) => chain.id).sort(),
    );
  });

  it('sağ ve sol taraf birebir aynalıdır', () => {
    for (const chain of LIMB_CHAINS) {
      const mirrorId = chain.id.startsWith('t')
        ? `t${chain.id[1] === 'l' ? 'r' : 'l'}`
        : `${chain.id[0] === 'l' ? 'r' : 'l'}${chain.id.slice(1)}`;
      const stance = gaitConfig.stance[chain.id];
      const mirror = gaitConfig.stance[mirrorId];

      expect(mirror, mirrorId).toBeDefined();
      expect(stance.angleDeg, chain.id).toBeCloseTo(-mirror.angleDeg, 9);
      expect(stance.bendSign, chain.id).toBe(-mirror.bendSign);
      expect(stance.group, chain.id).not.toBe(mirror.group);
      expect(stance.reach, chain.id).toBeCloseTo(mirror.reach, 9);
    }
  });

  it('adım grupları eşit büyüklüktedir; gövde her an desteklidir', () => {
    const counts = new Map<number, number>();
    for (const stance of Object.values(gaitConfig.stance)) {
      counts.set(stance.group, (counts.get(stance.group) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([0, 1]);
    expect(counts.get(0)).toBe(counts.get(1));
  });

  it('erişim oranları uzuv uzunluğunun içinde kalır', () => {
    for (const [id, stance] of Object.entries(gaitConfig.stance)) {
      const widest =
        stance.reach + Math.max(0, stance.dashReachDelta) + Math.max(0, stance.pushReachGain);
      expect(widest, id).toBeLessThan(1);
      expect(stance.reach, id).toBeGreaterThan(0.5);
    }
  });

  it('acil adım eşiği normal tetiğin üstündedir', () => {
    expect(gaitConfig.runStepTriggerPx).toBeGreaterThan(gaitConfig.stepTriggerPx);
    expect(gaitConfig.runStepDurationMs).toBeLessThan(gaitConfig.stepDurationMs);

    /*
     * Tam tempoda bekleyen bir uzvun en kötü gerginliği: tetik + SIRA boyunca
     * kat edilen yol. Sıra tek bir adım kadar sürmez — bir gruptaki uzuvlar
     * kaymalı başlar ve sıra sonuncusu inince biter, pratikte ~iki adım.
     * Eşik bunun altına inerse sıra disiplini düz yürüyüşte delinir.
     */
    const TURN_STEP_SPAN = 2;
    const worstWalkingStrain =
      gaitConfig.runStepTriggerPx +
      (TURN_STEP_SPAN * gaitConfig.fullTempoSpeedPxPerSec * gaitConfig.runStepDurationMs) / 1000;
    expect(gaitConfig.emergencyStrainPx).toBeGreaterThan(worstWalkingStrain);
  });

  it('kök payı yalnız SABİT kök kemiği olan uzuvlarda tanımlıdır', () => {
    for (const [id, stance] of Object.entries(gaitConfig.stance)) {
      const isPusher = id.startsWith('t');
      if (isPusher) {
        // Arka uzuvlarda kök kemik doğrudan IK çiftinin ilkidir; sabit bir
        // kök payı olsaydı o uzun kemik hiç dönmez, uzuv sürüklenirdi.
        expect(stance.rootFollow, id).toBeUndefined();
        expect(stance.rootYawLimitDeg, id).toBeUndefined();
        continue;
      }
      expect(stance.rootFollow, id).toBeGreaterThan(0);
      expect(stance.rootFollow, id).toBeLessThanOrEqual(1);
      expect(stance.rootYawLimitDeg, id).toBeGreaterThan(0);
    }
  });

  it('gövde yalpası ile dönüş tavanı aynı ölçeği paylaşır', () => {
    // Yalpa sinyali dönüş hızını [-1,1] aralığına indirger; ölçek tavandan
    // ayrışırsa sinyal ya hiç doymaz ya erkenden kırpılır.
    expect(bodyMotionConfig.turnVelocityForMaxRadPerSec).toBe(playerConfig.maxTurnRateRadPerSec);
  });

  it('duvar çarpma eşiği yürüyüş hızının üstündedir', () => {
    // Altında kalırsa duvara doğru basılı tutulan tuş sürekli sekme üretir.
    expect(playerConfig.wall.impactSpeedPxPerSec).toBeGreaterThan(playerConfig.maxSpeed);
    expect(playerConfig.wall.impactSpeedPxPerSec).toBeLessThan(playerConfig.dash.speedPxPerSec);
  });

  it('dokunmatik bölge oranı ekranı gerçekten böler', () => {
    expect(arachnidUiConfig.touch.dashZoneWidthRatio).toBeGreaterThan(0);
    expect(arachnidUiConfig.touch.dashZoneWidthRatio).toBeLessThan(1);
    expect(arachnidUiConfig.touch.edgeInsetPx).toBeGreaterThanOrEqual(0);
  });
});

describe('arena ve efekt yapılandırması', () => {
  it('gövde yarıçapı arenanın içinde kalır ve boşluklar pozitiftir', () => {
    expect(arenaConfig.bodyRadiusPx).toBeGreaterThan(0);
    expect(arenaConfig.bodyRadiusPx).toBeLessThan(
      Math.min(arenaConfig.widthPx, arenaConfig.heightPx) / 2,
    );
    for (const value of Object.values(arenaConfig.viewportGutterPx)) {
      expect(value).toBeGreaterThan(0);
    }
    expect(arenaConfig.fitMargin).toBeGreaterThan(0);
    expect(arenaConfig.fitMargin).toBeLessThanOrEqual(1);
  });

  it('efekt derinlikleri rig ile arena arasına sıralanır', () => {
    expect(FX_DEPTH.shadow).toBeLessThan(FX_DEPTH.ghost);
    expect(FX_DEPTH.ghost).toBeLessThan(FX_DEPTH.dust);
    expect(FX_DEPTH.dust).toBeLessThan(0);
    expect(fxConfig.shadow.depth).toBe(FX_DEPTH.shadow);
    expect(fxConfig.ghostTrail.depth).toBe(FX_DEPTH.ghost);
    expect(fxConfig.dust.depth).toBe(FX_DEPTH.dust);
  });

  it('toz eşiği tam ölçek hızının altındadır', () => {
    expect(fxConfig.dust.minSpeedPxPerSec).toBeLessThan(fxConfig.dust.fullSpeedPxPerSec);
    expect(fxConfig.dust.countMin).toBeLessThanOrEqual(fxConfig.dust.countMax);
  });
});
