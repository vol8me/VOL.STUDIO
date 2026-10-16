import { describe, expect, it } from 'vitest';
import type { LakeSpec } from '@/config/lakes';
import { ROCKS, type OutcropSpec } from '@/config/rocks';
import { ARACHNID, GOLIATH, WIDOW, type WalkerSpec } from '@/config/vehicles';
import { LEGS_PER_SIDE } from '@/sim/chassis/parts';
import { Vehicle } from '@/sim/entities/Vehicle';
import { LeapingWalker } from '@/sim/walker/LeapingWalker';
import { Walker } from '@/sim/walker/Walker';
import { World } from '@/sim/world/World';
import { command, DT, world } from '../../support/sim';

const space = world(8192);

function spider(spec: WalkerSpec = ARACHNID, at = { x: 4096, y: 4096 }, arena = space) {
  const result = new LeapingWalker(spec.walker, spec.suspension);
  result.place(at.x, at.y, 0);
  result.capturePose();
  return { result, arena };
}

describe('örümcek sıçraması', () => {
  it('Arachnid ve Widow sıçrar, Goliath düz yürüyücüdür; ikisi de yürüyücü türündedir', () => {
    for (const spec of [ARACHNID, WIDOW]) {
      const chassis = new Vehicle(1, spec).chassis;
      expect(chassis).toBeInstanceOf(LeapingWalker);
      expect(chassis.kind).toBe('walker');
    }
    const goliath = new Vehicle(2, GOLIATH).chassis;
    expect(goliath).not.toBeInstanceOf(LeapingWalker);
    expect(goliath.kind).toBe('walker');
    expect(goliath.airborne).toBe(false);
  });

  it('Space sıçramadır: havaya çıkar, depo süresi kadar havada kalır, iner', () => {
    for (const spec of [ARACHNID, WIDOW]) {
      const { result } = spider(spec);
      const full = command({ moveX: 1, aimX: 1, brake: true });
      let airSteps = 0;
      let peak = 0;
      for (let step = 0; step < 150; step++) {
        result.step(full, space, DT);
        if (result.airborne) airSteps++;
        peak = Math.max(peak, result.speed);
      }
      const expected = spec.walker.boostCapacity / spec.walker.boostDrain / DT;
      expect(airSteps, spec.id).toBeGreaterThan(expected * 0.8);
      expect(airSteps, spec.id).toBeLessThan(expected * 1.4);
      expect(peak, spec.id).toBeGreaterThan(spec.walker.maxSpeed * 1.6);
      expect(result.airborne, spec.id).toBe(false);
    }
  });

  it('yerde atılım yoktur: yürüyüş hızı tavanı aşmaz, sıçrama yalnız havadadır', () => {
    const { result } = spider(ARACHNID);
    const full = command({ moveX: 1, aimX: 1 });
    let top = 0;
    for (let step = 0; step < 240; step++) {
      result.step(full, space, DT);
      top = Math.max(top, result.speed);
      expect(result.airborne).toBe(false);
    }
    expect(top).toBeLessThanOrEqual(ARACHNID.walker.maxSpeed * 1.02);
  });

  it('hareketsiz de sıçrar: fırlatma gövdenin baktığı yöne gider', () => {
    const { result } = spider(ARACHNID);
    result.step(command({ brake: true, aimX: 1 }), space, DT);
    for (let step = 0; step < 6; step++) result.step(command({ aimX: 1 }), space, DT);
    expect(result.airborne).toBe(true);
    expect(result.x).toBeGreaterThan(4096);
    expect(result.y).toBeCloseTo(4096, 0);
  });

  it('havada balistiktir: komut hız yönünü yalnız `leapTurnRate` hızıyla çevirir', () => {
    const { result } = spider(ARACHNID);
    result.step(command({ moveX: 1, aimX: 1, brake: true }), space, DT);
    let deviation = 0;
    for (let step = 0; step < 30 && result.airborne; step++) {
      result.step(command({ moveY: -1, aimX: 1 }), space, DT);
      deviation = Math.max(deviation, Math.abs(Math.atan2(result.vy, result.vx)));
    }
    const duration = ARACHNID.walker.boostCapacity / ARACHNID.walker.boostDrain;
    expect(deviation).toBeGreaterThan(0.05);
    expect(deviation).toBeLessThan(ARACHNID.walker.leapTurnRate * duration + 0.1);
  });

  it('havadaki örümcek kayanın ve suyun üstünden geçer; yerdeki kayayı tırmanır, suda boğulur', () => {
    const outcrop: OutcropSpec = { id: 'test', x: 0.5, y: 0.5, radius: 260, lobes: 1, seed: 7 };
    const rocky = new World(12288, 12288, 128, [], [outcrop]);
    const rock = rocky.rocks.rocks[0];
    const edge = rock.radius * ROCKS.collisionInset;
    const { result } = spider(ARACHNID, { x: rock.x - edge - 36, y: rock.y });
    // Yerdeki örümcek kayaya tırmanır (yavaşlar, engel yemez).
    for (let step = 0; step < 120; step++) result.step(command({ moveX: 1, aimX: 1 }), rocky, DT);
    expect(result.x).toBeGreaterThan(rock.x - edge + 4);
    // Havadayken tırmanış direnci ve su sıfırdır.
    const flyer = spider(ARACHNID, { x: rock.x - edge - 36, y: rock.y }).result;
    let airClimb = 0;
    for (let step = 0; step < 14; step++) {
      flyer.step(command({ moveX: 1, aimX: 1, brake: true }), rocky, DT);
      if (flyer.airborne) airClimb = Math.max(airClimb, flyer.climb);
    }
    expect(airClimb).toBe(0);

    const lake: LakeSpec = { id: 'g', x: 0.5, y: 0.5, rx: 600, ry: 600, rotation: 0, shape: [] };
    const wet = new World(12288, 12288, 128, [lake]);
    const swimmer = spider(ARACHNID, { x: 6144, y: 6144 }).result;
    swimmer.step(command(), wet, DT);
    expect(swimmer.waterDepth).toBeGreaterThan(0.5);
    const jumper = spider(ARACHNID, { x: 6144, y: 6144 }).result;
    jumper.step(command({ brake: true, moveX: 1, aimX: 1 }), wet, DT);
    jumper.step(command({ moveX: 1, aimX: 1 }), wet, DT);
    expect(jumper.airborne).toBe(true);
    expect(jumper.waterDepth).toBe(0);
  });

  it('bacak kaybı ve sekiz bacak sözleşmesi değişmez: yürüyücü tablosu geçerlidir', () => {
    const { result } = spider(ARACHNID);
    result.parts = 1;
    result.step(command({ moveX: 1, aimX: 1 }), space, DT);
    const sound = spider(ARACHNID).result;
    sound.step(command({ moveX: 1, aimX: 1 }), space, DT);
    let lame = 0;
    let healthy = 0;
    for (let step = 0; step < 240; step++) {
      result.step(command({ moveX: 1, aimX: 1 }), space, DT);
      sound.step(command({ moveX: 1, aimX: 1 }), space, DT);
      lame = Math.max(lame, result.speed);
      healthy = Math.max(healthy, sound.speed);
    }
    expect(lame).toBeLessThan(healthy);
    expect(LEGS_PER_SIDE).toBe(4);
  });

  it('Goliath sıçramaz ve kalkan hız kazandırmaz: Space hareketsiz araçta yürüyüşü zorlamaz', () => {
    const goliath = new Walker(GOLIATH.walker, GOLIATH.suspension);
    goliath.place(4096, 4096, 0);
    goliath.capturePose();
    const still = command({ brake: true, aimX: 1 });
    for (let step = 0; step < 60; step++) goliath.step(still, space, DT);
    expect(goliath.boosting).toBe(true);
    expect(goliath.airborne).toBe(false);
    expect(goliath.speed).toBeLessThan(1);
    expect(goliath.x).toBeCloseTo(4096, 0);

    const walking = new Walker(GOLIATH.walker, GOLIATH.suspension);
    walking.place(4096, 4096, 0);
    walking.capturePose();
    let top = 0;
    for (let step = 0; step < 180; step++) {
      walking.step(command({ moveX: 1, aimX: 1, brake: true }), space, DT);
      top = Math.max(top, walking.speed);
    }
    expect(top).toBeLessThanOrEqual(GOLIATH.walker.maxSpeed * 1.02);
  });

  it('aynı komut dizisi aynı konumu verir (belirlenimli sıçrama)', () => {
    const run = (): [number, number] => {
      const { result } = spider(WIDOW);
      for (let step = 0; step < 200; step++)
        result.step(command({ moveX: 1, moveY: 0.3, aimX: 1, brake: step < 20 }), space, DT);
      return [result.x, result.y];
    };
    expect(run()).toEqual(run());
  });
});
