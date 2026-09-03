import { describe, expect, it } from 'vitest';
import { Vector2, createRandom, type Random } from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import { gaitConfig } from '@/config/gait';
import { playerConfig } from '@/config/player';
import { ArachnidBody } from '@/runtime/entity/ArachnidBody';
import { ArachnidLegs } from '@/runtime/entity/ArachnidLegs';
import { ArachnidBodyMotion } from '@/runtime/rig/ArachnidBodyMotion';
import { prepareArachnidRig, type ArachnidRig, type LimbRig } from '@/runtime/rig/arachnidRig';
import {
  arachnidTestMetadata as metadata,
  assembleTestRig,
  buildTestRigDefinition,
  createFakeScene,
} from '../support/phaserFakes';

/**
 * LOCOMOTION SÖZLEŞMESİ.
 *
 * Birim testler her alt sistemi ayrı ayrı doğruluyor; burada zincirin TAMAMI
 * (girdi → gövde → ikincil hareket → yürüyüş → IK → poz) uzun ve düşmanca bir
 * akış altında sürülür ve her karede geçerli kalması gereken şeyler ölçülür.
 *
 * `hardening.test.ts` bu zincirin SONLU kaldığını kanıtlar. Buradaki katman
 * farklıdır: değerler yalnız sonlu değil, DOĞRU aralıkta mı? Bir uzuv bir kare
 * için ters mi büküldü? Gövde desteklendiğini iddia ederken gerçekten
 * destekleniyor mu? Bunlar NaN taramasıyla görünmez.
 */
const SEED = 0x4c_4f_43_4f;
/** Sekme, uyku ve mobil resume karışımı — tek bir kare hızı gerçeği temsil etmez. */
const DELTA_POOL = [16, 16, 16, 33, 33, 8, 100, 500] as const;

function makeRig(): ArachnidRig {
  const definition = buildTestRigDefinition();
  return prepareArachnidRig(metadata, assembleTestRig(createFakeScene(definition), definition));
}

interface Chain {
  rig: ArachnidRig;
  body: ArachnidBody;
  legs: ArachnidLegs;
  motion: ArachnidBodyMotion;
}

function makeChain(): Chain {
  const rig = makeRig();
  const body = new ArachnidBody(arenaConfig.widthPx / 2, arenaConfig.heightPx / 2);
  const legs = new ArachnidLegs(rig);
  legs.reset(body.position.x, body.position.y, body.facingRad);
  return { rig, body, legs, motion: new ArachnidBodyMotion(rig) };
}

/** Sahnenin `update` akışının test karşılığı — aynı sıra, aynı sinyaller. */
function step(chain: Chain, intent: Vector2, dash: boolean, deltaMs: number): void {
  const { body, legs, motion } = chain;
  body.update(intent, dash, deltaMs);
  const accel = body.accelerationVector;
  const signals = motion.update(
    {
      speed: body.speed,
      accelX: accel.x,
      accelY: accel.y,
      turnRate: body.turnRate,
      facingRad: body.facingRad,
      dash01: body.dash01,
    },
    deltaMs,
  );
  legs.update(
    {
      bodyX: body.position.x,
      bodyY: body.position.y,
      bodyRad: body.facingRad,
      velX: body.velocity.x,
      velY: body.velocity.y,
      turnRate: body.turnRate,
      motion01: signals.motion01,
      dash01: body.dash01,
      crouch01: signals.crouch01,
      airborne: body.isDashing,
    },
    deltaMs,
  );
}

interface LimbGeometry {
  /** IK zincirinin başladığı nokta (kalça + varsa sabit kök kemik). */
  originX: number;
  originY: number;
  kneeX: number;
  kneeY: number;
  footX: number;
  footY: number;
}

/**
 * Pozlanmış zinciri İLERİ kinematikle çözer.
 *
 * Container dönüşlerine tek tek bakmak uzvun nerede DURDUĞUNU göstermez;
 * zincirin baştan sona yürünmesi gerekir.
 */
