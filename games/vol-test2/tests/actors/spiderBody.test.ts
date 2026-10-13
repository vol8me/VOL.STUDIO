import { describe, expect, it } from 'vitest';
import { SpiderBody, type LegPose } from '../../src/actors/spiderBody';
import { DEFAULT_SPIDER, FEMUR_LENGTH, LOWER_LENGTH } from '../../src/actors/spiderRig';
import { seeded } from '../../src/lab/random';
import { createWander, stepWander, velocityOf } from '../../src/lab/wander';

const FRAME_MS = 1000 / 60;

interface WalkOptions {
  readonly seconds: number;
  readonly speed: number;
  readonly heading?: number;
  readonly onFrame?: (body: SpiderBody, frame: number) => void;
}

/** Sabit hızla düz yürüyüş: gövde doğrultusunda ilerler, her karede bacak pozu gözlenir. */
function walkStraight(body: SpiderBody, options: WalkOptions): void {
  const heading = options.heading ?? 0;
  const dx = Math.cos(heading) * options.speed;
  const dy = Math.sin(heading) * options.speed;
  let x = 100;
  let y = 100;
  body.reset(x, y, heading);
  const frames = Math.round(options.seconds * 60);
  for (let frame = 0; frame < frames; frame++) {
    x += (dx * FRAME_MS) / 1000;
    y += (dy * FRAME_MS) / 1000;
    body.update(x, y, heading, dx, dy, FRAME_MS);
    options.onFrame?.(body, frame);
  }
}

function walkWander(body: SpiderBody, seed: number, cruise: number, turn: number): void {
  const random = seeded(seed);
  const options = { width: 1600, height: 900, margin: 150, cruise, maxTurnRate: turn };
  const state = createWander(random, options);
  body.reset(state.x, state.y, state.heading);
  for (let frame = 0; frame < 60 * 40; frame++) {
    stepWander(state, FRAME_MS / 1000, random, options);
    const [vx, vy] = velocityOf(state);
    body.update(state.x, state.y, state.heading, vx, vy, FRAME_MS);
  }
}

type Point = readonly [number, number];

const turnsLeft = (a: Point, b: Point, c: Point): boolean =>
  (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);

/** İki doğru parçasının kesişimi (uç uca değme sayılmaz). */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  return turnsLeft(a, c, d) !== turnsLeft(b, c, d) && turnsLeft(a, b, c) !== turnsLeft(a, b, d);
}

const bone = (a: readonly [number, number], b: readonly [number, number]): number =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);

describe('SpiderBody: dinlenme pozu', () => {
  const body = new SpiderBody();
  body.reset(0, 0, 0);

  it('sekiz bacak, hiçbiri kelepçelenmemiş ve hepsi yerde', () => {
    expect(body.legCount).toBe(8);
    for (const leg of body.legs) {
      expect(leg.clamped).toBe(false);
      expect(leg.grounded).toBe(true);
      expect(leg.lift).toBe(0);
    }
  });

  it('ayaklar dinlenme noktalarındadır (gövde uzayında)', () => {
    for (let index = 0; index < body.legCount; index++) {
      const [homeX, homeY] = body.home(index);
      expect(body.legs[index].tipX).toBeCloseTo(homeX, 5);
      expect(body.legs[index].tipY).toBeCloseTo(homeY, 5);
    }
  });

  it('dış çiftlerde diz gövde ekseninden uzağa bükülür: uyluk-ayak kirişinin dış tarafındadır', () => {
    for (let index = 0; index < body.legCount; index++) {
      const { side, pair } = body.def(index);
      if (pair === 1 || pair === 2) continue;
      const leg = body.legs[index];
      const chordMidY = (leg.hipY + leg.tipY) / 2;
      expect(side * leg.kneeY, `bacak ${index}`).toBeGreaterThan(side * chordMidY + 1);
      expect(Math.abs(body.bendSign(index))).toBe(1);
    }
  });

  it('orta çiftlerde dizler ayrışır: ikinci çift öne, üçüncü çift geriye bükülür', () => {
    for (let index = 0; index < body.legCount; index++) {
      const { pair } = body.def(index);
      if (pair !== 1 && pair !== 2) continue;
      const leg = body.legs[index];
      const chordMidX = (leg.hipX + leg.tipX) / 2;
      const direction = pair === 1 ? 1 : -1;
      expect(direction * (leg.kneeX - chordMidX), `bacak ${index}`).toBeGreaterThan(1);
    }
  });

  it('orta çiftlerin (2. ve 3.) uyluk ve kavalları aynı tarafta birbirini kesmez', () => {
    for (const offset of [0, 1]) {
      const second = body.legs[2 + offset];
      const third = body.legs[4 + offset];
      const hipA: Point = [second.hipX, second.hipY];
      const kneeA: Point = [second.kneeX, second.kneeY];
      const hipB: Point = [third.hipX, third.hipY];
      const kneeB: Point = [third.kneeX, third.kneeY];
      expect(segmentsCross(hipA, kneeA, hipB, kneeB), 'uyluklar').toBe(false);
      expect(
        segmentsCross(kneeA, [second.tipX, second.tipY], kneeB, [third.tipX, third.tipY]),
        'kavallar',
      ).toBe(false);
    }
  });

  it('kemik uzunlukları uyluk 40, kaval+pençe 64 (IK uzunlukları)', () => {
    for (const leg of body.legs) {
      expect(bone([leg.hipX, leg.hipY], [leg.kneeX, leg.kneeY])).toBeCloseTo(FEMUR_LENGTH, 6);
      expect(bone([leg.kneeX, leg.kneeY], [leg.tipX, leg.tipY])).toBeCloseTo(LOWER_LENGTH, 6);
    }
  });
});

