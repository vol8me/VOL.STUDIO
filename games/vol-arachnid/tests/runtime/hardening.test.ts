import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Vector2, i18n, i18next } from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import { playerConfig } from '@/config/player';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';
import '@/i18next-augment';
import { ArachnidBody } from '@/runtime/entity/ArachnidBody';
import { ArachnidLegs } from '@/runtime/entity/ArachnidLegs';
import type { LocomotionSignals, PoseSignals } from '@/runtime/entity/locomotionSignals';
import { Arena } from '@/runtime/entity/Arena';
import { ArachnidDust } from '@/runtime/fx/ArachnidDust';
import { ArachnidBodyMotion } from '@/runtime/rig/ArachnidBodyMotion';
import { prepareArachnidRig, type ArachnidRig } from '@/runtime/rig/arachnidRig';
import { ArachnidHud } from '@/runtime/ui/ArachnidHud';
import {
  arachnidTestMetadata as metadata,
  assembleTestRig,
  buildTestRigDefinition,
  createFakeScene,
} from '../support/phaserFakes';
import { bodySignals, poseSignals } from '../support/locomotion';

/**
 * SAĞLAMLAŞTIRMA
 *
 * Her genel giriş noktası, düşmanca akış değerleriyle (NaN, ±Infinity, negatif
 * delta, dev delta) beslenir. Beklenti "doğru sonuç" değil, DAYANIKLILIKTIR:
 * hiçbir çağrı patlamaz ve hiçbir durum kalıcı olarak NaN'e düşmez — bir kare
 * bozulduğunda yaratığın geri kalan ömrü bozulmamalıdır.
 *
 * Bu değerler uydurma değildir: `deltaMs` sekme/uyku sonrası dev olur, hız
 * sıfıra bölme ürünü olarak NaN'e düşebilir, kaydırılan bir pencere sıfır
 * boyutlu kare üretir.
 */
const HOSTILE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0, 1e9];

function makeRig(): ArachnidRig {
  const definition = buildTestRigDefinition();
  return prepareArachnidRig(metadata, assembleTestRig(createFakeScene(definition), definition));
}

const isFinitePose = (rig: ArachnidRig): boolean =>
  rig.limbs.every(
    (limb) =>
      Number.isFinite(limb.upper.rotation) &&
      Number.isFinite(limb.lower.rotation) &&
      (limb.root === null || Number.isFinite(limb.root.rotation)),
  );

/** Uzuvları bir kare sürer; gövde ve poz sinyalleri ayrı verilir. */
function driveLegs(
  legs: ArachnidLegs,
  body: Partial<LocomotionSignals> = {},
  pose: Partial<PoseSignals> = {},
  deltaMs = 16,
): void {
  legs.update(bodySignals(body), poseSignals(pose), deltaMs);
}

describe('sağlamlaştırma — gövde', () => {
  it('düşmanca delta ve niyet değerlerinde konum/hız sonlu kalır', () => {
    const body = new ArachnidBody(arenaConfig.widthPx / 2, arenaConfig.heightPx / 2);

    for (const value of HOSTILE) {
      body.update(new Vector2(value, value), true, value);
      body.update(new Vector2(1, 0), false, 16);
      expect(Number.isFinite(body.position.x), `delta ${value}`).toBe(true);
      expect(Number.isFinite(body.position.y)).toBe(true);
      expect(Number.isFinite(body.speed)).toBe(true);
      expect(Number.isFinite(body.facingRad)).toBe(true);
      expect(Number.isFinite(body.turnRate)).toBe(true);
    }
  });

  it('gövde hiçbir akışta arenanın DIŞINA çıkmaz', () => {
    const body = new ArachnidBody(arenaConfig.widthPx / 2, arenaConfig.heightPx / 2);
    const r = arenaConfig.bodyRadiusPx;

    for (let i = 0; i < 4000; i++) {
      const angle = (i * 2.399) % (Math.PI * 2);
      body.update(new Vector2(Math.cos(angle), Math.sin(angle)), i % 7 === 0, 16);
      expect(body.position.x).toBeGreaterThanOrEqual(r - 1e-6);
      expect(body.position.x).toBeLessThanOrEqual(arenaConfig.widthPx - r + 1e-6);
      expect(body.position.y).toBeGreaterThanOrEqual(r - 1e-6);
      expect(body.position.y).toBeLessThanOrEqual(arenaConfig.heightPx - r + 1e-6);
    }
  });

  it('dönüş hızı hiçbir karede tavanı aşmaz', () => {
    const body = new ArachnidBody(arenaConfig.widthPx / 2, arenaConfig.heightPx / 2);

    for (let i = 0; i < 600; i++) {
      // Her karede zıt yöne kırmak yayı en sert uyarandır.
      const angle = i % 2 === 0 ? 0 : Math.PI;
      body.update(new Vector2(Math.cos(angle), Math.sin(angle)), false, 16);
      expect(Math.abs(body.turnRate)).toBeLessThanOrEqual(playerConfig.maxTurnRateRadPerSec + 1e-9);
    }
  });

  it('atılım cooldown dolmadan yeniden tetiklenemez — spam güvenli', () => {
    const body = new ArachnidBody(arenaConfig.widthPx / 2, arenaConfig.heightPx / 2);
    let dashStarts = 0;
    let wasDashing = false;

    for (let i = 0; i < 600; i++) {
      body.update(new Vector2(1, 0), true, 16);
      if (body.isDashing && !wasDashing) dashStarts++;
      wasDashing = body.isDashing;
    }

    const elapsedMs = 600 * 16;
    const maxStarts = Math.ceil(elapsedMs / playerConfig.dash.cooldownMs) + 1;
    expect(dashStarts).toBeGreaterThan(0);
    expect(dashStarts).toBeLessThanOrEqual(maxStarts);
  });
});

