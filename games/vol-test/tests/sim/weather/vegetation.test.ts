import { describe, expect, it } from 'vitest';
import { LAKE_SPECS } from '@/config/lakes';
import { OUTCROP_SPECS } from '@/config/rocks';
import { WEATHER } from '@/config/weather';
import { WORLD } from '@/config/world';
import { SurfaceGrid } from '@/sim/weather/SurfaceGrid';
import type { WeatherState } from '@/sim/weather/types';
import { WeatherSystem } from '@/sim/weather/WeatherSystem';
import { fertilityOf } from '@/sim/world/fertility';
import { World } from '@/sim/world/World';

const SIZE = 4096;
const SEED = 41;

function state(patch: Partial<WeatherState> = {}): WeatherState {
  return {
    kind: 'clear',
    season: 'spring',
    seasonProgress: 0,
    daylight: 0.8,
    elapsedMs: 0,
    dust: 0,
    rain: 0,
    snow: 0,
    windX: 0,
    windY: 0,
    temperature: 16,
    airDrag: 1,
    ...patch,
  };
}

/** Yeşilliğin en yüksek olduğu hücrenin merkezi: büyüme sınamaları orayı izler. */
function fertileSpot(grid: SurfaceGrid): { x: number; y: number } {
  let best = { x: 0, y: 0 };
  let bestValue = -1;
  const frame = state();
  for (let row = 0; row < grid.rows; row++)
    for (let column = 0; column < grid.columns; column++) {
      const cell = grid.cell(column, row, frame)!;
      // Başlangıç örtüsü taşıma gücüyle orantılıdır: en yüksek başlangıç en verimli yamadır.
      if (cell.growth > bestValue) {
        bestValue = cell.growth;
        best = { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 };
      }
    }
  return best;
}

function run(grid: SurfaceGrid, frame: WeatherState, seconds: number): void {
  const step = WEATHER.surface.stepMs / 1000;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) grid.step(frame, step);
}

describe('yeşillik', () => {
  it('yamalar sabit coğrafyadır: aynı tohum aynı verimli hücreleri, başka tohum başkasını verir', () => {
    const a = new SurfaceGrid(SIZE, SIZE, SEED);
    const b = new SurfaceGrid(SIZE, SIZE, SEED);
    expect(a.snapshot().growth).toEqual(b.snapshot().growth);
    const other = new SurfaceGrid(SIZE, SIZE, SEED + 1);
    expect(other.snapshot().growth).not.toEqual(a.snapshot().growth);
    // Dünyanın bir kısmı verimlidir, çoğu çıplak toprak kalır.
    const grown = a.snapshot().growth.filter((value) => value > 0).length;
    expect(grown).toBeGreaterThan(0);
    expect(grown).toBeLessThan(a.snapshot().growth.length * 0.7);
  });

  it('yağmur yeşilliği büyütür, kuraklık yavaşça çeker', () => {
    const grid = new SurfaceGrid(SIZE, SIZE, SEED);
    const spot = fertileSpot(grid);
    const start = grid.sample(spot.x, spot.y, state()).growth;
    run(grid, state({ kind: 'rain', rain: 1, temperature: 14 }), 120);
    const wet = grid.sample(spot.x, spot.y, state()).growth;
    expect(wet).toBeGreaterThan(start);
    run(grid, state({ temperature: 24 }), 1200);
    const dry = grid.sample(spot.x, spot.y, state()).growth;
    expect(dry).toBeLessThan(wet);
    // Çekilme yavaştır: yirmi dakikalık kuraklık örtüyü hemen yok etmez ama aşındırır.
    expect(dry).toBeGreaterThan(0);
  });

  it('don ve kar örtüsü yeşilliği çeker; kar yağarken yeşillik büyümez', () => {
    const grid = new SurfaceGrid(SIZE, SIZE, SEED);
    const spot = fertileSpot(grid);
    run(grid, state({ kind: 'rain', rain: 1, temperature: 14 }), 600);
    const lush = grid.sample(spot.x, spot.y, state()).growth;
    expect(lush).toBeGreaterThan(0.3);
    run(grid, state({ kind: 'snow', snow: 1, temperature: -8 }), 600);
    const frozen = grid.sample(spot.x, spot.y, state()).growth;
    expect(frozen).toBeLessThan(lush);
    const sample = grid.sample(spot.x, spot.y, state());
    expect(sample.snowDepth).toBeGreaterThan(0);
  });

  it('uzun don ve kar örtüyü dayanıklı çim tabanında bırakır, tümden öldürmez; ezilen taban altı kıpırdamaz', () => {
    const grid = new SurfaceGrid(SIZE, SIZE, SEED);
    const spot = fertileSpot(grid);
    run(grid, state({ kind: 'rain', rain: 1, temperature: 16 }), 1500);
    const capacity = grid.sample(spot.x, spot.y, state()).growth;
    run(grid, state({ kind: 'snow', snow: 1, temperature: -10 }), 3000);
    const winter = grid.sample(spot.x, spot.y, state());
    expect(winter.growth).toBeCloseTo(capacity * WEATHER.growth.hardyFloor, 6);
    expect(winter.snowDepth).toBeGreaterThan(0);
    // Taban altına ezilmiş örtü donda tabana zıplamaz; yağmurla yeniden büyür.
    grid.trample(spot.x, spot.y, 3);
    const trampled = grid.sample(spot.x, spot.y, state()).growth;
    expect(trampled).toBeLessThan(winter.growth);
    run(grid, state({ temperature: -10 }), 60);
    expect(grid.sample(spot.x, spot.y, state()).growth).toBeLessThanOrEqual(trampled + 1e-9);
    run(grid, state({ kind: 'rain', rain: 1, temperature: 16 }), 600);
    expect(grid.sample(spot.x, spot.y, state()).growth).toBeGreaterThan(trampled);
  });

  it('palet yeşilliği ezer; ezilen hücre dışındakiler etkilenmez', () => {
    const grid = new SurfaceGrid(SIZE, SIZE, SEED);
    const spot = fertileSpot(grid);
    const before = grid.sample(spot.x, spot.y, state()).growth;
    const far = grid.sample(0, 0, state()).growth;
    grid.trample(spot.x, spot.y, 0.5);
    expect(grid.sample(spot.x, spot.y, state()).growth).toBeCloseTo(before * Math.exp(-0.5), 6);
    expect(grid.sample(0, 0, state()).growth).toBe(far);
    expect(() => grid.trample(0, 0, -1)).toThrow(RangeError);
    expect(() => grid.trample(0, 0, Number.NaN)).toThrow(RangeError);
  });

  it('maske: göl ve kayada yeşillik hiç kök salmaz, kıyı şeridi yarı verimlidir', () => {
    const world = new World(WORLD.width, WORLD.height, WORLD.gridStep, LAKE_SPECS, OUTCROP_SPECS);
    const mask = fertilityOf(world);
    const lake = world.lakes.lakes[0];
    expect(mask(lake.x, lake.y)).toBe(0);
    const rock = world.rocks.rocks[0];
    expect(mask(rock.x, rock.y)).toBe(0);
    expect(mask(40, 40)).toBe(1);
    const grid = new SurfaceGrid(WORLD.width, WORLD.height, WEATHER.seed, mask);
    run(grid, state({ rain: 1, temperature: 14 }), 60);
    expect(grid.sample(lake.x, lake.y, state()).growth).toBe(0);
    expect(grid.sample(rock.x, rock.y, state()).growth).toBe(0);
  });
});