describe('SpiderBody: düz yürüyüş', () => {
  it('kemik uzunlukları her karede korunur', () => {
    const body = new SpiderBody();
    walkStraight(body, {
      seconds: 6,
      speed: 90,
      heading: 0.7,
      onFrame: (b) => {
        for (const leg of b.legs) {
          if (leg.clamped) continue;
          expect(bone([leg.hipX, leg.hipY], [leg.kneeX, leg.kneeY])).toBeCloseTo(FEMUR_LENGTH, 4);
          expect(bone([leg.kneeX, leg.kneeY], [leg.tipX, leg.tipY])).toBeCloseTo(LOWER_LENGTH, 4);
        }
      },
    });
    expect(body.stats.steps).toBeGreaterThan(20);
  });

  it('normal rejimde aynı anda yalnız tek tetrapod grubu adım atar; iki grup da sırayla atar', () => {
    const body = new SpiderBody();
    const seenGroups = new Set<number>();
    let mixedFrames = 0;
    let normalFrames = 0;
    walkStraight(body, {
      seconds: 10,
      speed: 90,
      onFrame: (b) => {
        if (b.emergencySteppingCount > 0) return;
        normalFrames++;
        const groups = new Set<number>();
        b.legs.forEach((leg, index) => {
          if (!leg.grounded) groups.add(b.def(index).group);
        });
        for (const group of groups) seenGroups.add(group);
        if (groups.size > 1) mixedFrames++;
      },
    });
    expect(normalFrames).toBeGreaterThan(500);
    expect(mixedFrames).toBe(0);
    expect([...seenGroups].sort()).toEqual([0, 1]);
  });

  it('düz ve sabit hızda yerdeki ayak kaymaz', () => {
    const body = new SpiderBody();
    walkStraight(body, { seconds: 10, speed: 90, heading: -1.2 });
    expect(body.stats.steps).toBeGreaterThan(40);
    expect(body.stats.maxSlide).toBeLessThan(0.05);
  });

  it('normal rejimde ağırlık merkezi destek poligonunun içinde kalır; acil adım nadirdir', () => {
    const body = new SpiderBody();
    walkStraight(body, { seconds: 20, speed: 100 });
    expect(body.stats.normalFrames).toBeGreaterThan(body.stats.emergencyFrames);
    expect(body.stats.unstableNormalFrames).toBe(0);
    expect(body.stats.minStability01).toBeGreaterThan(0.5);
    expect(body.stats.clampedLegFrames / body.stats.legFrames).toBeLessThan(0.01);
  });

  it.each([
    [60, 0.9, 1.5],
    [96, 1.3, 1.9],
    [140, 1.6, 2.4],
  ])(
    'sakin yürüyüş: %i birim/sn hızda bacak başına adım hızı %f..%f arasındadır',
    (speed, lowest, highest) => {
      const body = new SpiderBody();
      const seconds = 20;
      walkStraight(body, { seconds, speed });
      const rate = body.stats.steps / body.legCount / seconds;
      expect(rate).toBeGreaterThanOrEqual(lowest);
      expect(rate).toBeLessThanOrEqual(highest);
    },
  );

  it('adım süresi hıza uyar: yavaşta uzun, hızlıda kısa; sınırlar içinde kalır', () => {
    const longestSwingMs = (speed: number): number => {
      const body = new SpiderBody();
      let run = 0;
      let longest = 0;
      walkStraight(body, {
        seconds: 12,
        speed,
        onFrame: (b) => {
          run = b.legs[0].grounded ? 0 : run + 1;
          longest = Math.max(longest, run);
        },
      });
      return longest * FRAME_MS;
    };
    const slow = longestSwingMs(40);
    const fast = longestSwingMs(140);
    expect(slow).toBeGreaterThan(fast);
    expect(slow).toBeLessThanOrEqual(DEFAULT_SPIDER.swingMaxMs + 2 * FRAME_MS);
    expect(fast).toBeGreaterThanOrEqual(DEFAULT_SPIDER.swingMinMs - 2 * FRAME_MS);
  });

  it('düzgün bir dönüşte (yarıçap 200, hız 96) sıra çoğunlukla delinmez ve ayak kaymaz', () => {
    const body = new SpiderBody();
    const radius = 200;
    const speed = 96;
    const omega = speed / radius;
    let x = 400;
    let y = 400;
    let angle = 0;
    body.reset(x, y, angle);
    for (let frame = 0; frame < 60 * 20; frame++) {
      angle += (omega * FRAME_MS) / 1000;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      x += (vx * FRAME_MS) / 1000;
      y += (vy * FRAME_MS) / 1000;
      body.update(x, y, angle, vx, vy, FRAME_MS);
    }
    expect(body.stats.emergencyFrames / body.stats.frames).toBeLessThan(0.4);
    expect(body.stats.clampedLegFrames / body.stats.legFrames).toBeLessThan(0.01);
    expect(body.stats.maxSlide).toBeLessThan(1);
  });

  it('durunca ayaklar yerinde kalır ve adım sayısı artmaz', () => {
    const body = new SpiderBody();
    walkStraight(body, { seconds: 4, speed: 90 });
    const stepsWhileWalking = body.stats.steps;
    for (let frame = 0; frame < 120; frame++) body.update(500, 100, 0, 0, 0, FRAME_MS);
    const settled = body.stats.steps;
    for (let frame = 0; frame < 120; frame++) body.update(500, 100, 0, 0, 0, FRAME_MS);
    expect(settled).toBeGreaterThanOrEqual(stepsWhileWalking);
    expect(body.stats.steps).toBe(settled);
    expect(body.legs.every((leg) => leg.grounded)).toBe(true);
  });
});