describe('sağlamlaştırma — uzuvlar', () => {
  it('düşmanca sürüş değerlerinde poz sonlu kalır', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, -Math.PI / 2);

    for (const value of HOSTILE) {
      driveLegs(
        legs,
        { x: value, velX: value, speed: value, dash01: value },
        { motion01: value, crouch01: value },
        value,
      );
      driveLegs(legs, { y: -10, velY: -210 }, { motion01: 1 });
      expect(isFinitePose(rig), `değer ${value}`).toBe(true);
    }
  });

  it('havadan yere geçiş her yönde temiz kapanır', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);
    legs.reset(0, 0, -Math.PI / 2);

    let y = 0;
    for (let cycle = 0; cycle < 6; cycle++) {
      for (let i = 0; i < 10; i++) {
        y -= 14;
        driveLegs(legs, { y, velY: -900, grounded: false, dash01: 1 });
      }
      // İniş karesi: bütün ayaklar aynı anda evlerine basar.
      y -= 3;
      driveLegs(legs, { y, velY: -210 }, { motion01: 1 });
      expect(legs.steppingLimbCount, `tur ${cycle} iniş`).toBe(0);

      for (let i = 0; i < 20; i++) {
        y -= 3;
        driveLegs(legs, { y, velY: -210 }, { motion01: 1 });
      }
      expect(isFinitePose(rig), `tur ${cycle}`).toBe(true);
    }
  });

  it('reset her çağrıda aynı duruşu üretir', () => {
    const rig = makeRig();
    const legs = new ArachnidLegs(rig);

    legs.reset(0, 0, -Math.PI / 2);
    const first = rig.limbs.map((limb) => limb.upper.rotation);

    let y = 0;
    for (let i = 0; i < 200; i++) {
      y -= 3;
      driveLegs(legs, { y, velY: -210 }, { motion01: 1 });
    }
    legs.reset(0, 0, -Math.PI / 2);

    expect(rig.limbs.map((limb) => limb.upper.rotation)).toEqual(first);
  });
});

describe('sağlamlaştırma — gövde hareketi ve sunum', () => {
  it('düşmanca sinyallerde parça dönüşümleri sonlu kalır', () => {
    const rig = makeRig();
    const motion = new ArachnidBodyMotion(rig);

    for (const value of HOSTILE) {
      motion.update(
        bodySignals({
          speed: value,
          accelX: value,
          accelY: value,
          turnRateRadPerSec: value,
          dash01: value,
        }),
        value,
      );
      motion.update(bodySignals({ speed: 200 }), 16);
      for (const part of [...rig.shellParts, ...rig.snoutParts, rig.gazePart]) {
        expect(Number.isFinite(part.x), `değer ${value}`).toBe(true);
        expect(Number.isFinite(part.y)).toBe(true);
        expect(Number.isFinite(part.rotation)).toBe(true);
      }
    }
  });

  it('arena yankısı düşmanca delta ve şiddet değerlerinde çökmez', () => {
    const scene = createFakeScene();
    const arena = new Arena(scene as never);

    for (const value of HOSTILE) {
      arena.strike({ x: value, y: value, normalX: value, normalY: 0, strength01: value });
      expect(() => arena.update(value)).not.toThrow();
    }
    arena.destroy();
  });

  it('toz düşmanca hızlarda partikül patlatmaz', () => {
    const scene = createFakeScene();
    const dust = new ArachnidDust(scene as never);

    for (const value of [Number.NaN, Number.NEGATIVE_INFINITY, -1]) {
      dust.puff(0, 0, value);
    }
    expect(scene.emitters[0].bursts).toHaveLength(0);
    dust.destroy();
  });
});

describe('sağlamlaştırma — HUD ömrü', () => {
  beforeAll(async () => {
    i18n.addResources('tr', 'arachnid', tr);
    i18n.addResources('en', 'arachnid', en);
    await i18n.init();
    await i18next.changeLanguage('tr');
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('tekrar tekrar kurulup yıkılınca DOM ve dinleyici biriktirmez', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const on = vi.spyOn(i18next, 'on');
    const off = vi.spyOn(i18next, 'off');

    for (let i = 0; i < 12; i++) {
      const hud = new ArachnidHud(parent, { onToggleFullscreen: () => {} });
      hud.refresh({ dashProgress: 0.5, speedPxPerSec: 120, isDashing: false });
      hud.destroy();
      expect(parent.querySelector('.vol-arachnid-hud')).toBeNull();
    }

    expect(parent.querySelectorAll('.vol-ui-root')).toHaveLength(0);
    expect(off.mock.calls.length).toBe(on.mock.calls.length);
    on.mockRestore();
    off.mockRestore();
  });
});
