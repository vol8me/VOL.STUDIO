import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { FX } from '@/config/fx';
import { TreadMarks } from '@/view/effects/TreadMarks';
import { TEXTURE, treadFrame } from '@/view/textures';
import { fakeScene, type FakeObject, frameKey } from '../../support/fakeScene';

const STEP = FX.marks.spacing;
const OFFSET = 15;

function build(scale = 1) {
  const scene = fakeScene();
  const marks = new TreadMarks(scene as unknown as Phaser.Scene, scale);
  const images = (): FakeObject[] =>
    scene.created.filter(
      (object) => object.kind === 'image' && frameKey(object) === TEXTURE.treadPrint,
    );
  return { marks, images };
}

/** Düz yolda (x ekseni) `distance` birim sürer; iki palet aynı yolu kateder. */
function drive(marks: TreadMarks, key: number, distance: number, y = 0, from = 0): void {
  for (let travelled = 0; travelled <= distance; travelled += STEP) {
    marks.track(key, from + travelled, y, 0, from + travelled, from + travelled, OFFSET);
  }
}

interface Band {
  readonly from: number;
  readonly to: number;
  readonly length: number;
  readonly steps: number;
}

/** Sol palet şeridindeki (y = -OFFSET) çıkartmaları x aralığına çevirir. */
function leftBands(images: FakeObject[]): Band[] {
  return images
    .filter((image) => Math.abs(Number(image.y) - -OFFSET) < 1e-6)
    .map((image) => {
      const size = image.calls.filter(([name]) => name === 'setDisplaySize').at(-1)![1] as number[];
      const frame = image.calls.filter(([name]) => name === 'setFrame').at(-1)![1][0] as string;
      const length = size[0];
      return {
        from: Number(image.x) - length / 2,
        to: Number(image.x) + length / 2,
        length,
        steps: Number(frame.replace(`${TEXTURE.treadPrint}/steps-`, '')),
      };
    })
    .sort((a, b) => a.from - b.from);
}

describe('TreadMarks: uzayan bant', () => {
  it('düz yolda bant tek çıkartma olarak uzar: çıkartma sayısı yola değil runMax e bağlıdır', () => {
    const { marks, images } = build();
    drive(marks, 1, 1200);
    const perTrack = images().length / 2;
    expect(perTrack).toBeLessThanOrEqual(Math.ceil(1200 / FX.marks.runMax) + 1);
    // Eski düzen her pabuç aralığında bir çıkartma basardı.
    expect(perTrack).toBeLessThan(1200 / STEP / 2);
  });

  it('bant boşluksuz örtülür ve ucu aracın temas noktasını yakalar', () => {
    const { marks, images } = build();
    drive(marks, 1, 600);
    const bands = leftBands(images());
    expect(bands[0].from).toBeCloseTo(0);
    for (let i = 1; i < bands.length; i++) expect(bands[i].from).toBeCloseTo(bands[i - 1].to);
    expect(bands.at(-1)!.to).toBeCloseTo(Math.floor(600 / STEP) * STEP);
    for (const band of bands) expect(band.length).toBeLessThanOrEqual(FX.marks.runMax + 1e-6);
  });

  it('her bant pabuç adımını korur: çerçeve adımı uzunluğa göredir ve aralık pitch e yakındır', () => {
    const { marks, images } = build();
    drive(marks, 1, 600);
    for (const band of leftBands(images())) {
      expect(band.steps).toBeGreaterThanOrEqual(1);
      expect(band.steps).toBeLessThanOrEqual(FX.marks.maxGrousers);
      const pitch = band.length / band.steps;
      expect(Math.abs(pitch - FX.marks.pitch) / FX.marks.pitch).toBeLessThan(0.34);
    }
    const first = images()[0];
    expect(
      first.calls.some(([name, args]) => name === 'setFrame' && args[0] === treadFrame(2)),
    ).toBe(true);
  });

  it('runMax dokudaki en uzun çerçeveye sığar', () => {
    expect(FX.marks.runMax).toBeLessThanOrEqual(FX.marks.maxGrousers * FX.marks.pitch);
    expect(FX.marks.spacing).toBeLessThanOrEqual(FX.marks.runMax);
  });

  it('dönüşte bant düz çizgiden sapınca yeni parça başlar ve yay doğrulukla izlenir', () => {
    const { marks, images } = build();
    const radius = 160;
    for (let angle = 0; angle <= Math.PI; angle += STEP / radius) {
      const ground = angle * radius;
      marks.track(
        1,
        Math.sin(angle) * radius,
        radius - Math.cos(angle) * radius,
        angle,
        ground,
        ground,
        0,
      );
    }
    const curved = images().length / 2;
    const straight = Math.ceil((Math.PI * radius) / FX.marks.runMax) + 1;
    expect(curved).toBeGreaterThan(straight);
    // Her parçanın orta noktası çemberden `bend` in birkaç katından fazla sapmaz.
    for (const image of images()) {
      const deviation = Math.abs(Math.hypot(Number(image.x), Number(image.y) - radius) - radius);
      expect(deviation).toBeLessThan(FX.marks.bend * 2);
    }
  });
});