describe('SpiderBody: dönüş ve gezinme', () => {
  it.each([
    [100, 0.6],
    [120, 1.5],
  ])('gezinirken (hız %i, dönüş %f) denge ve ayak bütünlüğü bozulmaz', (cruise, turn) => {
    for (const seed of [1, 2, 3]) {
      const body = new SpiderBody();
      walkWander(body, seed, cruise, turn);
      expect(body.stats.unstableNormalFrames, `tohum ${seed}`).toBe(0);
      expect(body.stats.clampedLegFrames / body.stats.legFrames, `tohum ${seed}`).toBeLessThan(
        0.02,
      );
      expect(body.stats.maxSlide, `tohum ${seed}`).toBeLessThan(3);
      expect(body.stats.steps, `tohum ${seed}`).toBeGreaterThan(100);
    }
  });

  it('aynı girdi aynı pozu verir (deterministik)', () => {
    const a = new SpiderBody();
    const b = new SpiderBody();
    walkWander(a, 7, 100, 0.8);
    walkWander(b, 7, 100, 0.8);
    const snapshot = (legs: LegPose[]): number[] =>
      legs.flatMap((leg) => [leg.tipX, leg.tipY, leg.kneeX, leg.kneeY, leg.lift]);
    expect(snapshot(a.legs)).toEqual(snapshot(b.legs));
    expect(a.stats).toEqual(b.stats);
  });
});

describe('SpiderBody: ölçüm mekaniği', () => {
  it('sıfır süreli kare ölçülmez; ilk kare yalnız önceki uçları kaydeder', () => {
    const body = new SpiderBody();
    body.reset(0, 0, 0);
    body.update(0, 0, 0, 0, 0, 0);
    expect(body.stats.frames).toBe(0);
    body.update(1, 0, 0, 60, 0, FRAME_MS);
    expect(body.stats.frames).toBe(0);
    body.update(2, 0, 0, 60, 0, FRAME_MS);
    expect(body.stats.frames).toBe(1);
    expect(body.stats.legFrames).toBe(8);
  });

  it('çok uzun kare 50 ms ile sınırlanır: ayak gerçekçi adım hızını aşmaz', () => {
    const long = new SpiderBody();
    const clamped = new SpiderBody();
    long.reset(0, 0, 0);
    clamped.reset(0, 0, 0);
    for (let frame = 0; frame < 30; frame++) {
      long.update(frame * 5, 0, 0, 100, 0, 5000);
      clamped.update(frame * 5, 0, 0, 100, 0, 50);
    }
    expect(long.legs.map((leg) => leg.tipX)).toEqual(clamped.legs.map((leg) => leg.tipX));
  });

  it('reset yürüyüşü yeniden kurar: yeni ilk kare ölçülmez', () => {
    const body = new SpiderBody();
    walkStraight(body, { seconds: 2, speed: 90 });
    const frames = body.stats.frames;
    body.reset(900, 900, 1);
    body.update(900, 900, 1, 0, 0, FRAME_MS);
    expect(body.stats.frames).toBe(frames);
  });

  it('özel ayar kullanılır: daha kısa adım süresi daha çok adım üretir', () => {
    const quick = new SpiderBody({ ...DEFAULT_SPIDER, swingMinMs: 80, swingMaxMs: 80 });
    const slow = new SpiderBody({ ...DEFAULT_SPIDER, swingMinMs: 220, swingMaxMs: 220 });
    walkStraight(quick, { seconds: 8, speed: 90 });
    walkStraight(slow, { seconds: 8, speed: 90 });
    expect(quick.stats.steps).toBeGreaterThan(slow.stats.steps);
  });
});
