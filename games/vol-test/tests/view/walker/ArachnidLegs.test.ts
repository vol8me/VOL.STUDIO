import { describe, expect, it } from 'vitest';
import { ARACHNID } from '@/config/vehicles';
import { ARACHNID_RIG, arachnidMetadata } from '@/config/rigAssets';
import { GAIT, WORLD_TO_ART } from '@/config/walkerView';
import { ArachnidLegs } from '@/view/walker/ArachnidLegs';
import { prepareArachnidRig, type ArachnidRig, type LimbRig } from '@/view/walker/arachnidRig';
import type { LocomotionSignals, PoseSignals } from '@/view/walker/signals';
import { bodySignals, poseSignals } from '../../support/locomotion';
import { assembleArachnid, rigScene } from '../../support/rigScene';

const DT = 16;
/** Rig yerel uzayı döndürülmemiş: gövde yukarı (−Y) bakar. */
const BODY_RAD = -Math.PI / 2;
/** Tam tempo: yürüyüş tavanı (sanat px/s). */
const TEMPO = GAIT.fullTempoSpeedPxPerSec;

function makeRig(): ArachnidRig {
  return prepareArachnidRig(arachnidMetadata, assembleArachnid(rigScene(ARACHNID_RIG)));
}

function totalLength(limb: LimbRig): number {
  return limb.rootLength + limb.upperLength + limb.lowerLength;
}

/**
 * Poz edilmiş zinciri İLERİ kinematikle çözer. Ters kinematiğin gerçekten hedefe oturup
 * oturmadığı ancak zincir baştan sona yeniden yürünerek ölçülebilir; container dönüşlerine tek tek
 * bakmak bunu göstermez.
 */
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

function reachOf(limb: LimbRig): number {
  const foot = footOf(limb);
  return Math.hypot(foot.x - limb.hipX, foot.y - limb.hipY);
}

function setup(): { rig: ArachnidRig; legs: ArachnidLegs } {
  const rig = makeRig();
  const legs = new ArachnidLegs(rig);
  legs.reset(0, 0, BODY_RAD);
  return { rig, legs };
}

function drive(
  legs: ArachnidLegs,
  body: Partial<LocomotionSignals> = {},
  pose: Partial<PoseSignals> = {},
  deltaMs = DT,
): void {
  legs.update(bodySignals(body), poseSignals(pose), deltaMs);
}

interface WalkOverrides {
  body?: Partial<LocomotionSignals>;
  pose?: Partial<PoseSignals>;
}

/** Gövdeyi +x yönünde sürer ve kat edilen mesafeyi döner. */
function walk(
  legs: ArachnidLegs,
  frames: number,
  speedPxPerSec: number,
  overrides: WalkOverrides = {},
  onFrame?: (x: number) => void,
): number {
  let x = 0;
  for (let i = 0; i < frames; i++) {
    x += (speedPxPerSec * DT) / 1000;
    drive(legs, { x, velX: speedPxPerSec, ...overrides.body }, { motion01: 1, ...overrides.pose });
    onFrame?.(x);
  }
  return x;
}

function expectSanePose(rig: ArachnidRig, label: string): void {
  for (const limb of rig.limbs) {
    const foot = footOf(limb);
    expect(Number.isFinite(foot.x) && Number.isFinite(foot.y), `${label} — ${limb.id}`).toBe(true);
    expect(reachOf(limb), `${label} — ${limb.id}`).toBeLessThanOrEqual(totalLength(limb) + 1e-6);
  }
}

describe('ArachnidLegs — duruş', () => {
  it('dinlenme duruşunda hiçbir ayak bir diğerine 60 pikselden yakın DEĞİLDİR', () => {
    const { rig } = setup();
    const feet = rig.limbs.map(footOf);
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < feet.length; i++) {
      for (let j = i + 1; j < feet.length; j++) {
        closest = Math.min(closest, Math.hypot(feet[i].x - feet[j].x, feet[i].y - feet[j].y));
      }
    }
    expect(closest).toBeGreaterThan(60);
  });

  it('arka itici uzuvların ayakları KESİŞMEZ: sol solda, sağ sağda kalır', () => {
    const { rig } = setup();
    const left = footOf(rig.limbs.find((limb) => limb.id === 'tl')!);
    const right = footOf(rig.limbs.find((limb) => limb.id === 'tr')!);

    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
    // Gövdenin ARKASINDA (rig yerel +y) dururlar, altında değil.
    expect(left.y).toBeGreaterThan(40);
    expect(right.y).toBeGreaterThan(40);
  });

  it('dinlenme erişimi tam uzanımın altındadır: çözüm kelepçelenmez', () => {
    const { rig } = setup();
    for (const limb of rig.limbs) {
      expect(reachOf(limb), limb.id).toBeLessThan(totalLength(limb));
      expect(reachOf(limb), limb.id).toBeGreaterThan(totalLength(limb) * 0.5);
    }
  });

  it('çömelme uzuvları gövdeye çeker', () => {
    const front = (rig: ArachnidRig) => rig.limbs.findIndex((limb) => limb.id === 'r3');
    const relaxed = setup();
    const standing = reachOf(relaxed.rig.limbs[front(relaxed.rig)]);

    // Çömelme yalnız EV konumunu değiştirir; basılı ayak kaymasın diye gövdenin bir adım atacak
    // kadar hareket etmesi gerekir.
    const crouched = setup();
    walk(crouched.legs, 90, TEMPO * 0.3, { pose: { crouch01: 1 } });
    expect(reachOf(crouched.rig.limbs[front(crouched.rig)])).toBeLessThan(standing);
  });
});

