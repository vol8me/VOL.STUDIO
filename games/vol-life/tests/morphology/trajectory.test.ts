import { describe, expect, it } from 'vitest';
import {
  measureTrajectory,
  resolveLagTicks,
  type TrajectoryFrame,
} from '@/../scripts/morphology/trajectory';

/*
 * E6 fixture'ları. Eski `trajectoryAutocorrelation` otokorelasyon değil,
 * normalize edilmemiş MSD döndürüyordu ve sınıflandırıcı bunu 0,8'lik birimsiz
 * bir eşikle karşılaştırıyordu. Üç büyüklük artık ayrı ve birimi belli.
 *
 * Eşikler ÖLÇÜLDÜ (2026-09-16): daire yarım periyot VACF −1,000 ve tam periyot
 * +1,000; doğrusal +1,000; rastgele yürüyüş |VACF| ≤ 0,12 ve MSD lag ile
 * doğrusal (10,2 → 18,8 → 37,7); kafeslenmiş titreşimde MSD 4R² tavanının
 * altında kalıyor.
 */
const SLOTS = 32;

function frame(
  tick: number,
  state: (index: number) => { x: number; y: number; vx: number; vy: number },
): TrajectoryFrame {
  const positions = new Float32Array(SLOTS * 2).fill(Number.NaN);
  const velocities = new Float32Array(SLOTS * 2).fill(Number.NaN);
  for (let index = 0; index < SLOTS; index++) {
    const current = state(index);
    positions[index * 2] = current.x;
    positions[index * 2 + 1] = current.y;
    velocities[index * 2] = current.vx;
    velocities[index * 2 + 1] = current.vy;
  }
  return { tick, positions, velocities };
}

const PERIOD = 40;
const RADIUS = 50;

function circle(tick: number): TrajectoryFrame {
  return frame(tick, (index) => {
    const phase = (tick / PERIOD) * Math.PI * 2 + (index / SLOTS) * Math.PI * 2;
    return {
      x: Math.cos(phase) * RADIUS,
      y: Math.sin(phase) * RADIUS,
      vx: -Math.sin(phase) * RADIUS,
      vy: Math.cos(phase) * RADIUS,
    };
  });
}

function linear(tick: number): TrajectoryFrame {
  return frame(tick, (index) => ({ x: index * 10 + tick * 2, y: index, vx: 2, vy: 0 }));
}

function caged(tick: number, radius = 3): TrajectoryFrame {
  return frame(tick, (index) => {
    const phase = (tick / 13) * Math.PI * 2 + index;
    return {
      x: Math.cos(phase) * radius,
      y: Math.sin(phase) * radius,
      vx: -Math.sin(phase) * radius,
      vy: Math.cos(phase) * radius,
    };
  });
}

function randomWalk(length: number): TrajectoryFrame[] {
  let seed = 5;
  const random = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const states = Array.from({ length: SLOTS }, () => ({ x: 0, y: 0, vx: 0, vy: 0 }));
  const frames: TrajectoryFrame[] = [];
  for (let tick = 0; tick <= length; tick++) {
    for (const state of states) {
      const angle = random() * Math.PI * 2;
      state.vx = Math.cos(angle);
      state.vy = Math.sin(angle);
      state.x += state.vx;
      state.y += state.vy;
    }
    frames.push(frame(tick, (index) => ({ ...states[index] })));
  }
  return frames;
}

describe('Lag çevrimi (E6)', () => {
  /* Üretim temposu 1000/60 ms; tam sayı kontrolü kayan noktada geçerli lag'i reddediyordu. */
  it('saniyeyi tick’e çevirir ve üretim temposunda çalışır', () => {
    expect(resolveLagTicks(1, 1000 / 60, 10)).toBe(60);
    expect(resolveLagTicks(0.5, 1000 / 60, 10)).toBe(30);
    expect(resolveLagTicks(2, 1000 / 60, 30)).toBe(120);
  });

  it('örnek aralığına bölünmeyen ve geçersiz lag’i reddeder', () => {
    expect(() => resolveLagTicks(1, 1000 / 60, 7)).toThrow(RangeError);
    expect(() => resolveLagTicks(0, 1000 / 60, 10)).toThrow(RangeError);
    expect(() => resolveLagTicks(1, 0, 10)).toThrow(RangeError);
    expect(() => resolveLagTicks(1, 1000 / 60, 0)).toThrow(RangeError);
  });
});

describe('Yörünge ölçüleri (E6)', () => {
  it('dairesel harekette VACF yarım periyotta −1, tam periyotta +1', () => {
    const half = measureTrajectory(circle(0), circle(PERIOD / 2), 5);
    const full = measureTrajectory(circle(0), circle(PERIOD), 5);

    expect(half.velocityAutocorrelation).toBeCloseTo(-1, 2);
    expect(full.velocityAutocorrelation).toBeCloseTo(1, 2);
    expect(full.recurrenceFraction).toBe(1);
    expect(half.recurrenceFraction).toBe(0);
  });

  it('doğrusal harekette VACF 1’dir', () => {
    const measures = measureTrajectory(linear(0), linear(20), 5);

    expect(measures.velocityAutocorrelation).toBeCloseTo(1, 5);
    expect(measures.meanSquaredDisplacement).toBeCloseTo(1600, 5);
  });

  it('rastgele yürüyüşte VACF sıfıra iner, MSD lag ile büyür', () => {
    const frames = randomWalk(100);
    const near = measureTrajectory(frames[0], frames[10], 5);
    const far = measureTrajectory(frames[0], frames[40], 5);

    expect(Math.abs(near.velocityAutocorrelation)).toBeLessThan(0.3);
    expect(Math.abs(far.velocityAutocorrelation)).toBeLessThan(0.3);
    expect(far.meanSquaredDisplacement).toBeGreaterThan(near.meanSquaredDisplacement * 1.8);
  });

  /* Kafeslenmiş titreşim: MSD büyümez, 4R² tavanının altında kalır. */
  it('kafeslenmiş harekette MSD plato yapar', () => {
    const radius = 3;
    const ceiling = 4 * radius * radius;
    const values = [10, 20, 40, 80, 160].map(
      (lag) => measureTrajectory(caged(0, radius), caged(lag, radius), 5).meanSquaredDisplacement,
    );
    const walk = randomWalk(200);
    const walkGrowth =
      measureTrajectory(walk[0], walk[160], 5).meanSquaredDisplacement /
      Math.max(1, measureTrajectory(walk[0], walk[10], 5).meanSquaredDisplacement);

    for (const value of values) expect(value).toBeLessThanOrEqual(ceiling + 1e-6);
    expect(values[values.length - 1] / Math.max(1, values[0])).toBeLessThan(walkGrowth);
  });

  it('pasif slotlar ölçüme girmez', () => {
    const past = circle(0);
    const current = circle(PERIOD);
    const holed = new Float32Array(current.velocities);
    holed[0] = Number.NaN;

    const measures = measureTrajectory(past, { ...current, velocities: holed }, 5);

    expect(measures.sampleCount).toBe(SLOTS - 1);
  });
});
