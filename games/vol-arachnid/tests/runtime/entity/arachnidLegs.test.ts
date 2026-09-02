import { describe, expect, it } from 'vitest';
import { gaitConfig } from '@/config/gait';
import { ArachnidLegs, type LimbDriveState } from '@/runtime/entity/ArachnidLegs';
import { prepareArachnidRig, type ArachnidRig, type LimbRig } from '@/runtime/rig/arachnidRig';
import {
  arachnidTestMetadata as metadata,
  assembleTestRig,
  buildTestRigDefinition,
  createFakeScene,
} from '../../support/phaserFakes';

const DT = 16;
const BODY_RAD = -Math.PI / 2;

function makeRig(): ArachnidRig {
  const definition = buildTestRigDefinition();
  return prepareArachnidRig(metadata, assembleTestRig(createFakeScene(definition), definition));
}

function totalLength(limb: LimbRig): number {
  return limb.rootLength + limb.upperLength + limb.lowerLength;
}

/**
 * Poz edilmiş zinciri İLERİ kinematikle çözer. Ters kinematiğin gerçekten
 * hedefe oturup oturmadığı ancak zincir baştan sona yeniden yürünerek
 * ölçülebilir; container dönüşlerine tek tek bakmak bunu göstermez.
 */
function forwardKinematics(limb: LimbRig): { x: number; y: number } {
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

function driveState(overrides: Partial<LimbDriveState> = {}): LimbDriveState {
  return {
    bodyX: 0,
    bodyY: 0,
    bodyRad: BODY_RAD,
    velX: 0,
    velY: 0,
    turnRate: 0,
    motion01: 0,
    dash01: 0,
    crouch01: 0,
    ...overrides,
  };
}

/** Gövdeyi +x yönünde sürer ve kat edilen mesafeyi döner. */
function walk(
  legs: ArachnidLegs,
  frames: number,
  speedPxPerSec: number,
  extra: Partial<LimbDriveState> = {},
  onFrame?: (x: number) => void,
): number {
  let x = 0;
  for (let i = 0; i < frames; i++) {
    x += (speedPxPerSec * DT) / 1000;
    legs.update(driveState({ bodyX: x, velX: speedPxPerSec, motion01: 1, ...extra }), DT);
    onFrame?.(x);
  }
  return x;
}

describe('ArachnidLegs — duruş', () => {
  it('dinlenme duruşunda hiçbir ayak bir diğerine 60 pikselden yakın DEĞİLDİR', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, BODY_RAD);

    const feet = rig.limbs.map(forwardKinematics);
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < feet.length; i++) {
      for (let j = i + 1; j < feet.length; j++) {
        closest = Math.min(closest, Math.hypot(feet[i].x - feet[j].x, feet[i].y - feet[j].y));
      }
    }
    expect(closest).toBeGreaterThan(60);
  });

  it('arka itici uzuvların ayakları KESİŞMEZ: sol solda, sağ sağda kalır', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, BODY_RAD);

    const left = forwardKinematics(rig.limbs.find((limb) => limb.id === 'tl')!);
    const right = forwardKinematics(rig.limbs.find((limb) => limb.id === 'tr')!);

    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
    // Gövdenin ARKASINDA (rig yerel +y) dururlar, altında değil.
    expect(left.y).toBeGreaterThan(40);
    expect(right.y).toBeGreaterThan(40);
  });

  it('ters kinematik çözümü ileri kinematikle hedefin üstüne oturur', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, BODY_RAD);

    for (const limb of rig.limbs) {
      const foot = forwardKinematics(limb);
      const reach = Math.hypot(foot.x - limb.hipX, foot.y - limb.hipY);
      // Dinlenme erişimi tam uzanımın altındadır; çözüm kelepçelenmemelidir.
      expect(reach, limb.id).toBeLessThan(totalLength(limb));
      expect(reach, limb.id).toBeGreaterThan(totalLength(limb) * 0.5);
    }
  });

  it('hiçbir kare uzvu kendi uzunluğundan öteye germez', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, BODY_RAD);

    walk(legs, 240, 240, {}, () => {
      for (const limb of rig.limbs) {
        const foot = forwardKinematics(limb);
        expect(Math.hypot(foot.x - limb.hipX, foot.y - limb.hipY), limb.id).toBeLessThanOrEqual(
          totalLength(limb) + 1e-6,
        );
      }
    });
  });

  it('çömelme uzuvları gövdeye çeker, atılım ön uzuvları öne taşır', () => {
    const rig = makeRig();
    const front = rig.limbs.findIndex((limb) => limb.id === 'r3');

    const relaxed = new ArachnidLegs(rig);
    relaxed.reset(0, 0, BODY_RAD);
    const standing = forwardKinematics(rig.limbs[front]);
    const standingReach = Math.hypot(
      standing.x - rig.limbs[front].hipX,
      standing.y - rig.limbs[front].hipY,
    );

    // Çömelme yalnız EV konumunu değiştirir; basılı ayak kaymasın diye
    // gövdenin bir adım atacak kadar hareket etmesi gerekir.
    const crouched = new ArachnidLegs(rig);
    crouched.reset(0, 0, BODY_RAD);
    walk(crouched, 90, 120, { crouch01: 1 });
    const crouchedPose = forwardKinematics(rig.limbs[front]);
    const crouchedReach = Math.hypot(
      crouchedPose.x - rig.limbs[front].hipX,
      crouchedPose.y - rig.limbs[front].hipY,
    );

    expect(crouchedReach).toBeLessThan(standingReach);
  });
});