describe('ArachnidLegs — yürüyüş', () => {
  it('gövde dururken hiçbir ayak adım atmaz', () => {
    const { legs } = setup();
    for (let i = 0; i < 180; i++) drive(legs);
    expect(legs.steppingLimbCount).toBe(0);
  });

  it('yürüyüşte adımlar tetiklenir ve yere basma olayı yayılır', () => {
    const { legs } = setup();
    let plants = 0;
    walk(legs, 300, TEMPO * 0.5, {}, () => legs.forEachPlant(() => plants++));
    expect(plants).toBeGreaterThan(6);
  });

  it('gövde her an desteklidir: havadaki uzuv sayısı bir grubu aşmaz', () => {
    const { legs } = setup();
    // Sıraya dahil uzuvlarda grup başına dört bacak var; kısa itici uzuvlar sıra beklemez.
    const stances = Object.values(GAIT.stance);
    const locked = stances.filter((stance) => !stance.freeStep && stance.group === 0).length;
    const groupSize = locked + stances.filter((stance) => stance.freeStep).length;
    let peak = 0;
    walk(legs, 400, TEMPO * 0.5, {}, () => {
      peak = Math.max(peak, legs.steppingLimbCount);
      expect(legs.steppingLimbCount).toBeLessThanOrEqual(groupSize);
    });
    expect(peak).toBeGreaterThan(0);
  });

  it('tam tempoda ayaklar gövdeye yetişir: acil adım gerekmez', () => {
    /*
     * Yürüyüş döngüsünün kapasitesi araç tavanının ÜSTÜNDE olmalı. Ölçüm: bu duruş ve adım
     * ayarlarında acil adım ~440-475 px/s'de başlar. Tavan (`WALKER.maxSpeed` × sanat ölçeği)
     * aşılırsa ayaklar sırayı delip gövdeyi kovalar; araç hızı arttırılacaksa önce yürüyüş
     * döngüsü ya da sanat ölçeği değişmelidir.
     */
    const { legs } = setup();
    expect(TEMPO).toBeCloseTo(ARACHNID.walker.maxSpeed * WORLD_TO_ART, 6);
    let emergency = 0;
    let frames = 0;
    walk(legs, 480, TEMPO, {}, () => {
      if (++frames <= 60) return;
      if (legs.emergencyLimbCount > 0) emergency++;
    });
    expect(emergency).toBe(0);
  });

  it('yerinde dönüşte de adım atar: tempo dönüşten de okunur', () => {
    const { legs } = setup();
    // Gövde yerinde döner: doğrusal hız SIFIR, ayak evleri ise teğetsel olarak savrulur. Tempo
    // yalnız hızdan okunsaydı adımlar en yavaş ayarında kalır ve uzuvlar gövdenin arkasında
    // sürüklenirdi.
    const turnRate = 3;
    let rad = BODY_RAD;
    let plants = 0;
    for (let i = 0; i < 200; i++) {
      rad += (turnRate * DT) / 1000;
      drive(legs, { facingHeadingRad: rad, travelHeadingRad: rad, turnRateRadPerSec: turnRate });
      legs.forEachPlant(() => plants++);
    }
    expect(plants).toBeGreaterThan(8);
  });

  it('dönüş sırasında hiçbir uzuv kendi uzunluğundan öteye gerilmez', () => {
    const { rig, legs } = setup();
    const turnRate = 3.5;
    let rad = BODY_RAD;
    for (let i = 0; i < 300; i++) {
      rad += (turnRate * DT) / 1000;
      drive(legs, { facingHeadingRad: rad, travelHeadingRad: rad, turnRateRadPerSec: turnRate });
      expectSanePose(rig, `dönüş karesi ${i}`);
    }
  });

  it('hiçbir uzuv stride boyunca TAM GERİLİ takılıp kalmaz', () => {
    const { rig, legs } = setup();
    const frames = new Map(rig.limbs.map((limb) => [limb.id, 0]));
    let total = 0;
    const speed = TEMPO * 0.95;
    let y = 0;
    for (let i = 0; i < 500; i++) {
      y -= (speed * DT) / 1000;
      drive(legs, { y, velY: -speed }, { motion01: 1 });
      total++;
      for (const limb of rig.limbs) {
        if (reachOf(limb) > totalLength(limb) * 0.97) {
          frames.set(limb.id, (frames.get(limb.id) ?? 0) + 1);
        }
      }
    }
    // Tam gerili geçen kare oranı, uzvun yerde SÜRÜKLENDİĞİ süredir. Tavan hızında ölçülen: arka
    // bacaklar ~%8, kısa itici uzuvlar ~%13; 128 ms'lik adımda %39'a çıkıyordu.
    for (const limb of rig.limbs) {
      expect((frames.get(limb.id) ?? 0) / total, `${limb.id} tam gerili oranı`).toBeLessThan(0.15);
    }
  });

  it('İLERİ yürüyüşte arka itici uzuvların uzun kemiği SALINIR, sürüklenmez', () => {
    const { rig, legs } = setup();
    const travel = new Map(rig.limbs.map((limb) => [limb.id, [] as number[]]));
    // Gövde baktığı yöne (rig yerel −y) yürür: ayak duruş EKSENİ boyunca gidip gelir. Uzun kemik
    // sabit bir kök olsaydı açısı hiç değişmez, uzuv salınmak yerine sürüklenirdi.
    const speed = TEMPO * 0.95;
    let y = 0;
    for (let i = 0; i < 400; i++) {
      y -= (speed * DT) / 1000;
      drive(legs, { y, velY: -speed }, { motion01: 1 });
      for (const limb of rig.limbs) travel.get(limb.id)?.push(limb.upper.rotation);
    }
    const range = (id: string) => {
      const values = travel.get(id) ?? [0];
      return Math.max(...values) - Math.min(...values);
    };
    for (const id of ['tl', 'tr']) expect(range(id), `${id} uzun kemik`).toBeGreaterThan(0.35);
  });

  it('atılım hızında adım öngörüsü DOYAR: ayaklar tam tempodakinden uzağa savrulmaz', () => {
    const measure = (speed: number): number => {
      const { rig, legs } = setup();
      let furthest = 0;
      // `footOf` gövde-yerel uzayda çalışır: ayağın merkeze uzaklığı doğrudan duruş yarıçapı +
      // öngörü payıdır.
      walk(legs, 60, speed, { body: { dash01: speed > TEMPO * 1.1 ? 1 : 0 } }, () => {
        for (const limb of rig.limbs) {
          const foot = footOf(limb);
          furthest = Math.max(furthest, Math.hypot(foot.x, foot.y));
        }
      });
      return furthest;
    };
    const tempo = measure(TEMPO);
    const dash = measure(TEMPO * ARACHNID.walker.dashMultiplier);
    // Ölçek uygulanmasaydı öngörü, tam tempodakinin dash çarpanı kadar fazlası olurdu.
    expect(dash).toBeLessThan(tempo * 1.25);
  });
});

