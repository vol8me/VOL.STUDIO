import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SPIDER_LOOKS } from '@/config/spiders';
import { ARACHNID, WIDOW } from '@/config/vehicles';
import { LeapTracker } from '@/view/spider/LeapTracker';
import type { LocomotionSignals } from '@/view/spider/signals';
import { SpiderLegs, lightLocal } from '@/view/spider/SpiderLegs';
import { SpiderMotion } from '@/view/spider/SpiderMotion';
import { fakeScene } from '../../support/fakeScene';

const STEP = 1000 / 60;

function idleSignals(): LocomotionSignals {
  return {
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
    impact01: 0,
  };
}

function rigFor(id: 'arachnid' | 'widow' | 'goliath', flightMs: number) {
  const look = SPIDER_LOOKS[id];
  const scene = fakeScene();
  const layers = { ground: scene.add.container(0, 0), legs: scene.add.container(0, 0) };
  const legs = new SpiderLegs(scene as unknown as Phaser.Scene, look, layers as never);
  const motion = new SpiderMotion(look);
  const tracker = new LeapTracker(flightMs);
  const light = lightLocal(0, { x: 0, y: 0 });
  const signals = idleSignals();
  legs.reset(0, 0, 0, motion.update(signals, STEP), light);
  const frame = (airborne: boolean, speed: number) => {
    signals.x += (speed * STEP) / 1000;
    signals.velX = speed;
    signals.speed = speed;
    const air = tracker.update(airborne, STEP);
    const pose = motion.update(signals, STEP, air);
    legs.update(signals, pose, STEP, light, air);
    return { air, pose };
  };
  return { legs, frame };
}

describe.each([ARACHNID, WIDOW].map((spec) => [spec.id, spec] as const))(
  'sıçrama pozu (%s)',
  (_id, spec) => {
    const look = SPIDER_LOOKS[spec.id];
    const leap = look.leap!;
    const flightMs = (spec.walker.boostCapacity / spec.walker.boostDrain) * 1000;
    const total = Math.round(flightMs / STEP);
    const build = () => rigFor(spec.id, flightMs);
    const warm = (rig: ReturnType<typeof build>) => {
      for (let i = 0; i < 60; i++) rig.frame(false, 150);
    };

    it('uçuşta kalça yay yüksekliği kadar kalkar, zirvede `rise`a yaklaşır ve yere dönünce iner', () => {
      const rig = build();
      warm(rig);
      const base = rig.frame(false, 150).pose.hipHeight;
      let top = base;
      for (let i = 0; i < total; i++) top = Math.max(top, rig.frame(true, 345).pose.hipHeight);
      expect(top - base).toBeGreaterThan(leap.rise * 0.8);
      expect(top - base).toBeLessThan(leap.rise * 1.25);
      for (let i = 0; i < 120; i++) rig.frame(false, 150);
      expect(rig.frame(false, 150).pose.hipHeight).toBeCloseTo(base, 0);
    });

    it('kalkış çömelmesi: ilk karelerde kalça yürüyüş yüksekliğinin altına iner', () => {
      const rig = build();
      warm(rig);
      const base = rig.frame(false, 150).pose.hipHeight;
      let lowest = base;
      for (let i = 0; i < 6; i++) lowest = Math.min(lowest, rig.frame(true, 345).pose.hipHeight);
      expect(lowest).toBeLessThan(base - leap.coilDrop * 0.3);
    });

    it('iniş çöker: dönüşten sonra kalça kısa süre yürüyüş yüksekliğinin altına iner', () => {
      const rig = build();
      warm(rig);
      for (let i = 0; i < total; i++) rig.frame(true, 345);
      let lowest = Infinity;
      for (let i = 0; i < 24; i++) lowest = Math.min(lowest, rig.frame(false, 150).pose.hipHeight);
      const base = (() => {
        for (let i = 0; i < 120; i++) rig.frame(false, 150);
        return rig.frame(false, 150).pose.hipHeight;
      })();
      expect(lowest).toBeLessThan(base - 0.5);
    });

    it('gövde kalkışta geri, inişe doğru ileri yaslanır ve karnı zirvede gerilir', () => {
      const rig = build();
      warm(rig);
      let early = 0;
      let late = 0;
      let stretch = 1;
      for (let i = 1; i <= total; i++) {
        const { air, pose } = rig.frame(true, 345);
        if (i === Math.round(total * 0.2)) early = pose.leanX;
        if (i === total - 2) late = pose.leanX;
        if (air.arc > 0.95) stretch = Math.max(stretch, pose.abdomenScale);
      }
      expect(early).toBeLessThan(late);
      expect(stretch).toBeGreaterThan(1 + leap.stretch * 0.5);
    });

    it('uçuşta yürüyüş döngüsü donar: hiçbir ayak basmaz', () => {
      const rig = build();
      warm(rig);
      let plants = 0;
      for (let i = 0; i < total; i++) {
        rig.frame(true, 345);
        rig.legs.forEachPlant(() => (plants += 1));
      }
      expect(plants).toBe(0);
    });

    it('hava pozu ağırlığı kalkışta dolar, inişte boşalır; yürüyüşte hep sıfırdır', () => {
      const rig = build();
      for (let i = 0; i < 30; i++) rig.frame(false, 150);
      expect(rig.legs.airWeight).toBe(0);
      for (let i = 0; i < 12; i++) rig.frame(true, 345);
      expect(rig.legs.airWeight).toBe(1);
      rig.frame(false, 150);
      expect(rig.legs.airWeight).toBeLessThan(1);
      for (let i = 0; i < 24; i++) rig.frame(false, 150);
      expect(rig.legs.airWeight).toBe(0);
    });

    it('zirvede bacaklar toplanır; kalkışta arka bacaklar uzar, inişte ön bacaklar uzanır', () => {
      const rig = build();
      warm(rig);
      const reach = (index: number): number => {
        const foot = rig.legs.localFootOf(index);
        const hip = rig.legs.hipOf(index);
        return Math.hypot(foot.x - hip.x, foot.y - hip.y);
      };
      const front = 0;
      const rear = look.hips.length - 1;
      const samples: Array<{ front: number; rear: number }> = [];
      for (let i = 0; i < total; i++) {
        rig.frame(true, 345);
        samples.push({ front: reach(front), rear: reach(rear) });
      }
      const at = (fraction: number) => samples[Math.floor(total * fraction)];
      const apex = at(0.5);
      expect(apex.front).toBeLessThan(look.leg.restDistance * (leap.tuckReach + 0.25));
      expect(at(0.2).rear).toBeGreaterThan(apex.rear);
      expect(at(0.95).front).toBeGreaterThan(apex.front);
    });

    it('bütün poz değerleri uçuş boyunca sonludur', () => {
      const rig = build();
      warm(rig);
      for (let i = 0; i < total + 30; i++) {
        const { pose } = rig.frame(i < total, 345);
        for (const value of Object.values(pose)) expect(Number.isFinite(value)).toBe(true);
      }
    });
  },
);

describe('sıçramayan görünüm', () => {
  it('Goliath bakışında (`leap` yok) hava pozu hiç oluşmaz', () => {
    const rig = rigFor('goliath', 500);
    for (let i = 0; i < 30; i++) rig.frame(true, 150);
    expect(rig.legs.airWeight).toBe(0);
  });
});
