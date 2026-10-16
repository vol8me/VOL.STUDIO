import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { DecalPool } from '@/view/effects/DecalPool';
import { fakeScene, type FakeObject } from '../../support/fakeScene';

const CONFIG = { texture: 'decal', tint: 0x112233, depth: 2, lifeMs: 1000, holdShare: 0.5 };

function build(capacity = 4) {
  const scene = fakeScene();
  const pool = new DecalPool(scene as unknown as Phaser.Scene, { ...CONFIG, capacity });
  const images = (): FakeObject[] => scene.created.filter((object) => object.kind === 'image');
  const alphaCalls = (image: FakeObject): number =>
    image.calls.filter(([name]) => name === 'setAlpha').length;
  return { pool, images, alphaCalls };
}

describe('DecalPool', () => {
  it('çıkartmayı kapasiteye dek bir kez kurar, dolunca en eskiyi yeniden kullanır', () => {
    const { pool, images } = build(3);
    for (let i = 0; i < 3; i++) pool.place(i, 0, 0, 10, 4, 1);
    expect(images()).toHaveLength(3);
    pool.fade(10);
    pool.place(9, 9, 0, 10, 4, 1);
    expect(images()).toHaveLength(3);
    expect(images()[0].x).toBe(9);
  });

  it('çerçeve verilince görüntünün çerçevesi değişir; verilmezse dokunulmaz', () => {
    const { pool, images } = build();
    pool.place(0, 0, 0, 10, 4, 1);
    expect(images()[0].calls.some(([name]) => name === 'setFrame')).toBe(false);
    pool.place(5, 0, 0, 10, 4, 1, 'steps-3');
    const framed = images()[1].calls.find(([name]) => name === 'setFrame');
    expect(framed?.[1]).toEqual(['steps-3']);
  });

  it('reshape devam eden çıkartmayı uzatır; doğum zamanı ve sönüş saati korunur', () => {
    const { pool, images } = build();
    const ref = pool.place(0, 0, 0, 10, 4, 1);
    pool.fade(300);
    expect(pool.reshape(ref, 7, 1, 0.5, 20, 4)).toBe(true);
    expect(images()[0].x).toBe(7);
    expect(images()[0].rotation).toBe(0.5);
    // 400 ms sonra hâlâ tutuşta (500 ms); ömür doğumdan sayılır, yeniden biçimlendirme saati sıfırlamaz.
    pool.fade(100);
    expect(images()[0].alpha).toBe(1);
    pool.fade(400);
    expect(images()[0].alpha).toBeLessThan(1);
  });

  it('görüntü başkasına verildiyse eski tutamak onu bozmaz', () => {
    const { pool, images } = build(2);
    const first = pool.place(0, 0, 0, 10, 4, 1);
    pool.place(1, 0, 0, 10, 4, 1);
    pool.place(2, 0, 0, 10, 4, 1);
    expect(images()[0].x).toBe(2);
    expect(pool.reshape(first, 99, 99, 0, 10, 4)).toBe(false);
    expect(images()[0].x).toBe(2);
  });

  it('tutuşta alfa yazılmaz; sönüş basamaklıdır ve ömür sonunda tamamen kapanır', () => {
    const { pool, images, alphaCalls } = build();
    pool.place(0, 0, 0, 10, 4, 0.5);
    const placed = alphaCalls(images()[0]);
    for (let t = 0; t < 480; t += 16) pool.fade(16);
    expect(alphaCalls(images()[0])).toBe(placed);
    for (let t = 0; t < 640; t += 16) pool.fade(16);
    const fading = alphaCalls(images()[0]) - placed;
    // 500 ms'lik sönüş her karede (31 kare) değil, en çok basamak sayısı kadar yazılır.
    expect(fading).toBeGreaterThan(5);
    expect(fading).toBeLessThanOrEqual(49);
    expect(images()[0].alpha).toBe(0);
  });

  it('genç çıkartmalar tutuştayken taramayı keser: yalnız yaşlılar sönmeye bakılır', () => {
    const { pool, images, alphaCalls } = build(8);
    pool.place(0, 0, 0, 10, 4, 1);
    pool.fade(700);
    for (let i = 1; i < 8; i++) pool.place(i, 0, 0, 10, 4, 1);
    const before = images().map(alphaCalls);
    pool.fade(100);
    const after = images().map(alphaCalls);
    expect(after[0]).toBeGreaterThanOrEqual(before[0]);
    expect(after.slice(1)).toEqual(before.slice(1));
  });

  it('destroy bütün görüntüleri yok eder', () => {
    const { pool, images } = build();
    pool.place(0, 0, 0, 10, 4, 1);
    pool.place(1, 0, 0, 10, 4, 1);
    pool.destroy();
    expect(images().every((image) => image.calls.some(([name]) => name === 'destroy'))).toBe(true);
  });
});