describe('ArachnidLegs — stres senaryoları', () => {
  it('sert 180° tersine dönüşte uzuvlar ne gerilir ne kopar', () => {
    const { rig, legs } = setup();
    const speed = TEMPO * 0.95;
    let x = 0;
    for (let i = 0; i < 60; i++) {
      x += (speed * DT) / 1000;
      drive(legs, { x, velX: speed }, { motion01: 1 });
    }
    for (let i = 0; i < 60; i++) {
      x -= (speed * DT) / 1000;
      drive(
        legs,
        { x, velX: -speed, facingHeadingRad: Math.PI / 2, travelHeadingRad: Math.PI / 2 },
        { motion01: 1 },
      );
      expectSanePose(rig, `ters dönüş karesi ${i}`);
    }
  });

  it('anlık hız sıçraması adım öngörüsünü erişim dışına fırlatmaz', () => {
    const { rig, legs } = setup();
    let x = 0;
    for (let i = 0; i < 80; i++) {
      // Bir karede yürüyüş, bir karede atılım hızı: öngörü doygunluğu sınanır.
      const speed = i % 2 === 0 ? TEMPO * 0.1 : TEMPO * 2;
      x += (speed * DT) / 1000;
      drive(legs, { x, velX: speed }, { motion01: 1 });
      expectSanePose(rig, `hız sıçraması karesi ${i}`);
    }
  });

  it('adım ORTASINDA duvara çarpıp durmak ayakları bozmaz', () => {
    const { rig, legs } = setup();
    let x = 0;
    for (let i = 0; i < 40; i++) {
      x += (TEMPO * DT) / 1000;
      drive(legs, { x, velX: TEMPO }, { motion01: 1 });
    }
    for (let i = 0; i < 30; i++) {
      drive(legs, { x, velX: -TEMPO * 0.5, impact01: Math.max(0, 1 - i / 15) }, { motion01: 1 });
      expectSanePose(rig, `çarpma karesi ${i}`);
    }
  });

  it('hızlı alternatif girdide (sağ-sol-sağ) uzuvlar dağılmaz', () => {
    const { rig, legs } = setup();
    let x = 0;
    for (let i = 0; i < 200; i++) {
      const dir = Math.floor(i / 4) % 2 === 0 ? 1 : -1;
      x += (dir * TEMPO * DT) / 1000;
      drive(
        legs,
        {
          x,
          velX: dir * TEMPO,
          facingHeadingRad: dir > 0 ? 0 : Math.PI,
          travelHeadingRad: dir > 0 ? 0 : Math.PI,
        },
        { motion01: 1 },
      );
      expectSanePose(rig, `alternatif girdi karesi ${i}`);
    }
  });

  it('duruş evi ATILIMDA kayarken basılı ayak yerinde kalır', () => {
    const { rig, legs } = setup();
    let x = 0;
    for (let i = 0; i < 30; i++) {
      x += (TEMPO * DT) / 1000;
      drive(legs, { x, velX: TEMPO }, { motion01: 1 });
    }
    // `dash01` duruş evini kaydırır ama gövde HÂLÂ yerdedir: basılı ayaklar kaymamalı, uzuvlar
    // bükülmeli.
    const before = rig.limbs.map(footOf);
    drive(legs, { x, velX: TEMPO, dash01: 1 }, { motion01: 1 });
    const after = rig.limbs.map(footOf);
    rig.limbs.forEach((limb, index) => {
      const moved = Math.hypot(after[index].x - before[index].x, after[index].y - before[index].y);
      expect(moved, limb.id).toBeLessThan(GAIT.stepTriggerPx);
    });
  });

  it('sıfır ve çok küçük hızlarda çözüm sonlu kalır', () => {
    const { rig, legs } = setup();
    for (const speed of [0, 1e-9, 1e-6, 1e-3]) {
      for (let i = 0; i < 20; i++) drive(legs, { velX: speed });
      expectSanePose(rig, `hız ${speed}`);
    }
  });

  it('bozuk sinyal tek karede çözümü kalıcı olarak bozmaz', () => {
    const { rig, legs } = setup();
    walk(legs, 30, TEMPO * 0.5);
    drive(legs, { x: Number.NaN, velX: Number.POSITIVE_INFINITY, turnRateRadPerSec: Number.NaN });
    walk(legs, 30, TEMPO * 0.5);
    expectSanePose(rig, 'bozuk kare sonrası');
  });

  it('ışınlanma sonrası reset ayakları gövdenin altına adımsız oturtur', () => {
    const { rig, legs } = setup();
    walk(legs, 60, TEMPO * 0.5);
    legs.reset(5000, 5000, BODY_RAD);
    expect(legs.steppingLimbCount).toBe(0);
    expectSanePose(rig, 'reset sonrası');
  });
});

