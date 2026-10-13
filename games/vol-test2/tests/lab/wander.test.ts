import { describe, expect, it } from 'vitest';
import { seeded } from '../../src/lab/random';
import {
  createWander,
  stepWander,
  velocityOf,
  wrapAngle,
  type WanderOptions,
  type WanderState,
} from '../../src/lab/wander';

const OPTIONS: WanderOptions = {
  width: 1600,
  height: 900,
  margin: 150,
  cruise: 100,
  maxTurnRate: 0.6,
};
const DT = 1 / 60;

function simulate(
  seed: number,
  options: WanderOptions,
  seconds: number,
  onStep?: (state: WanderState) => void,
): WanderState {
  const random = seeded(seed);
  const state = createWander(random, options);
  for (let index = 0; index < seconds * 60; index++) {
    stepWander(state, DT, random, options);
    onStep?.(state);
  }
  return state;
}

describe('wrapAngle', () => {
  it('açıyı [-π, π) aralığına sarar', () => {
    expect(wrapAngle(0)).toBeCloseTo(0);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 5);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2, 5);
    expect(wrapAngle(7)).toBeCloseTo(7 - Math.PI * 2, 5);
  });
});

describe('createWander', () => {
  it('başlangıç kenar payının içinde, duruyor ve aynı tohumla aynıdır', () => {
    const a = createWander(seeded(5), OPTIONS);
    const b = createWander(seeded(5), OPTIONS);
    expect(a).toEqual(b);
    expect(a.speed).toBe(0);
    expect(a.homing).toBe(false);
    expect(a.x).toBeGreaterThanOrEqual(OPTIONS.margin);
    expect(a.x).toBeLessThanOrEqual(OPTIONS.width - OPTIONS.margin);
    expect(a.y).toBeGreaterThanOrEqual(OPTIONS.margin);
    expect(a.y).toBeLessThanOrEqual(OPTIONS.height - OPTIONS.margin);
  });

  it('alan kenar payından küçükse de çökmez', () => {
    const state = createWander(seeded(1), { ...OPTIONS, width: 100, height: 100 });
    expect(Number.isFinite(state.x) && Number.isFinite(state.y)).toBe(true);
  });
});

describe('stepWander', () => {
  it('hız ivmeyle seyir hızına çıkar ve onu aşmaz; hız vektörü yönle uyumludur', () => {
    const random = seeded(3);
    const state = createWander(random, OPTIONS);
    state.pauseIn = 1e9;
    let top = 0;
    for (let index = 0; index < 60 * 5; index++) {
      stepWander(state, DT, random, OPTIONS);
      top = Math.max(top, state.speed);
      const [vx, vy] = velocityOf(state);
      expect(Math.hypot(vx, vy)).toBeCloseTo(state.speed, 6);
    }
    expect(top).toBeLessThanOrEqual(OPTIONS.cruise + 1e-9);
    expect(top).toBeGreaterThan(OPTIONS.cruise * 0.5);
  });

  it('yön kare başına en çok dönüş hızı kadar değişir (kenarda üç katına kadar)', () => {
    const random = seeded(8);
    const state = createWander(random, OPTIONS);
    let previous = state.heading;
    for (let index = 0; index < 60 * 60; index++) {
      stepWander(state, DT, random, OPTIONS);
      const turn = Math.abs(wrapAngle(state.heading - previous));
      expect(turn).toBeLessThanOrEqual(OPTIONS.maxTurnRate * 3 * DT + 1e-9);
      previous = state.heading;
    }
  });

  it('alan içinde kalır: konum hiçbir karede dışarı taşmaz', () => {
    for (const seed of [1, 2, 3]) {
      simulate(seed, OPTIONS, 60, (state) => {
        expect(state.x).toBeGreaterThanOrEqual(0);
        expect(state.x).toBeLessThanOrEqual(OPTIONS.width);
        expect(state.y).toBeGreaterThanOrEqual(0);
        expect(state.y).toBeLessThanOrEqual(OPTIONS.height);
      });
    }
  });

  it('kenar payına girmeden önce döner: en yakın kenar uzaklığı payın yarısının altına inmez', () => {
    const cases: WanderOptions[] = [
      OPTIONS,
      { ...OPTIONS, width: 853, height: 533, cruise: 75 },
      { ...OPTIONS, cruise: 150, maxTurnRate: 1.5 },
    ];
    for (const options of cases) {
      for (const seed of [1, 2, 3, 4]) {
        let nearest = Infinity;
        simulate(seed, options, 90, (state) => {
          nearest = Math.min(
            nearest,
            state.x,
            state.y,
            options.width - state.x,
            options.height - state.y,
          );
        });
        expect(nearest, `tohum ${seed}, ${options.width}x${options.height}`).toBeGreaterThan(
          options.margin * 0.5,
        );
      }
    }
  });

  it('kenara dönerken rastgele bir iç hedef seçer ve kenardan çıkınca bırakır', () => {
    const random = seeded(2);
    const state = createWander(random, OPTIONS);
    state.x = 20;
    state.y = 400;
    state.heading = Math.PI; // kenara doğru
    state.speed = 80;
    stepWander(state, DT, random, OPTIONS);
    expect(state.homing).toBe(true);
    expect(state.homeX).toBeGreaterThanOrEqual(OPTIONS.margin);
    expect(state.homeX).toBeLessThanOrEqual(OPTIONS.width - OPTIONS.margin);
    expect(state.homeY).toBeGreaterThanOrEqual(OPTIONS.margin);
    const home = [state.homeX, state.homeY];
    stepWander(state, DT, random, OPTIONS);
    expect([state.homeX, state.homeY]).toEqual(home); // aynı kenar olayında hedef sabit
    state.x = 800;
    state.y = 450;
    state.heading = 0;
    stepWander(state, DT, random, OPTIONS);
    expect(state.homing).toBe(false);
  });

  it('ara sıra durur: duraklama süresince hız sıfıra iner', () => {
    const random = seeded(4);
    const state = createWander(random, OPTIONS);
    state.speed = OPTIONS.cruise;
    state.x = 800;
    state.y = 450;
    state.pauseIn = 0;
    let minSpeed = OPTIONS.cruise;
    for (let index = 0; index < 60 * 3; index++) {
      stepWander(state, DT, random, OPTIONS);
      minSpeed = Math.min(minSpeed, state.speed);
    }
    expect(minSpeed).toBeLessThan(5);
  });

  it('aynı tohum aynı yolu verir', () => {
    const a = simulate(9, OPTIONS, 30);
    const b = simulate(9, OPTIONS, 30);
    expect(a).toEqual(b);
  });
});