function geometryOf(limb: LimbRig): LimbGeometry {
  const rootDir = limb.root ? limb.root.rotation : 0;
  const originX = limb.hipX + (limb.root ? Math.cos(rootDir) * limb.rootLength : 0);
  const originY = limb.hipY + (limb.root ? Math.sin(rootDir) * limb.rootLength : 0);
  const upperDir = rootDir + limb.upper.rotation;
  const lowerDir = upperDir + limb.lower.rotation;
  const kneeX = originX + Math.cos(upperDir) * limb.upperLength;
  const kneeY = originY + Math.sin(upperDir) * limb.upperLength;
  return {
    originX,
    originY,
    kneeX,
    kneeY,
    footX: kneeX + Math.cos(lowerDir) * limb.lowerLength,
    footY: kneeY + Math.sin(lowerDir) * limb.lowerLength,
  };
}

/**
 * Dizin hangi tarafta olduğunun işareti.
 *
 * `solveTwoBoneIk` dizi hedef yönünden `bendSign` yönünde `kneeOffset` kadar
 * döndürür; yani (uç−kök) ile (diz−kök) arasındaki çapraz çarpımın işareti
 * `bendSign`in işaretidir. Tam gerili ya da tam katlanmış uzuvda çarpım sıfıra
 * yaklaşır ve işaret anlamını yitirir — o durumda kontrol atlanır.
 */
function bendCross(geometry: LimbGeometry): number {
  const tx = geometry.footX - geometry.originX;
  const ty = geometry.footY - geometry.originY;
  const kx = geometry.kneeX - geometry.originX;
  const ky = geometry.kneeY - geometry.originY;
  return tx * ky - ty * kx;
}

function totalLength(limb: LimbRig): number {
  return limb.rootLength + limb.upperLength + limb.lowerLength;
}

/** Sıraya dahil bir grubun büyüklüğü + sıra beklemeyen uzuvlar. */
function normalRegimeBound(): number {
  const stances = Object.values(gaitConfig.stance);
  const free = stances.filter((stance) => stance.freeStep).length;
  const groups = new Map<number, number>();
  for (const stance of stances) {
    if (stance.freeStep) continue;
    groups.set(stance.group, (groups.get(stance.group) ?? 0) + 1);
  }
  return Math.max(...groups.values()) + free;
}

/** Rastgele ama TEKRARLANABİLİR bir girdi akışı. */
function randomIntent(random: Random): Vector2 {
  const angle = random.bipolar() * Math.PI;
  const magnitude = random.next();
  // Girdinin dörtte biri "tuş bırakıldı": fren ve duruş yolları da sürülmeli.
  if (magnitude < 0.25) return Vector2.zero();
  return new Vector2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
}

