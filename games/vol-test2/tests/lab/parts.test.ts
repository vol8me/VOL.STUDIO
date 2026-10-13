import { describe, expect, it, vi } from 'vitest';
import { BLEND } from '../../src/lab/parts';
import { phaserParts } from '../../src/lab/phaserParts';
import { round3, SpanTimer } from '../../src/lab/timing';

describe('BLEND', () => {
  it('Phaser BlendModes sabitleriyle aynı değerlerdir (NORMAL 0, ADD 1)', () => {
    // Phaser jsdom'da yüklenemez; sabitlerin Phaser'daki eşitliği e2e'de gerçek tarayıcıda sınanır.
    expect(BLEND).toEqual({ normal: 0, add: 1 });
  });
});

describe('phaserParts', () => {
  it('Image ve TileSprite nesnelerini doğrudan sahneden üretir, sarmalayıcı koymaz', () => {
    const image = { kind: 'image' };
    const tile = { kind: 'tile' };
    const scene = {
      add: {
        image: vi.fn(() => image),
        tileSprite: vi.fn(() => tile),
      },
    };
    const factory = phaserParts(scene as never);
    expect(factory.image('kit-a')).toBe(image);
    expect(scene.add.image).toHaveBeenCalledWith(0, 0, 'kit-a');
    expect(factory.tile('kit-b', 64, 32)).toBe(tile);
    expect(scene.add.tileSprite).toHaveBeenCalledWith(0, 0, 64, 32, 'kit-b');
  });
});

describe('SpanTimer', () => {
  it('begin/end aralığını ölçer ve yüzdelikleri verir', () => {
    let clock = 0;
    const timer = new SpanTimer(100, () => clock);
    for (const duration of [1, 2, 3, 4, 100]) {
      timer.begin();
      clock += duration;
      timer.end();
    }
    expect(timer.samples).toBe(5);
    expect(timer.p50()).toBe(3);
    expect(timer.p95()).toBe(100);
  });

  it('halka dolunca eski ölçümleri düşürür', () => {
    let clock = 0;
    const timer = new SpanTimer(3, () => clock);
    for (const duration of [50, 1, 1, 1]) {
      timer.begin();
      clock += duration;
      timer.end();
    }
    expect(timer.samples).toBe(3);
    expect(timer.p95()).toBe(1);
  });

  it('ölçüm yoksa 0 verir', () => {
    const timer = new SpanTimer(4);
    expect(timer.p50()).toBe(0);
    expect(timer.p95()).toBe(0);
    expect(timer.samples).toBe(0);
  });
});

describe('round3', () => {
  it('üç ondalığa yuvarlar', () => {
    expect(round3(1.23456)).toBe(1.235);
    expect(round3(0.0004)).toBe(0);
    expect(round3(-2.5554)).toBe(-2.555);
  });
});
