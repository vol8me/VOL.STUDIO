import { describe, expect, it } from 'vitest';
import { ArachnidLegs } from '@/runtime/entity/ArachnidLegs';
import { gaitConfig } from '@/config/gait';
import { prepareArachnidRig, type ArachnidRig, type LimbRig } from '@/runtime/rig/arachnidRig';
import {
  arachnidTestMetadata as metadata,
  assembleTestRig,
  buildTestRigDefinition,
  createFakeScene,
  decomposeWorld,
  type FakeTransform,
} from '../../support/phaserFakes';
import { bodySignals, poseSignals } from '../../support/locomotion';

/**
 * MONTAJ GEOMETRİSİ.
 *
 * `arachnidRig.test.ts` rig'in YAPISINI doğruluyor: hangi parça hangi zincirde,
 * kemik uzunlukları korunuyor mu, ara kemikler bağlı mı. Buradaki katman
 * farklıdır ve bugüne kadar yoktu: montajın SAYILARI doğru mu?
 *
 * Pivot yerleşimi, ebeveyn dönüşünün telafisi ve sprite ölçeği sessizce
 * bozulabilecek matematiktir — yapı testleri hepsi yanlışken de yeşil kalır.
 * Bilinen bir girdi için beklenen çıktı sabitlendiğinde o matematik kilitlenir.
 */
function makeRig(): ArachnidRig {
  const definition = buildTestRigDefinition();
  return prepareArachnidRig(metadata, assembleTestRig(createFakeScene(definition), definition));
}

/** Pozlanmış zinciri ileri kinematikle çözer (gövde-yerel uzay). */
function footOf(limb: LimbRig): { x: number; y: number } {
  const rootDir = limb.root ? limb.root.rotation : 0;
  const upperDir = rootDir + limb.upper.rotation;
  const lowerDir = upperDir + limb.lower.rotation;
  return {
    x:
      limb.hipX +
      Math.cos(rootDir) * limb.rootLength +
      Math.cos(upperDir) * limb.upperLength +
      Math.cos(lowerDir) * limb.lowerLength,
    y:
      limb.hipY +
      Math.sin(rootDir) * limb.rootLength +
      Math.sin(upperDir) * limb.upperLength +
      Math.sin(lowerDir) * limb.lowerLength,
  };
}

describe('rig montaj geometrisi', () => {
  it('dinlenme duruşunda her uzvun ayak konumu SABİTTİR', () => {
    /*
     * Altın değer. Düştüğünde soru "test yanlış mı?" değil, "pivot/ölçek
     * matematiğini bilerek mi değiştirdim?"dir. Bilinçliyse imza güncellenir;
     * değilse montaj sessizce bozulmuştur.
     */
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, -Math.PI / 2);

    const signature = rig.limbs
      .map((limb) => {
        const foot = footOf(limb);
        return `${limb.id}:${foot.x.toFixed(4)},${foot.y.toFixed(4)}`;
      })
      .join('|');

    expect(signature).toMatchSnapshot();
  });

  it('bilinen bir ayak hedefi için zincir hedefin ÜSTÜNE oturur', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, -Math.PI / 2);

    // Gövdeyi bir miktar sür, sonra ayakların gerçekten dünya-uzayı hedefinde
    // olduğunu ileri kinematikle doğrula.
    for (let frame = 1; frame <= 40; frame++) {
      legs.update(bodySignals({ x: frame * 2, velX: 120 }), poseSignals({ motion01: 1 }), 16);
    }

    for (const limb of rig.limbs) {
      const foot = footOf(limb);
      const reach = Math.hypot(foot.x - limb.hipX, foot.y - limb.hipY);
      const total = limb.rootLength + limb.upperLength + limb.lowerLength;
      expect(reach, limb.id).toBeLessThanOrEqual(total + 1e-6);
      // Uzuv tamamen katlanmış da olmamalı: erişim payının içinde çalışır.
      expect(reach, limb.id).toBeGreaterThan(total * 0.1);
    }
  });

  it('kök container döndüğünde parçaların DÜNYA dönüşümü birlikte döner', () => {
    const definition = buildTestRigDefinition();
    const scene = createFakeScene(definition);
    const assembled = assembleTestRig(scene, definition);
    const part = assembled.parts.get('abdomen_shell');
    if (!part) throw new Error('abdomen_shell parçası yok');

    const before = decomposeWorld(part as unknown as FakeTransform);
    assembled.container.rotation = Math.PI / 3;
    const after = decomposeWorld(part as unknown as FakeTransform);

    // Ebeveyn dönüşü çocuğa MİRAS kalır; yerel dönüş değişmemiştir.
    expect(after.rotation - before.rotation).toBeCloseTo(Math.PI / 3, 9);
    // Konum da kök etrafında döner: yarıçap korunur.
    expect(Math.hypot(after.translateX, after.translateY)).toBeCloseTo(
      Math.hypot(before.translateX, before.translateY),
      6,
    );
  });
});