describe('locomotion değişmezleri — 10.000 kare', () => {
  /**
   * İhlaller TOPLANIR, kare başına `expect` çağrılmaz.
   *
   * 10.000 kare × 10 uzuv × birkaç kontrol yarım milyon `expect` demektir;
   * testi saniyelerce yavaşlatır ve düşerken yalnız İLK kareyi anlatır. Düz bir
   * karşılaştırma hem ucuzdur hem daha iyi bir rapor verir: ilk ihlal, kaç kez
   * tekrarladığı ve hangi karede başladığı.
   */
  it('düşmanca ama tekrarlanabilir bir akışta hiçbir sözleşme kırılmaz', () => {
    const chain = makeChain();
    const random = createRandom(SEED);
    const bound = normalRegimeBound();
    const r = arenaConfig.bodyRadiusPx;

    const violations: string[] = [];
    const note = (message: string): void => {
      if (violations.length < 8) violations.push(message);
    };

    let intent = randomIntent(random);
    let dashPresses = 0;
    let emergencyFrames = 0;
    let peakStepping = 0;
    let bendChecks = 0;

    for (let frame = 0; frame < 10_000; frame++) {
      // Girdi her karede değişmez; gerçek bir oyuncu tuşu basılı tutar.
      if (random.next() < 0.08) intent = randomIntent(random);
      const dash = random.next() < 0.05;
      if (dash) dashPresses++;
      const deltaMs = DELTA_POOL[Math.floor(random.next() * DELTA_POOL.length)];

      step(chain, intent, dash, deltaMs);

      const { body, legs, rig } = chain;
      const at = `kare ${frame} (delta ${deltaMs})`;

      // --- Gövde ---
      if (
        !Number.isFinite(body.position.x) ||
        !Number.isFinite(body.position.y) ||
        !Number.isFinite(body.velocity.x) ||
        !Number.isFinite(body.velocity.y) ||
        !Number.isFinite(body.facingRad) ||
        !Number.isFinite(body.turnRate)
      ) {
        note(`${at}: gövde durumu sonlu değil`);
      }
      if (
        body.position.x < r - 1e-6 ||
        body.position.x > arenaConfig.widthPx - r + 1e-6 ||
        body.position.y < r - 1e-6 ||
        body.position.y > arenaConfig.heightPx - r + 1e-6
      ) {
        note(`${at}: gövde arena dışında (${body.position.x}, ${body.position.y})`);
      }
      // Hız tavanı: sekme restitution ile yürüyüş hızını aşabilir, o yüzden
      // tavan atılım hızıdır.
      if (body.speed > playerConfig.dash.speedPxPerSec + 1e-6) {
        note(`${at}: hız tavanı aşıldı (${body.speed})`);
      }
      if (Math.abs(body.turnRate) > playerConfig.maxTurnRateRadPerSec + 1e-9) {
        note(`${at}: dönüş tavanı aşıldı (${body.turnRate})`);
      }
      if (body.dash01 < 0 || body.dash01 > 1) {
        note(`${at}: dash01 aralık dışı (${body.dash01})`);
      }

      // --- Uzuvlar ---
      peakStepping = Math.max(peakStepping, legs.steppingLimbCount);
      if (legs.emergencyLimbCount === 0) {
        // NORMAL rejim: gövde karşı grubun tamamı üstünde. Acil rejimde bu
        // güvence bilinçli olarak askıdadır (bkz. CORE `LegGait`).
        if (legs.steppingLimbCount > bound) {
          note(`${at}: normal rejimde ${legs.steppingLimbCount} uzuv havada (sınır ${bound})`);
        }
      } else {
        emergencyFrames++;
      }
      if (legs.steppingLimbCount > rig.limbs.length) {
        note(`${at}: havadaki uzuv sayısı uzuv sayısını aşıyor`);
      }

      for (const limb of rig.limbs) {
        const geometry = geometryOf(limb);
        if (!Number.isFinite(geometry.footX) || !Number.isFinite(geometry.footY)) {
          note(`${at} — ${limb.id}: ayak konumu sonlu değil`);
          continue;
        }

        // Hiçbir kare uzvu kendi uzunluğundan öteye germez.
        const reach = Math.hypot(geometry.footX - limb.hipX, geometry.footY - limb.hipY);
        if (reach > totalLength(limb) + 1e-6) {
          note(`${at} — ${limb.id}: uzuv gerildi (${reach} > ${totalLength(limb)})`);
        }

        // Diz TERS bükülmez. Tam gerili/katlanmış uzuvda çarpım sıfıra yaklaşır
        // ve işaret anlamını yitirir; orada kontrol atlanır.
        const cross = bendCross(geometry);
        if (Math.abs(cross) > limb.upperLength * limb.lowerLength * 1e-6) {
          bendChecks++;
          const expected = Math.sign(gaitConfig.stance[limb.id].bendSign);
          if (Math.sign(cross) !== expected) {
            note(`${at} — ${limb.id}: diz TERS büküldü (${Math.sign(cross)} ≠ ${expected})`);
          }
        }
      }
    }

    expect(violations).toEqual([]);

    // Akış gerçekten çalıştı mı? Hiçbir şey tetiklenmeden geçen bir test,
    // yalnız kendini doğrular.
    expect(dashPresses).toBeGreaterThan(100);
    expect(peakStepping).toBeGreaterThan(0);
    expect(bendChecks).toBeGreaterThan(10_000);
    // Acil rejim bu akışta gerçekten yaşanmalı; yaşanmıyorsa yukarıdaki
    // rejim ayrımı hiç sınanmamış demektir.
    expect(emergencyFrames).toBeGreaterThan(0);
  });
});

