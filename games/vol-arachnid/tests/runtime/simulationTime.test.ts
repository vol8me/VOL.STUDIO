import { describe, expect, it } from 'vitest';
import { TECH, Vector2 } from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import { playerConfig } from '@/config/player';
import { ArachnidBody } from '@/runtime/entity/ArachnidBody';
import { ArachnidLegs } from '@/runtime/entity/ArachnidLegs';
import { prepareArachnidRig, type ArachnidRig, type LimbRig } from '@/runtime/rig/arachnidRig';
import {
  arachnidTestMetadata as metadata,
  assembleTestRig,
  buildTestRigDefinition,
  createFakeScene,
} from '../support/phaserFakes';
import { bodySignals, poseSignals } from '../support/locomotion';

/**
 * ZAMAN SÖZLEŞMESİ.
 *
 * Zamanı tüketen her alt sistem aynı tavanı paylaşır (`TECH.MAX_SIM_STEP_MS`).
 * Bu bir performans ayarı değil, bir DOĞRULUK kuralıdır: alt sistemler ayrı
 * kelepçeler kullandığında aynı karede farklı kadar zaman yaşarlar.
 *
 * Gerçekleşen hata buydu — gövde 100 ms'e kelepçeliyor, yürüyüş döngüsü
 * kelepçelemiyordu. Sekme değişimi ya da mobil resume sonrası gelen 500 ms'lik
 * bir karede gövde 100 ms yol alıyor, ayak döngüsü 500 ms ilerliyordu: ayaklar
 * gövdenin GİTMEDİĞİ yere basıyordu. Hata uzuv kodunda değil ZAMANDA olduğu
 * için uzuvlara bakarak bulunamıyordu.
 *
 * Testin şekli bu yüzden doğrudan sözleşmeyi ölçer: tavanın ÜSTÜNDEKİ iki
 * farklı kare süresi, tanım gereği AYNI durumu üretmelidir. Herhangi bir alt
 * sistem ham `deltaMs`e geri dönerse bu eşitlik bozulur.
 */
const CEILING = TECH.MAX_SIM_STEP_MS;
const CENTER_X = arenaConfig.widthPx / 2;
const CENTER_Y = arenaConfig.heightPx / 2;

function makeRig(): ArachnidRig {
  const definition = buildTestRigDefinition();
  return prepareArachnidRig(metadata, assembleTestRig(createFakeScene(definition), definition));
}

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

/** Gövdeyi verilen kare süresiyle sürer; her kare atılım da denenebilir. */
function driveBody(frameMs: number, frames: number, dashOnFirst = false): ArachnidBody {
  const body = new ArachnidBody(CENTER_X, CENTER_Y);
  for (let i = 0; i < frames; i++) {
    body.update(new Vector2(1, 0.35), dashOnFirst && i === 0, frameMs);
  }
  return body;
}

describe('simülasyon zamanı — tek tavan', () => {
  it('tavanın üstündeki iki farklı kare süresi AYNI gövde durumunu üretir', () => {
    const atCeiling = driveBody(CEILING, 6);
    const wayOver = driveBody(CEILING * 50, 6);

    expect(wayOver.position.x).toBeCloseTo(atCeiling.position.x, 9);
    expect(wayOver.position.y).toBeCloseTo(atCeiling.position.y, 9);
    expect(wayOver.velocity.x).toBeCloseTo(atCeiling.velocity.x, 9);
    expect(wayOver.velocity.y).toBeCloseTo(atCeiling.velocity.y, 9);
    expect(wayOver.facingRad).toBeCloseTo(atCeiling.facingRad, 9);
    expect(wayOver.turnRate).toBeCloseTo(atCeiling.turnRate, 9);
  });

  it('atılım ve bekleme sayaçları da tavanı aşan bir karede fazladan tükenmez', () => {
    const atCeiling = driveBody(CEILING, 2, true);
    const wayOver = driveBody(CEILING * 50, 2, true);

    // Sayaçlar ham `deltaMs` harcasaydı dev karede atılım çoktan bitmiş,
    // cooldown dolmuş olurdu; kelepçeli karede ikisi de sürüyor.
    expect(wayOver.isDashing).toBe(atCeiling.isDashing);
    expect(wayOver.dash01).toBeCloseTo(atCeiling.dash01, 9);
    expect(wayOver.dashProgress).toBeCloseTo(atCeiling.dashProgress, 9);
  });

  it('uzuvlar da aynı tavanı yaşar: dev karede ayaklar gövdeden ayrışmaz', () => {
    const rigA = makeRig();
    const rigB = makeRig();
    const legsA = new ArachnidLegs(rigA);
    const legsB = new ArachnidLegs(rigB);

    legsA.reset(0, 0, -Math.PI / 2);
    legsB.reset(0, 0, -Math.PI / 2);

    // Aynı gövde YÖRÜNGESİ, farklı kare süreleri. Gövde konumu dışarıdan
    // verildiği için fark yalnız yürüyüş döngüsünün yaşadığı zamandan gelir.
    const speed = playerConfig.maxSpeed;
    for (let i = 1; i <= 8; i++) {
      const x = (speed * (CEILING * i)) / 1000;
      const signals = bodySignals({ x, velX: speed });
      const pose = poseSignals({ motion01: 1 });
      legsA.update(signals, pose, CEILING);
      legsB.update(signals, pose, CEILING * 50);
    }

    for (let i = 0; i < rigA.limbs.length; i++) {
      const a = footOf(rigA.limbs[i]);
      const b = footOf(rigB.limbs[i]);
      expect(b.x, rigA.limbs[i].id).toBeCloseTo(a.x, 9);
      expect(b.y, rigA.limbs[i].id).toBeCloseTo(a.y, 9);
    }
    expect(legsB.steppingLimbCount).toBe(legsA.steppingLimbCount);
  });

  it('geçersiz kare süresinde hiçbir sistem zaman yaşamaz', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);
    body.update(new Vector2(1, 0), true, 16);
    const dashBefore = body.dash01;
    const positionBefore = body.position.x;

    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
      body.update(new Vector2(1, 0), false, bad);
    }

    expect(body.position.x).toBe(positionBefore);
    expect(body.dash01).toBe(dashBefore);
  });
});