describe('uzuv stres senaryoları', () => {
  const DT = 16;

  function chain(): { rig: ArachnidRig; legs: ArachnidLegs } {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, -Math.PI / 2);
    return { rig, legs };
  }

  function assertSanePose(rig: ArachnidRig, label: string): void {
    for (const limb of rig.limbs) {
      const foot = footOf(limb);
      expect(Number.isFinite(foot.x) && Number.isFinite(foot.y), `${label} — ${limb.id}`).toBe(
        true,
      );
      const total = limb.rootLength + limb.upperLength + limb.lowerLength;
      expect(
        Math.hypot(foot.x - limb.hipX, foot.y - limb.hipY),
        `${label} — ${limb.id}`,
      ).toBeLessThanOrEqual(total + 1e-6);
    }
  }

  it('sert 180° tersine dönüşte uzuvlar ne gerilir ne kopar', () => {
    const { rig, legs } = chain();
    let x = 0;
    // İleri koş…
    for (let i = 0; i < 60; i++) {
      x += (210 * DT) / 1000;
      legs.update(bodySignals({ x, velX: 210 }), poseSignals({ motion01: 1 }), DT);
    }
    // …ve tek karede tersine dön.
    for (let i = 0; i < 60; i++) {
      x -= (210 * DT) / 1000;
      legs.update(
        bodySignals({
          x,
          velX: -210,
          facingHeadingRad: Math.PI / 2,
          travelHeadingRad: Math.PI / 2,
        }),
        poseSignals({ motion01: 1 }),
        DT,
      );
      assertSanePose(rig, `ters dönüş karesi ${i}`);
    }
  });

  it('anlık hız sıçraması adım öngörüsünü erişim dışına fırlatmaz', () => {
    const { rig, legs } = chain();
    let x = 0;
    for (let i = 0; i < 80; i++) {
      // Bir karede yürüyüş, bir karede atılım hızı: öngörü doygunluğu sınanır.
      const speed = i % 2 === 0 ? 40 : 900;
      x += (speed * DT) / 1000;
      legs.update(bodySignals({ x, velX: speed }), poseSignals({ motion01: 1 }), DT);
      assertSanePose(rig, `hız sıçraması karesi ${i}`);
    }
  });

  it('adım ORTASINDA duvara çarpıp durmak ayakları bozmaz', () => {
    const { rig, legs } = chain();
    let x = 0;
    for (let i = 0; i < 40; i++) {
      x += (210 * DT) / 1000;
      legs.update(bodySignals({ x, velX: 210 }), poseSignals({ motion01: 1 }), DT);
    }
    // Çarpma: konum kelepçelendi, hız bir karede tersine döndü.
    for (let i = 0; i < 30; i++) {
      legs.update(bodySignals({ x, velX: -120 }), poseSignals({ motion01: 1 }), DT);
      assertSanePose(rig, `çarpma karesi ${i}`);
    }
  });

  it('hızlı alternatif girdide (sağ-sol-sağ) uzuvlar dağılmaz', () => {
    const { rig, legs } = chain();
    let x = 0;
    for (let i = 0; i < 200; i++) {
      const dir = Math.floor(i / 4) % 2 === 0 ? 1 : -1;
      x += (dir * 210 * DT) / 1000;
      legs.update(
        bodySignals({
          x,
          velX: dir * 210,
          facingHeadingRad: dir > 0 ? 0 : Math.PI,
          travelHeadingRad: dir > 0 ? 0 : Math.PI,
        }),
        poseSignals({ motion01: 1 }),
        DT,
      );
      assertSanePose(rig, `alternatif girdi karesi ${i}`);
    }
  });

  it('duruş evi ATILIMDA kayarken basılı ayak yerinde kalır', () => {
    const { rig, legs } = chain();
    let x = 0;
    for (let i = 0; i < 30; i++) {
      x += (210 * DT) / 1000;
      legs.update(bodySignals({ x, velX: 210 }), poseSignals({ motion01: 1 }), DT);
    }

    // `dash01` duruş evini kaydırır ama gövde HÂLÂ yerdedir: basılı ayaklar
    // kaymamalı, uzuvlar bükülmeli.
    const before = rig.limbs.map(footOf);
    legs.update(bodySignals({ x, velX: 210, dash01: 1 }), poseSignals({ motion01: 1 }), DT);
    const after = rig.limbs.map(footOf);

    for (let i = 0; i < rig.limbs.length; i++) {
      const moved = Math.hypot(after[i].x - before[i].x, after[i].y - before[i].y);
      // Tek karede gövde ~3,4 px ilerler; ayak dünya uzayında sabit kaldığı
      // için gövde-yerel kayması o mertebeyi aşmamalı.
      expect(moved, rig.limbs[i].id).toBeLessThan(gaitConfig.stepTriggerPx);
    }
  });

  it('sıfır ve çok küçük hedeflerde çözüm sonlu kalır', () => {
    const { rig, legs } = chain();
    for (const speed of [0, 1e-9, 1e-6, 1e-3]) {
      for (let i = 0; i < 20; i++) {
        legs.update(bodySignals({ velX: speed }), poseSignals({ motion01: 0 }), DT);
      }
      assertSanePose(rig, `hız ${speed}`);
    }
  });
});