/**
 * DETERMİNİZM.
 *
 * Aynı girdi akışı + aynı delta dizisi → aynı yörünge. Bu, locomotion'ın
 * regresyon kilididir: bir ayar ya da düzeltme davranışı değiştirdiğinde sayı
 * DEĞİŞİR ve değişikliğin bilinçli olup olmadığı sorulur.
 *
 * Altın değer elle yazılmaz, ilk koşudan alınır ve buraya sabitlenir; testin
 * kendisi hesabı iki kez yapıp karşılaştırmaz — öyle olsaydı yalnız
 * "kod kendine karşı deterministik" derdi, davranış değişimini görmezdi.
 */
const SCENARIO: ReadonlyArray<{ intent: [number, number]; dash: boolean; ms: number }> = [
  { intent: [0, -1], dash: false, ms: 500 },
  { intent: [1, -1], dash: false, ms: 700 },
  { intent: [0, 0], dash: false, ms: 200 },
  { intent: [-1, 0], dash: false, ms: 400 },
  { intent: [-1, 0], dash: true, ms: 300 },
  { intent: [-1, -1], dash: false, ms: 900 },
  { intent: [0, 1], dash: true, ms: 600 },
  { intent: [0, 0], dash: false, ms: 500 },
];
const SCENARIO_FRAME_MS = 16;

/** Senaryoyu koşar ve son durumu okunabilir bir imzaya indirger. */
function runScenario(): string {
  const chain = makeChain();
  for (const leg of SCENARIO) {
    const intent = new Vector2(leg.intent[0], leg.intent[1]);
    for (let elapsed = 0; elapsed < leg.ms; elapsed += SCENARIO_FRAME_MS) {
      step(chain, intent, leg.dash, SCENARIO_FRAME_MS);
    }
  }

  const { body, legs, rig } = chain;
  const parts = [
    body.position.x,
    body.position.y,
    body.velocity.x,
    body.velocity.y,
    body.facingRad,
    body.turnRate,
    body.dash01,
    legs.steppingLimbCount,
  ];
  for (const limb of rig.limbs) {
    const geometry = geometryOf(limb);
    parts.push(geometry.footX, geometry.footY);
  }
  return parts.map((value) => (typeof value === 'number' ? value.toFixed(6) : value)).join('|');
}

describe('locomotion determinizmi', () => {
  it('aynı girdi ve delta dizisi aynı yörüngeyi üretir', () => {
    expect(runScenario()).toBe(runScenario());
  });

  it('senaryonun sonu SABİTLENMİŞ bir duruma varır', () => {
    /*
     * Altın imza. Düştüğünde soru "test yanlış mı?" değil, "davranışı bilerek
     * mi değiştirdim?"dir. Bilinçliyse yeni imza buraya yazılır; değilse bir
     * locomotion regresyonu yakalanmıştır.
     *
     * İmza gövde durumunu ve ON uzvun ayak konumunu taşır — yürüyüş döngüsü,
     * IK ve gövde entegrasyonu aynı anda kilitlenir.
     */
    const signature = runScenario();
    const fields = signature.split('|');

    expect(fields).toHaveLength(8 + 10 * 2);
    expect(signature).toMatchSnapshot();
  });
});
