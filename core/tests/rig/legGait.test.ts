import { describe, it, expect } from 'vitest';
import { LegGait, type LegGaitLeg } from '../../src/rig/LegGait';

const CONFIG = {
  stepTriggerPx: 30,
  stepDurationMs: 120,
  stepLeadSeconds: 0.12,
};

/** Dört bacak, iki alternating grup. */
const LEGS: LegGaitLeg[] = [
  { homeX: 60, homeY: -40, group: 0 },
  { homeX: 60, homeY: 40, group: 1 },
  { homeX: -60, homeY: -40, group: 1 },
  { homeX: -60, homeY: 40, group: 0 },
];

const DT = 16;

function driveForward(gait: LegGait, frames: number, speedPxPerSec = 200) {
  let x = 0;
  for (let i = 0; i < frames; i++) {
    x += (speedPxPerSec * DT) / 1000;
    gait.update(x, 0, 0, speedPxPerSec, 0, DT);
  }
  return x;
}

describe('LegGait', () => {
  it('bacaksız kurulum reddedilir', () => {
    expect(() => new LegGait([], CONFIG)).toThrow(/en az bir bacak/);
  });

  it('gövde durduğunda ayaklar SABİT kalır, adım atılmaz', () => {
    const gait = new LegGait(LEGS, CONFIG);
    gait.update(0, 0, 0, 0, 0, DT);
    const before = LEGS.map((_, i) => [gait.footX(i), gait.footY(i)]);

    for (let i = 0; i < 120; i++) gait.update(0, 0, 0, 0, 0, DT);

    LEGS.forEach((_, i) => {
      expect(gait.footX(i)).toBeCloseTo(before[i][0], 6);
      expect(gait.footY(i)).toBeCloseTo(before[i][1], 6);
      expect(gait.isStepping(i)).toBe(false);
    });
  });

  it('gövde hareket ederken ayak DÜNYADA sabit kalır, sonra adım atar', () => {
    const gait = new LegGait(LEGS, CONFIG);
    gait.update(0, 0, 0, 0, 0, DT);
    const plantedX = gait.footX(0);

    // Adım eşiğinin altında kalacak kadar kısa bir hareket: ayak kaymamalı.
    gait.update(10, 0, 0, 200, 0, DT);
    expect(gait.footX(0)).toBeCloseTo(plantedX, 6);

    // Eşiği aşacak kadar ilerle: adım başlamalı ve ayak İLERİ taşınmalı.
    driveForward(gait, 40);
    expect(gait.footX(0)).toBeGreaterThan(plantedX);
  });

  it('karşı gruplar aynı anda adım atmaz — her an yerde ayak kalır', () => {
    const gait = new LegGait(LEGS, CONFIG);
    gait.update(0, 0, 0, 0, 0, DT);

    let x = 0;
    for (let frame = 0; frame < 400; frame++) {
      x += (220 * DT) / 1000;
      gait.update(x, 0, 0, 220, 0, DT);

      const groupsStepping = new Set<number>();
      LEGS.forEach((leg, i) => {
        if (gait.isStepping(i)) groupsStepping.add(leg.group);
      });
      expect(groupsStepping.size).toBeLessThanOrEqual(1);

      const planted = LEGS.filter((_, i) => !gait.isStepping(i)).length;
      expect(planted).toBeGreaterThan(0);
    }
  });

  it('adım ortasında ayak kalkar, adım bitince yere iner', () => {
    const gait = new LegGait(LEGS, CONFIG);
    gait.update(0, 0, 0, 0, 0, DT);

    let sawLift = false;
    let x = 0;
    for (let frame = 0; frame < 200; frame++) {
      x += (220 * DT) / 1000;
      gait.update(x, 0, 0, 220, 0, DT);
      for (let i = 0; i < LEGS.length; i++) {
        if (gait.isStepping(i) && gait.lift(i) > 0.5) sawLift = true;
        if (!gait.isStepping(i)) expect(gait.lift(i)).toBe(0);
      }
    }
    expect(sawLift).toBe(true);
  });

  it('adım hedefi hız yönünde İLERİ konur — ayak gideceği yere basar', () => {
    const gait = new LegGait(LEGS, CONFIG);
    gait.update(0, 0, 0, 0, 0, DT);
    const x = driveForward(gait, 200, 240);

    // Yürüyüş sonunda her ayak gövdeyle birlikte taşınmış olmalı.
    for (let i = 0; i < LEGS.length; i++) {
      expect(gait.footX(i)).toBeGreaterThan(x - 150);
      expect(gait.footX(i)).toBeLessThan(x + 150);
    }
  });

  it('reset ayakları gövdenin altına adımsız yerleştirir', () => {
    const gait = new LegGait(LEGS, CONFIG);
    driveForward(gait, 100);
    gait.reset(500, 300, 0);

    for (let i = 0; i < LEGS.length; i++) {
      expect(gait.isStepping(i)).toBe(false);
      expect(gait.footX(i)).toBeCloseTo(500 + LEGS[i].homeX, 6);
      expect(gait.footY(i)).toBeCloseTo(300 + LEGS[i].homeY, 6);
    }
  });

  it('gövde dönünce ev konumları da döner', () => {
    const gait = new LegGait(LEGS, CONFIG);
    gait.reset(0, 0, Math.PI / 2);
    // homeX=60,homeY=-40 → 90° dönüşte (40, 60)
    expect(gait.footX(0)).toBeCloseTo(40, 4);
    expect(gait.footY(0)).toBeCloseTo(60, 4);
  });

  it('canlı tempo ayarı basılı ayakları sıfırlamadan adımı hızlandırır', () => {
    const normal = new LegGait(LEGS, CONFIG);
    const fast = new LegGait(LEGS, CONFIG);
    normal.reset(0, 0, 0);
    fast.reset(0, 0, 0);
    fast.setStepTuning({ stepTriggerPx: 30, stepDurationMs: 60 });

    normal.update(40, 0, 0, 200, 0, 40);
    fast.update(40, 0, 0, 200, 0, 40);
    const plantedBefore = fast.footX(0);

    normal.update(48, 0, 0, 200, 0, 40);
    fast.update(48, 0, 0, 200, 0, 40);

    expect(fast.footX(0)).toBeGreaterThan(plantedBefore);
    expect(fast.footX(0)).toBeGreaterThan(normal.footX(0));
  });

  it('geçersiz canlı tempo ayarını reddeder', () => {
    const gait = new LegGait(LEGS, CONFIG);
    expect(() => gait.setStepTuning({ stepTriggerPx: 0, stepDurationMs: 100 })).toThrow(/pozitif/);
    expect(() => gait.setStepTuning({ stepTriggerPx: 30, stepDurationMs: NaN })).toThrow(/sonlu/);
  });
});
