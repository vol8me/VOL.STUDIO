import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { LAKE_SPECS } from '@/config/lakes';
import { WATER_VIEW } from '@/config/waterView';
import { WORLD } from '@/config/world';
import { LakeField } from '@/sim/world/LakeField';
import { WaterTrails, type TrailSubject } from '@/view/water/WaterTrails';
import { fakeScene, type FakeObject } from '../../support/fakeScene';

const field = new LakeField(WORLD.width, WORLD.height, LAKE_SPECS);
const lake = field.lakes[0];
const TRAILS = WATER_VIEW.trails;

function build() {
  const scene = fakeScene();
  const trails = new WaterTrails(scene as unknown as Phaser.Scene, field);
  const graphics = scene.created.find((object) => object.kind === 'graphics') as FakeObject;
  return { trails, graphics };
}

function subject(patch: Partial<TrailSubject> = {}): TrailSubject {
  return { id: 1, kind: 'tank', x: lake.x, y: lake.y, hull: 0, speed: 120, ...patch };
}

/** Aracı buz hattının içinden `distance` kadar yatay yürütüp her adımda bir kare besler. */
function walk(trails: WaterTrails, kind: TrailSubject['kind'], distance: number, ice = 0): void {
  for (let step = 0; step <= distance; step += 8)
    trails.update([subject({ kind, x: lake.x + 40 + step })], ice, 16);
}

describe('WaterTrails: araç izleri', () => {
  it('kurudaki ve duran araç iz bırakmaz', () => {
    const { trails } = build();
    trails.update([subject({ x: 40, y: 40 })], 0, 16);
    trails.update([subject({ x: 60, y: 40 })], 0, 16);
    expect(trails.active).toBe(0);
    trails.update([subject({ speed: 0 })], 0, 16);
    trails.update([subject({ speed: 0 })], 0, 16);
    expect(trails.active).toBe(0);
  });

  it('suda yürüyen tank yol aralığıyla halka bırakır; hepsi kısa sürede söner', () => {
    const { trails } = build();
    walk(trails, 'tank', 200);
    const expected = Math.floor(200 / TRAILS.spacing.tank) + 1;
    expect(trails.count('ring')).toBeGreaterThanOrEqual(expected - 1);
    expect(trails.count('ring')).toBeLessThanOrEqual(expected + 1);
    expect(trails.count('hole')).toBe(0);
    trails.update([], 0, TRAILS.ring.lifeMs + 50);
    expect(trails.active).toBe(0);
  });

  it('süzülen araç V dalgası çeker; buzda yalnız ince yarık bırakır', () => {
    const open = build();
    walk(open.trails, 'hover', 160);
    expect(open.trails.count('wake')).toBeGreaterThan(3);
    expect(open.trails.count('channel')).toBe(0);

    const frozen = build();
    walk(frozen.trails, 'hover', 160, 1);
    expect(frozen.trails.count('channel')).toBeGreaterThan(3);
    expect(frozen.trails.count('wake')).toBe(0);
  });

  it('buzdaki tank ve yürüyücü kırık delik açar; delik yavaş kapanır', () => {
    for (const kind of ['tank', 'walker'] as const) {
      const { trails } = build();
      walk(trails, kind, 160, 1);
      expect(trails.count('hole')).toBeGreaterThan(3);
      expect(trails.count('ring')).toBe(0);
      trails.update([], 1, TRAILS.hole.lifeMs / 2);
      expect(trails.count('hole')).toBeGreaterThan(0);
      trails.update([], 1, TRAILS.hole.lifeMs);
      expect(trails.count('hole')).toBe(0);
    }
  });

  it('açık suda ilerleyen araç sürekli yarık bırakır; durunca yarık sönüp kalkar', () => {
    for (const kind of ['hover', 'tank'] as const) {
      const { trails, graphics } = build();
      walk(trails, kind, 200);
      expect(trails.ribbonCount).toBe(1);
      // Yarık şeridi doldurur, kolları ve pruva yayını çizer.
      expect(graphics.calls.some(([name]) => name === 'fillPath')).toBe(true);
      expect(graphics.calls.some(([name]) => name === 'arc')).toBe(true);
      trails.update([], 0, TRAILS.wake.lifeMs + 100);
      trails.update([], 0, 16);
      expect(trails.ribbonCount).toBe(0);
    }
  });

  it('buzda yarık yoktur; kıran araç yıldız çatlak ve buz parçası bırakır, çatlak delikten uzun yaşar', () => {
    const { trails } = build();
    walk(trails, 'tank', 160, 1);
    expect(trails.ribbonCount).toBe(0);
    expect(trails.count('crack')).toBeGreaterThan(3);
    expect(trails.count('shard')).toBe(trails.count('hole') * WATER_VIEW.trails.shard.count);
    trails.update([], 1, TRAILS.hole.lifeMs + 100);
    expect(trails.count('hole')).toBe(0);
    expect(trails.count('shard')).toBe(0);
    expect(trails.count('crack')).toBeGreaterThan(0);
    trails.update([], 1, TRAILS.crack.lifeMs);
    expect(trails.count('crack')).toBe(0);
  });

  it('duraklatmada (sıfır süre) işaretler donar; havuz sınırı aşılmaz', () => {
    const { trails } = build();
    walk(trails, 'tank', 120);
    const before = trails.active;
    trails.update([], 0, 0);
    expect(trails.active).toBe(before);
    for (let cycle = 0; cycle < 40; cycle++) walk(trails, 'tank', 300);
    expect(trails.active).toBeLessThanOrEqual(TRAILS.capacity);
  });

  it('batış halka ve kabarcık bırakır; kabarcıklar gecikmeyle başlar ve çizilir', () => {
    const { trails, graphics } = build();
    trails.splash(lake.x, lake.y, 30);
    // Halkalar ve gövde kapanırken yüzeye vuran son kabarma.
    expect(trails.count('ring')).toBe(WATER_VIEW.sink.rings + 1);
    expect(trails.count('bubble')).toBe(WATER_VIEW.sink.bubbles);
    trails.update([], 0, 16);
    expect(graphics.calls.some(([name]) => name === 'strokeCircle')).toBe(true);
    trails.update([], 0, WATER_VIEW.sink.durationMs + WATER_VIEW.sink.bubbleLifeMs);
    expect(trails.active).toBe(0);
  });

  it('kapanışta grafik yok edilir', () => {
    const { trails, graphics } = build();
    trails.destroy();
    expect(graphics.calls.some(([name]) => name === 'destroy')).toBe(true);
  });
});