describe('atılım süresi kare sınırına yuvarlanmaz', () => {
  /** Atılım bitene kadar sürer; kat edilen mesafeyi ve harcanan kareyi döner. */
  function dashRun(frameMs: number): { distance: number; frames: number } {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);
    const startX = body.position.x;
    const startY = body.position.y;
    body.update(new Vector2(1, 0), true, frameMs);
    let frames = 1;
    while (body.isDashing && frames < 500) {
      body.update(Vector2.zero(), false, frameMs);
      frames++;
    }
    return {
      distance: Math.hypot(body.position.x - startX, body.position.y - startY),
      frames,
    };
  }

  const dashDistance = (playerConfig.dash.speedPxPerSec * playerConfig.dash.durationMs) / 1000;

  it('süreyi TAM bölen bir kare hızında yol tam olarak hız × süredir', () => {
    // 140 ms / 7 ms = 20 tam kare: atılım kare sınırında biter, süzülme payı yok.
    expect(playerConfig.dash.durationMs % 7).toBe(0);
    const run = dashRun(7);

    expect(run.frames).toBe(playerConfig.dash.durationMs / 7);
    expect(run.distance).toBeCloseTo(dashDistance, 6);
  });

  it('süreyi bölmeyen kare hızında son kare TAMAMEN atılım hızında geçmez', () => {
    /*
     * Asıl garanti bu. `dashRemainingMs -= deltaMs` deyip tüm kareyi atılım
     * hızında geçirmek, atılımı kare sınırına YUVARLIYORDU: 140 ms'lik bir
     * atılım 24 ms'lik karelerde 144 ms sürüyor ve yol tam olarak
     * `hız × kare × kareSayısı` oluyordu. Artık son karenin yalnız atılım PAYI
     * atılım hızındadır, kalanı normal sürüşle geçer — eşitlik kırılır.
     */
    const frameMs = 24;
    expect(playerConfig.dash.durationMs % frameMs).not.toBe(0);

    const run = dashRun(frameMs);
    const roundedUp = (playerConfig.dash.speedPxPerSec * run.frames * frameMs) / 1000;

    // Atılım eksiksiz teslim edilir…
    expect(run.distance).toBeGreaterThanOrEqual(dashDistance);
    // …ama kare sınırına yuvarlanmış mesafeye ULAŞMAZ.
    expect(run.distance).toBeLessThan(roundedUp);
  });

  it('atılım payı tükendikten sonra gövde artık atılım hızında DEĞİLDİR', () => {
    // Son karenin kalanı normal sürüşle geçtiği için hız atılım hızının
    // altına iner; tüm kare atılım hızında geçseydi tam 900'de kalırdı.
    const body = new ArachnidBody(CENTER_X, CENTER_Y);
    body.update(new Vector2(1, 0), true, 24);
    while (body.isDashing) body.update(Vector2.zero(), false, 24);

    expect(body.speed).toBeLessThan(playerConfig.dash.speedPxPerSec);
  });
});

describe('duvar teması', () => {
  it('köşeye atılım TEK ama bileşke normalli bir darbe bırakır', () => {
    // Sol-üst köşenin hemen içinden köşeye doğru atıl.
    const r = arenaConfig.bodyRadiusPx;
    const body = new ArachnidBody(r + 2, r + 2);
    body.update(new Vector2(-1, -1), true, 16);

    const impact = body.consumeWallImpact();
    expect(impact).not.toBeNull();
    // İkinci bir darbe YOKTUR: köşe tek olaydır.
    expect(body.consumeWallImpact()).toBeNull();

    // Bileşke normal içeri, yani sağ-aşağı bakar ve birim uzunluktadır.
    expect(impact!.normalX).toBeGreaterThan(0);
    expect(impact!.normalY).toBeGreaterThan(0);
    expect(Math.hypot(impact!.normalX, impact!.normalY)).toBeCloseTo(1, 9);
  });

  it('sekmenin impulse’u İVMEYE yansır — gövde çarpmayı görür', () => {
    const r = arenaConfig.bodyRadiusPx;
    const body = new ArachnidBody(r + 2, CENTER_Y);
    body.update(new Vector2(-1, 0), true, 16);

    // Sekme sınır çözümünden SONRA okunmasaydı impulse iki kare arasında
    // kaybolur, ivme yalnız atılımın kendi hızlanmasını gösterirdi.
    expect(body.consumeWallImpact()).not.toBeNull();
    expect(body.accelerationVector.x).toBeGreaterThan(0);
  });
});
