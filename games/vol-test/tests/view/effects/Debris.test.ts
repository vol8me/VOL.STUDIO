import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { DEBRIS } from '@/config/debris';
import type { ChunkArt } from '@/view/debrisArt';
import { Debris, type ChunkLaunch } from '@/view/effects/Debris';
import { fakeScene, lastCall, type FakeObject } from '../../support/fakeScene';

const ART: ChunkArt = {
  texture: 'shard',
  originX: 0.5,
  originY: 0.5,
  scale: 1,
  tint: 0x7b6a58,
};

const WORLD = { width: 2000, height: 2000 };

function launch(overrides: Partial<ChunkLaunch> = {}): ChunkLaunch {
  return {
    art: ART,
    x: 1000,
    y: 1000,
    angle: 0,
    speed: 200,
    lift: 300,
    spin: 6,
    scale: 1,
    lifeMs: 4000,
    height: 10,
    hot: false,
    ...overrides,
  };
}

function build(capacity?: number) {
  const scene = fakeScene();
  const debris = new Debris(scene as unknown as Phaser.Scene, WORLD, capacity);
  return { scene, debris };
}

/** Parça + gölge çiftlerinin parça görüntüleri (çiftlerde ilki parça, ikincisi gölgedir). */
const images = (scene: ReturnType<typeof fakeScene>): FakeObject[] =>
  scene.created.filter((object) => object.kind === 'image');

function run(debris: Debris, ms: number, step = 16): void {
  for (let elapsed = 0; elapsed < ms; elapsed += step) debris.update(step);
}

describe('Debris', () => {
  it('parça havaya fırlar, yerçekimiyle iner ve yerde durur; yatay yol alır', () => {
    const { scene, debris } = build();
    debris.spawn(launch());
    const [chunk] = images(scene);
    const peak = (): number => (chunk.scale as number) / ART.scale;
    run(debris, 200);
    // Havadayken perspektifle büyür.
    expect(peak()).toBeGreaterThan(1);
    run(debris, 3000);
    // Yere indi: büyüme geri döndü, yatayda ilerledi.
    expect(peak()).toBeCloseTo(1, 1);
    expect(chunk.x as number).toBeGreaterThan(1000 + 20);
  });

  it('gölge parçanın altında kalır ve yükseklikle ışığın tersine kayar', () => {
    const { scene, debris } = build();
    debris.spawn(launch({ speed: 0 }));
    const [chunk, shadow] = images(scene);
    run(debris, 100);
    const lift = (shadow.x as number) - (chunk.x as number);
    expect(lift).toBeGreaterThan(1);
    run(debris, 4000);
    expect(Math.abs((shadow.x as number) - (chunk.x as number))).toBeLessThan(lift);
  });

  it('ömrü bitince söner ve havuza döner; sayaç düşer', () => {
    const { scene, debris } = build();
    debris.spawn(launch({ lifeMs: 800 }));
    expect(debris.count).toBe(1);
    run(debris, 400);
    const [chunk] = images(scene);
    expect(chunk.alpha as number).toBeLessThan(1);
    run(debris, 600);
    expect(debris.count).toBe(0);
    expect(chunk.visible).toBe(false);
  });

  it('dolu havuzda en yaşlı parça yeniden kullanılır: yeni görüntü yaratılmaz, sayı tavanı aşmaz', () => {
    const { scene, debris } = build(3);
    for (let index = 0; index < 3; index++) {
      debris.spawn(launch({ x: 100 * index + 100 }));
      run(debris, 50);
    }
    const created = images(scene).length;
    debris.spawn(launch({ x: 1500 }));
    expect(images(scene)).toHaveLength(created);
    expect(debris.count).toBe(3);
  });

  it('kalite ölçeği tavanı küçültür ve fazla görüntüleri atar', () => {
    const { scene, debris } = build(10);
    for (let index = 0; index < 10; index++) debris.spawn(launch());
    debris.setScale(0.3);
    const alive = images(scene).filter((object) => !lastCall(object, 'destroy'));
    expect(alive.length / 2).toBeLessThanOrEqual(Math.round(DEBRIS.capacity * 0.3));
    expect(debris.count).toBeLessThanOrEqual(Math.round(DEBRIS.capacity * 0.3));
  });

  it('dondurulmuş karede (deltaMs 0) hiçbir şey kıpırdamaz', () => {
    const { scene, debris } = build();
    debris.spawn(launch());
    const [chunk] = images(scene);
    const before = [chunk.x, chunk.y, chunk.rotation];
    for (let index = 0; index < 20; index++) debris.update(0);
    expect([chunk.x, chunk.y, chunk.rotation]).toEqual(before);
  });

  it('dünya kenarından geri seker, dışarı çıkmaz', () => {
    const { scene, debris } = build();
    debris.spawn(launch({ x: WORLD.width - 30, angle: 0, speed: 600 }));
    run(debris, 3000);
    const [chunk] = images(scene);
    expect(chunk.x as number).toBeLessThanOrEqual(WORLD.width - DEBRIS.edgeMargin);
  });

  it('sıcak parça kor renginden başlar ve kendi rengine soğur', () => {
    const { scene, debris } = build();
    debris.spawn(launch({ hot: true }));
    const [chunk] = images(scene);
    debris.update(16);
    expect(lastCall(chunk, 'setTint')?.[0]).not.toBe(ART.tint);
    run(debris, DEBRIS.hotMs + 200);
    expect(lastCall(chunk, 'setTint')?.[0]).toBe(ART.tint);
  });

  it('aynı fırlatma aynı yolu çizer (belirlenimli)', () => {
    const a = build();
    const b = build();
    for (const { debris } of [a, b]) {
      debris.spawn(launch({ angle: 1.1, speed: 250, spin: -9 }));
      run(debris, 1500);
    }
    const [first] = images(a.scene);
    const [second] = images(b.scene);
    expect([first.x, first.y, first.rotation]).toEqual([second.x, second.y, second.rotation]);
  });

  it('clear hepsini bırakır, destroy görüntüleri yok eder', () => {
    const { scene, debris } = build();
    debris.spawn(launch());
    debris.spawn(launch());
    debris.clear();
    expect(debris.count).toBe(0);
    debris.destroy();
    expect(images(scene).every((object) => lastCall(object, 'destroy') !== undefined)).toBe(true);
  });
});