describe('TreadMarks: kesintiler', () => {
  it('ışınlanma bandı keser: yeni konumdan yeni bant başlar, köprü çizilmez', () => {
    const { marks, images } = build();
    drive(marks, 1, 100);
    const before = images().length;
    marks.track(1, 5000, 0, 0, 5000, 5000, OFFSET);
    expect(images()).toHaveLength(before);
    marks.track(1, 5000 + STEP, 0, 0, 5000 + STEP, 5000 + STEP, OFFSET);
    const added = images().slice(before);
    expect(added).toHaveLength(2);
    for (const image of added)
      expect(Math.abs(Number(image.x) - (5000 + STEP / 2))).toBeLessThan(1e-6);
  });

  it('kayan palet bandı bitirir; izi SkidMarks çizer, tutununca yeni bant başlar', () => {
    const { marks, images } = build();
    drive(marks, 1, 60);
    const before = images().length;
    marks.track(1, 72, 0, 0, 72, 72, OFFSET, true, true);
    expect(images()).toHaveLength(before);
    marks.track(1, 84, 0, 0, 84, 84, OFFSET, true, false);
    // Yalnız kaymayan sağ palet iz basar; kayan sol bant başlamaz.
    const added = images().slice(before);
    expect(added).toHaveLength(1);
    expect(Number(added[0].y)).toBeCloseTo(OFFSET);
  });

  it('forget bandı bırakır: dönen araç eski uçtan köprü çizmez', () => {
    const { marks, images } = build();
    drive(marks, 1, 60);
    marks.forget(1);
    const before = images().length;
    marks.track(1, 900, 0, 0, 900, 900, OFFSET);
    marks.track(1, 900 + STEP, 0, 0, 900 + STEP, 900 + STEP, OFFSET);
    const added = images().slice(before);
    expect(added).toHaveLength(2);
    for (const image of added) expect(Number(image.x)).toBeGreaterThan(900);
  });

  it('geri giden araç da iz bırakır (yer yolu mutlaktır)', () => {
    const { marks, images } = build();
    marks.track(1, 0, 0, 0, 0, 0, OFFSET);
    marks.track(1, -STEP, 0, 0, STEP, STEP, OFFSET);
    expect(images()).toHaveLength(2);
  });

  it('havuz dolup görüntü başkasına geçse de devam eden bant yeni çıkartmayla sürer', () => {
    const { marks, images } = build(2 / FX.marks.capacity);
    drive(marks, 1, STEP * 3);
    // İkinci araç havuzu tüketir: ilk aracın devam eden bandının görüntüsü yeniden kullanılır.
    drive(marks, 2, STEP * 30, 400);
    drive(marks, 1, STEP * 6, 0, STEP * 3);
    expect(images()).toHaveLength(2);
    for (const image of images()) expect(Number.isFinite(Number(image.x))).toBe(true);
  });
});

describe('TreadMarks: kalabalık savaşta iz arkadan kuyruk gibi silinmez', () => {
  const FPS = 60;
  const SPEED = 240;
  const TANKS = 10;

  /** `seconds` boyunca `TANKS` araç tam hızda ayrı şeritlerde sürer; havuz kaç çıkartma tüketti. */
  function consumed(scale: number, seconds: number): { used: number; capacity: number } {
    const { marks, images } = build(scale);
    let ground = 0;
    for (let frame = 0; frame < seconds * FPS; frame++) {
      ground += SPEED / FPS;
      for (let tank = 0; tank < TANKS; tank++)
        marks.track(tank, ground, tank * 300, 0, ground, ground, OFFSET);
      marks.fade(1000 / FPS);
    }
    return { used: images().length, capacity: Math.round(FX.marks.capacity * scale) };
  }

  it('on araç tam hızda ömrün tutuş süresi boyunca havuzu doldurmaz (hiçbir iz erken geri alınmaz)', () => {
    const hold = (FX.marks.lifeMs * FX.marks.holdShare) / 1000;
    expect(hold).toBeGreaterThanOrEqual(30);
    const { used, capacity } = consumed(1, 30);
    expect(used).toBeLessThan(capacity);
  });

  it('düşük kalitede de yarım havuz on aracın 15 saniyelik yolunu taşır', () => {
    const { used, capacity } = consumed(0.5, 15);
    expect(used).toBeLessThan(capacity);
  });
});