describe('iklim anlık görüntüsü', () => {
  it('geri yükleme bütün durumu taşır: saat, rüzgâr birikimi ve hücreler (1/255 payıyla)', () => {
    const source = new WeatherSystem(SIZE, SIZE, { seed: SEED, season: 'autumn' });
    source.step(150_000);
    const snapshot = source.snapshot();
    const copy = new WeatherSystem(SIZE, SIZE, { seed: SEED });
    expect(copy.restore(snapshot)).toBe(true);
    expect(copy.frame.elapsedMs).toBe(source.frame.elapsedMs);
    expect(copy.frame.season).toBe(source.frame.season);
    expect(copy.frame.windTravelX).toBeCloseTo(source.frame.windTravelX, 6);
    for (const [x, y] of [
      [0, 0],
      [1000, 1000],
      [3000, 2000],
    ]) {
      const want = source.sample(x, y);
      const got = copy.sample(x, y);
      expect(got.wetness).toBeCloseTo(want.wetness, 2);
      expect(got.growth).toBeCloseTo(want.growth, 2);
      expect(got.snowDepth).toBeCloseTo(want.snowDepth, 2);
    }
    // İkisi de aynı belirli takvimde ilerler: bir süre sonra aynı çerçeveyi bulurlar.
    source.step(60_000);
    copy.step(60_000);
    expect(copy.frame.kind).toBe(source.frame.kind);
    expect(copy.frame.temperature).toBeCloseTo(source.frame.temperature, 9);
  });

  it('başka tohum, başka ölçü ya da bozuk sayı reddedilir ve dünyayı değiştirmez', () => {
    const source = new WeatherSystem(SIZE, SIZE, { seed: SEED });
    source.step(30_000);
    const snapshot = source.snapshot();
    const target = new WeatherSystem(SIZE, SIZE, { seed: SEED });
    const before = target.frame.elapsedMs;
    expect(new WeatherSystem(SIZE, SIZE, { seed: SEED + 1 }).restore(snapshot)).toBe(false);
    expect(new WeatherSystem(SIZE * 2, SIZE * 2, { seed: SEED }).restore(snapshot)).toBe(false);
    expect(target.restore({ ...snapshot, elapsedMs: Number.NaN })).toBe(false);
    expect(target.restore({ ...snapshot, elapsedMs: -5 })).toBe(false);
    expect(target.restore({ ...snapshot, surfaceMs: snapshot.elapsedMs + 1 })).toBe(false);
    expect(target.frame.elapsedMs).toBe(before);
  });

  it('taşıma gücünü aşan kayıtlı örtü taşıma gücüne indirilir', () => {
    const grid = new SurfaceGrid(SIZE, SIZE, SEED);
    const snapshot = grid.snapshot();
    const lush = new Uint8Array(snapshot.growth.length).fill(255);
    expect(grid.restore({ ...snapshot, growth: lush })).toBe(true);
    const cap = Math.max(
      ...Array.from(
        { length: grid.columns * grid.rows },
        (_, index) =>
          grid.sample(
            ((index % grid.columns) + 0.5) * grid.cellSize,
            (Math.floor(index / grid.columns) + 0.5) * grid.cellSize,
            state(),
          ).growth,
      ),
    );
    expect(cap).toBeLessThanOrEqual(1);
    // Verimsiz hücrede örtü 0 kalır (göl, kaya, çıplak toprak).
    const bare = grid.snapshot().growth.filter((value) => value === 0).length;
    expect(bare).toBeGreaterThan(0);
  });
});
