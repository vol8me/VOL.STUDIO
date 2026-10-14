import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SPIDER_ART, SPIDER_LOOKS } from '@/config/spiders';
import { WALKER_IDS } from '@/config/vehicles';
import type { LocomotionSignals } from '@/view/spider/signals';
import { SpiderLegs, lightLocal } from '@/view/spider/SpiderLegs';
import { SpiderMotion } from '@/view/spider/SpiderMotion';
import { fakeScene, lastCall } from '../../support/fakeScene';

const STEP_MS = 1000 / 60;

describe.each(WALKER_IDS.map((id) => [id, SPIDER_LOOKS[id]] as const))(
  'SpiderLegs (%s)',
  (_id, look) => {
    const topSpeed = look.gait.fullTempoSpeed;

    function build() {
      const scene = fakeScene();
      const layers = { ground: scene.add.container(0, 0), legs: scene.add.container(0, 0) };
      const legs = new SpiderLegs(scene as unknown as Phaser.Scene, look, layers as never);
      const motion = new SpiderMotion(look);
      const light = lightLocal(0, { x: 0, y: 0 });
      const signals: LocomotionSignals = {
        x: 0,
        y: 0,
        velX: 0,
        velY: 0,
        speed: 0,
        accelX: 0,
        accelY: 0,
        travelHeadingRad: 0,
        facingHeadingRad: 0,
        turnRateRadPerSec: 0,
        dash01: 0,
        impact01: 0,
      };
      legs.reset(0, 0, 0, motion.update(signals, STEP_MS), light);
      /** Gövdeyi +x yönünde `frames` kare sürer; her kare bir simülasyon adımıdır. */
      const walk = (frames: number, speed: number, visit?: () => void): void => {
        for (let i = 0; i < frames; i++) {
          signals.x += (speed * STEP_MS) / 1000;
          signals.velX = speed;
          signals.speed = speed;
          legs.update(signals, motion.update(signals, STEP_MS), STEP_MS, light);
          visit?.();
        }
      };
      return { scene, layers, legs, signals, walk };
    }

    it('sekiz bacak kurar: yan başına dört kalça, her biri femur, tibia, pençe, diz ve temas karartısı taşır', () => {
      const { scene, legs, layers } = build();
      expect(legs.legCount).toBe(look.hips.length * 2);
      const images = scene.created.filter((object) => object.kind === 'image');
      expect(images).toHaveLength(legs.legCount * 5);
      // Bütün bacak parçaları TEK katmandadır: gövdenin altında kalır.
      const added = layers.legs.calls
        .filter(([name]) => name === 'add')
        .flatMap(([, args]) => args[0] as unknown[]);
      expect(added).toHaveLength(legs.legCount * 4);
      for (let i = 0; i < legs.legCount; i++)
        for (const part of legs.partsOf(i)) expect(added).toContain(part);
    });

    it('her kalça gövde hattının içindedir ve ayağa göre dışarı bakar', () => {
      const { legs } = build();
      const thorax = look.parts.thorax;
      for (let i = 0; i < legs.legCount; i++) {
        const hip = legs.hipOf(i);
        // Kalça göğüs kutusunun içinde: femur kabuğun altından çıkar.
        expect(Math.abs(hip.y)).toBeLessThan(thorax.height / 2 - 4);
        expect(hip.x).toBeGreaterThan(look.body.thoraxX - thorax.pivotX);
        expect(hip.x).toBeLessThan(look.body.thoraxX + (thorax.width - thorax.pivotX));
        // Ayak kalçadan en az bir femur yarıçapı kadar dışarıdadır (diz kabuğun dışında kalır).
        const foot = legs.footOf(i);
        expect(Math.hypot(foot.x - hip.x, foot.y - hip.y)).toBeGreaterThan(look.leg.femur);
      }
    });

    it('dururken hiçbir bacak adımda değildir ve ayaklar kalçanın altında basılıdır', () => {
      const { legs, walk } = build();
      walk(60, 0);
      expect(legs.steppingCount).toBe(0);
      for (let i = 0; i < legs.legCount; i++) expect(legs.footOf(i).lift).toBe(0);
    });

    it('yürürken dönüşümlü dört-ayaklı: aynı anda en çok dört bacak havada, hep bir grup yerde', () => {
      const { legs, walk } = build();
      let peak = 0;
      let emergencies = 0;
      walk(300, topSpeed * 0.4, () => {
        peak = Math.max(peak, legs.steppingCount);
        emergencies += legs.emergencyCount;
      });
      expect(peak).toBeGreaterThan(0);
      expect(peak).toBeLessThanOrEqual(look.hips.length);
      expect(emergencies).toBe(0);
    });

    it('basılı ayak dünyada sabit kalır: gövde ilerlerken yerinden oynamaz', () => {
      const { legs, walk } = build();
      walk(40, topSpeed * 0.5);
      const before = Array.from({ length: legs.legCount }, (_, i) => legs.footOf(i));
      let held = 0;
      walk(1, topSpeed * 0.5, () => {
        for (let i = 0; i < legs.legCount; i++) {
          const foot = legs.footOf(i);
          if (before[i].lift === 0 && foot.lift === 0) {
            expect(foot.x).toBeCloseTo(before[i].x, 9);
            expect(foot.y).toBeCloseTo(before[i].y, 9);
            held += 1;
          }
        }
      });
      expect(held).toBeGreaterThan(2);
    });

    it('tavan hızında bile ayaklar kalçadan kemik erişimini aşmaz: bacak yerde sürüklenmez', () => {
      const { legs, signals, walk } = build();
      const reach = look.leg.femur + look.leg.tibia;
      let worst = 0;
      walk(240, topSpeed, () => {
        for (let i = 0; i < legs.legCount; i++) {
          const foot = legs.footOf(i);
          const hip = legs.hipOf(i);
          worst = Math.max(
            worst,
            Math.hypot(foot.x - signals.x - hip.x, foot.y - signals.y - hip.y),
          );
        }
      });
      expect(worst).toBeLessThan(reach);
    });

    it('adım atan ayak yükselir: havadaki ayağın temas karartısı soluklaşır', () => {
      const { legs, walk, scene } = build();
      let lifted = -1;
      walk(120, topSpeed * 0.6, () => {
        for (let i = 0; i < legs.legCount; i++)
          if (legs.footOf(i).lift > 0.5 && lifted < 0) lifted = i;
      });
      expect(lifted).toBeGreaterThanOrEqual(0);
      const contacts = scene.created.filter(
        (object) => object.kind === 'image' && lastCall(object, 'setAlpha') !== undefined,
      );
      const alphas = contacts.flatMap((object) =>
        object.calls.filter(([name]) => name === 'setAlpha').map(([, args]) => args[0] as number),
      );
      expect(Math.min(...alphas)).toBeLessThan(0.5);
      expect(Math.max(...alphas)).toBeGreaterThan(0.85);
    });

    it('ışık dünyada sabittir: gövde dönünce gölge kayması gövde-yerel yönde döner', () => {
      const forward = lightLocal(0, { x: 0, y: 0 });
      const turned = lightLocal(Math.PI / 2, { x: 0, y: 0 });
      expect(forward).toEqual({ x: SPIDER_ART.light.x, y: SPIDER_ART.light.y });
      expect(Math.hypot(turned.x, turned.y)).toBeCloseTo(Math.hypot(forward.x, forward.y), 9);
      expect(turned.x).toBeCloseTo(SPIDER_ART.light.y, 9);
      expect(turned.y).toBeCloseTo(-SPIDER_ART.light.x, 9);
    });
  },
);
