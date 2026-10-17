import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { FX } from '@/config/fx';
import { DamageNumbers } from '@/view/effects/DamageNumbers';
import { fakeScene } from '../../support/fakeScene';

const LOOK = FX.damageNumbers;

function setup() {
  const scene = fakeScene();
  const numbers = new DamageNumbers(scene as unknown as Phaser.Scene);
  const texts = () => scene.created.filter((object) => object.kind === 'text');
  return { numbers, scene, texts };
}

describe('DamageNumbers', () => {
  it('sayıyı tam sayıya yuvarlar; yön rengi ve boyunu belirler', () => {
    const { numbers, texts } = setup();
    numbers.spawn(10, 20, 24.6, 'taken');
    numbers.spawn(10, 20, 7, 'dealt');
    const [taken, dealt] = texts();
    expect(taken.text).toBe('25');
    expect(taken.color).toBe('#ff5a5a');
    expect(taken.fontSize).toBe(LOOK.kinds.taken.size);
    expect(dealt.text).toBe('7');
    expect(dealt.color).toBe('#ffd45c');
    expect(numbers.active).toBe(2);
  });

  it('yarım puandan az hasarı yazmaz; küçük ama anlamlı hasar en az 1 görünür', () => {
    const { numbers, texts } = setup();
    numbers.spawn(0, 0, LOOK.minAmount - 0.01, 'dealt');
    expect(texts()).toHaveLength(0);
    numbers.spawn(0, 0, LOOK.minAmount, 'dealt');
    expect(texts()[0].text).toBe('1');
  });

  it('süzülür, ömrün ilk kesrinde tam görünür, sonra söner ve ömür sonunda gizlenir', () => {
    const { numbers, texts } = setup();
    numbers.spawn(0, 100, 10, 'dealt');
    const text = texts()[0];
    // Oyun karesi büyüklüğünde adımlarla: yükseliş adım toplamıdır.
    const advance = (fraction: number): void => {
      const steps = Math.round(fraction * 50);
      for (let step = 0; step < steps; step++) numbers.update(LOOK.lifeMs / 50);
    };
    advance(0.25);
    expect(Number(text.y)).toBeLessThan(100);
    expect(text.alpha).toBe(1);
    advance(0.65);
    expect(Number(text.alpha)).toBeLessThan(1);
    expect(Number(text.alpha)).toBeGreaterThan(0);
    // Toplam yükseliş, yavaşlayarak, `risePx`e yaklaşır ve aşmaz.
    expect(100 - Number(text.y)).toBeLessThanOrEqual(LOOK.risePx);
    expect(100 - Number(text.y)).toBeGreaterThan(LOOK.risePx * 0.9);
    numbers.update(LOOK.lifeMs);
    expect(text.visible).toBe(false);
    expect(numbers.active).toBe(0);
  });

  it('bitmiş yuva yeniden kullanılır; havuz kapasiteyi aşmaz ve dolunca en eski sayı yerini verir', () => {
    const { numbers, texts } = setup();
    numbers.spawn(0, 0, 5, 'dealt');
    numbers.update(LOOK.lifeMs + 1);
    numbers.spawn(0, 0, 6, 'dealt');
    expect(texts()).toHaveLength(1);
    for (let index = 0; index < LOOK.capacity + 5; index++)
      numbers.spawn(0, 0, 10 + index, 'other');
    expect(texts()).toHaveLength(LOOK.capacity);
    expect(numbers.active).toBe(LOOK.capacity);
  });

  it('aynı noktaya inen sayılar birbirinden farklı yana kayabilir ve yok edilince yazılar yıkılır', () => {
    const { numbers, texts } = setup();
    for (let amount = 10; amount < 15; amount++) numbers.spawn(0, 0, amount, 'dealt');
    numbers.update(LOOK.lifeMs / 2);
    const xs = new Set(texts().map((text) => Number(text.x)));
    expect(xs.size).toBeGreaterThan(1);
    numbers.destroy();
    for (const text of texts()) expect(text.calls.some(([name]) => name === 'destroy')).toBe(true);
  });
});