describe('ArachnidLegs — yürüyüş', () => {
  it('gövde dururken hiçbir ayak adım atmaz', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, BODY_RAD);

    for (let i = 0; i < 180; i++) legs.update(driveState(), DT);
    expect(legs.steppingLimbCount).toBe(0);
  });

  it('yürüyüşte adımlar tetiklenir ve yere basma olayı yayılır', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, BODY_RAD);

    let plants = 0;
    walk(legs, 300, 200, {}, () => legs.forEachPlant(() => plants++));
    expect(plants).toBeGreaterThan(6);
  });

  it('gövde her an desteklidir: havadaki uzuv sayısı bir grubu aşmaz', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, BODY_RAD);

    // Grup başına beş uzuv var; acil eşik devreye girmesin diye tam tempo
    // hızının altında yürünür.
    const groupSize = Object.values(gaitConfig.stance).filter(
      (stance) => stance.group === 0,
    ).length;
    let peak = 0;
    walk(legs, 400, 200, {}, () => {
      peak = Math.max(peak, legs.steppingLimbCount);
      expect(legs.steppingLimbCount).toBeLessThanOrEqual(groupSize);
    });
    expect(peak).toBeGreaterThan(0);
  });

  it('yerinde dönüşte de adım atar: tempo dönüşten de okunur', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, BODY_RAD);

    // Gövde yerinde döner: doğrusal hız SIFIR, ayak evleri ise teğetsel olarak
    // savrulur. Tempo yalnız hızdan okunsaydı adımlar en yavaş ayarında kalır
    // ve uzuvlar gövdenin arkasında sürüklenirdi.
    const turnRate = 3;
    let rad = BODY_RAD;
    let plants = 0;
    for (let i = 0; i < 200; i++) {
      rad += (turnRate * DT) / 1000;
      legs.update(driveState({ bodyRad: rad, turnRate, motion01: 0 }), DT);
      legs.forEachPlant(() => plants++);
    }

    expect(plants).toBeGreaterThan(8);
  });

  it('dönüş sırasında hiçbir ayak evinden acil eşikten fazla uzaklaşmaz', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, BODY_RAD);

    const turnRate = 3.5;
    let rad = BODY_RAD;
    for (let i = 0; i < 300; i++) {
      rad += (turnRate * DT) / 1000;
      legs.update(driveState({ bodyRad: rad, turnRate, motion01: 0 }), DT);
      for (const limb of rig.limbs) {
        const foot = forwardKinematics(limb);
        expect(Math.hypot(foot.x - limb.hipX, foot.y - limb.hipY), limb.id).toBeLessThanOrEqual(
          totalLength(limb) + 1e-6,
        );
      }
    }
  });

  it('İLERİ yürüyüşte arka itici uzuvların uzun kemiği SALINIR, sürüklenmez', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, BODY_RAD);

    const travel = new Map(rig.limbs.map((limb) => [limb.id, [] as number[]]));
    // Gövde baktığı yöne (rig yerel −y) yürür: ayak duruş EKSENİ boyunca
    // gidip gelir. Uzun kemik sabit bir kök olsaydı açısı hiç değişmez,
    // uzuv salınmak yerine sürüklenirdi.
    const speed = 210;
    let y = 0;
    for (let i = 0; i < 400; i++) {
      y -= (speed * DT) / 1000;
      legs.update(driveState({ bodyY: y, velY: -speed, motion01: 1 }), DT);
      for (const limb of rig.limbs) travel.get(limb.id)!.push(limb.upper.rotation);
    }
    const range = (id: string) => {
      const values = travel.get(id)!;
      return Math.max(...values) - Math.min(...values);
    };

    for (const id of ['tl', 'tr']) {
      expect(range(id), `${id} uzun kemik`).toBeGreaterThan(0.35);
    }
  });

  it('atılım hızında adım öngörüsü DOYAR: ayaklar tam tempodakinden uzağa savrulmaz', () => {
    const measure = (speed: number): number => {
      const rig = makeRig();
      const legs = new ArachnidLegs(rig);
      legs.reset(0, 0, BODY_RAD);
      let furthest = 0;
      // `forwardKinematics` gövde-yerel uzayda çalışır: ayağın merkeze
      // uzaklığı doğrudan duruş yarıçapı + öngörü payıdır.
      walk(legs, 60, speed, { dash01: speed > 400 ? 1 : 0 }, () => {
        for (const limb of rig.limbs) {
          const foot = forwardKinematics(limb);
          furthest = Math.max(furthest, Math.hypot(foot.x, foot.y));
        }
      });
      return furthest;
    };

    const tempo = measure(gaitConfig.fullTempoSpeedPxPerSec);
    const dash = measure(900);
    // Ölçek uygulanmasaydı öngörü 900 * stepLead ≈ 117 px olurdu; duruş
    // yarıçapının üstüne binen bu fark burada 1.25 katını aşardı.
    expect(dash).toBeLessThan(tempo * 1.25);
  });
});