describe('ArachnidLegs — kurulum sözleşmesi', () => {
  it('duruş tanımı olmayan uzvu REDDEDER', () => {
    const rig = makeRig();
    const stranger = { ...rig.limbs[0], id: 'bilinmeyen_uzuv' };
    expect(() => new ArachnidLegs({ ...rig, limbs: [...rig.limbs, stranger] })).toThrow(
      /bilinmeyen_uzuv/,
    );
  });

  it('SABİT kök kemiği olup kök payı bildirilmemiş uzvu REDDEDER', () => {
    // Arka itici uzuvlarda kök kemik IK çiftinin ilkidir ve `rootFollow` taşımazlar. Böyle bir
    // uzva sabit kök kemik verilirse çözücü kökü neye göre süreceğini bilemez; sessizce sıfır pay
    // kullanmak uzvu duruşa çivilerdi.
    const rig = makeRig();
    const tail = rig.limbs.find((limb) => limb.id === 'tl');
    if (!tail) throw new Error('tl uzvu yok');
    expect(GAIT.stance.tl.rootFollow).toBeUndefined();
    const withRoot = { ...tail, root: rig.limbs[0].upper };
    const broken = {
      ...rig,
      limbs: rig.limbs.map((limb) => (limb.id === 'tl' ? withRoot : limb)),
    };
    expect(() => new ArachnidLegs(broken)).toThrow(/kök payı tanımlı değil/);
  });
});
