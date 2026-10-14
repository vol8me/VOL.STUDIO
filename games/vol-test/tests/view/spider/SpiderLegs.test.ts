import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SPIDER_ART, SPIDER_LOOKS } from '@/config/spiders';
import { WALKER_IDS } from '@/config/vehicles';
import type { LocomotionSignals } from '@/view/spider/signals';
import { SpiderLegs, lightLocal } from '@/view/spider/SpiderLegs';
import { SpiderMotion } from '@/view/spider/SpiderMotion';
import { fakeScene, lastCall, type FakeObject } from '../../support/fakeScene';

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

    it('atılışta bacaklar hızlanmaz, adımlar uzar: adım sıklığı yürüyüşün 1,6 katını aşmaz, adım boyu artar', () => {
      const cadence = (speed: number, dash01: number) => {
        const subject = build();
        subject.signals.dash01 = dash01;
        subject.walk(60, speed);
        let plants = 0;
        const frames = 240;
        subject.walk(frames, speed, () => subject.legs.forEachPlant(() => (plants += 1)));
        const seconds = (frames * STEP_MS) / 1000;
        return { perSecond: plants / seconds, stride: speed / (plants / seconds) };
      };
      const walking = cadence(topSpeed, 0);
      const dashing = cadence(topSpeed * 2.3, 1);
      expect(dashing.perSecond).toBeLessThan(walking.perSecond * 1.6);
      expect(dashing.stride).toBeGreaterThan(walking.stride * 1.3);
    });

    it('av atılışında ön ayaklar ileri fırlar, arka ayaklar geride kalır ve ayaklar kemik erişiminin kısa bir payı içinde kalır', () => {
      const idle = build();
      idle.walk(120, topSpeed * 0.6);
      const dash = build();
      dash.signals.dash01 = 1;
      const dashSpeed = topSpeed * 2.3;
      dash.walk(120, dashSpeed);
      const relative = (subject: ReturnType<typeof build>, index: number): number =>
        subject.legs.footOf(index).x - subject.signals.x - subject.legs.hipOf(index).x;
      const front = 0;
      const rear = look.hips.length - 1;
      // Aynı uzaklıkta ölçmek için ayakların yürüyüş döngüsündeki fazı yerine en uzak erişim alınır.
      let frontReach = -Infinity;
      let rearReach = Infinity;
      dash.walk(60, dashSpeed, () => {
        frontReach = Math.max(frontReach, relative(dash, front), relative(dash, front + 4));
        rearReach = Math.min(rearReach, relative(dash, rear), relative(dash, rear + 4));
      });
      let idleFront = -Infinity;
      let idleRear = Infinity;
      idle.walk(60, topSpeed * 0.6, () => {
        idleFront = Math.max(idleFront, relative(idle, front), relative(idle, front + 4));
        idleRear = Math.min(idleRear, relative(idle, rear), relative(idle, rear + 4));
      });
      expect(frontReach).toBeGreaterThan(idleFront + look.leg.dashLungePx * 0.3);
      // Arka ayaklar kemik erişimi sınırına dayanır; atılışta idle'dan en az 1 birim daha geride kalırlar.
      expect(rearReach).toBeLessThan(idleRear - 1);
      const reach = look.leg.femur + look.leg.tibia;
      let worst = 0;
      dash.walk(120, dashSpeed, () => {
        for (let i = 0; i < dash.legs.legCount; i++) {
          const foot = dash.legs.footOf(i);
          const hip = dash.legs.hipOf(i);
          worst = Math.max(
            worst,
            Math.hypot(foot.x - dash.signals.x - hip.x, foot.y - dash.signals.y - hip.y),
          );
        }
      });
      // Atılış hızında ayak, hatırı sayılır bir geç kalmayla en çok bir-iki kare erişimi aşabilir; çizimde
      // `solveLeg` ayağı kemik erişimine kelepçeler, yani kemikler geçerli kalır.
      expect(worst).toBeLessThan(reach * 1.15);
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

    it('kırık bacak kütük bırakır: tibia, pençe ve temas karartısı gizlenir, femur kısalır, diz kalır; onarım geri getirir', () => {
      const { legs, walk } = build();
      walk(60, topSpeed * 0.6);
      const [femur, tibia, tarsus, knee] = legs.partsOf(5) as unknown as FakeObject[];
      const intactScale = lastCall(femur, 'setScale')?.[0] as number;
      legs.setBroken(1 << 5);
      walk(10, topSpeed * 0.6);
      expect(tibia.visible).toBe(false);
      expect(tarsus.visible).toBe(false);
      expect(lastCall(femur, 'setScale')?.[0] as number).toBeLessThan(intactScale);
      expect(knee.visible).not.toBe(false);
      // Sağlam bacak etkilenmez.
      const [, otherTibia] = legs.partsOf(1);
      expect(otherTibia.visible).not.toBe(false);
      legs.setBroken(0);
      walk(10, topSpeed * 0.6);
      expect(tibia.visible).toBe(true);
      expect(tarsus.visible).toBe(true);
    });

    it('kırık bacak yere basmaz: toz/iz ziyaret listelerinden çıkar', () => {
      const { legs, walk } = build();
      const planted = new Set<string>();
      legs.setBroken(0b0000_1111);
      let feet = 0;
      legs.forEachFoot(() => feet++);
      expect(feet).toBe(legs.legCount - 4);
      walk(180, topSpeed * 0.7, () =>
        legs.forEachPlant((x, y) => planted.add(`${Math.round(x)},${Math.round(y)}`)),
      );
      expect(planted.size).toBeGreaterThan(0);
      legs.setBroken(0);
      feet = 0;
      legs.forEachFoot(() => feet++);
      expect(feet).toBe(legs.legCount);
    });

    it('gövde çökmesi kalçaları kırık yana kaydırır', () => {
      const a = build();
      const b = build();
      b.legs.setSag(4);
      a.walk(2, 0);
      b.walk(2, 0);
      const hipY = (rig: ReturnType<typeof build>): number => rig.legs.partsOf(0)[0].y;
      expect(hipY(b) - hipY(a)).toBeCloseTo(4, 0);
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
