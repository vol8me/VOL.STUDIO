import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import type { FeelerArt } from '@/config/sensors';
import { CorePulse } from '@/view/CorePulse';
import { Feelers } from '@/view/Feelers';
import { TEXTURE, TEXTURE_SCALE } from '@/view/textures';
import { fakeScene } from '../support/fakeScene';

const INV = 1 / TEXTURE_SCALE;

const ART: FeelerArt = {
  anchorX: 20,
  anchorY: 4,
  length: 16,
  thickness: 2,
  rest: 0.4,
  facing: 1,
  tint: 0xffffff,
  glow: 0xff0000,
  tipSize: 8,
};

function feelers(art: FeelerArt = ART) {
  const scene = fakeScene();
  const view = new Feelers(scene as unknown as Phaser.Scene, art);
  const stalks = scene.created.filter((object) => object.args.includes(TEXTURE.antenna));
  const tips = scene.created.filter((object) => object.args.includes(TEXTURE.spark));
  return { view, stalks, tips };
}

const calm = { angularVelocity: 0, effort: 0 };

describe('Feelers', () => {
  it('iki gövde ve iki ışık ucu üretir; gövdeler gölge verir, uçlar vermez', () => {
    const { view, stalks, tips } = feelers();
    expect(stalks).toHaveLength(2);
    expect(tips).toHaveLength(2);
    expect(view.parts.every((part, index) => (part as unknown) === stalks[index])).toBe(true);
    // Işık uçları kapsayıcıya girmez: yerel poz tutucusudur, çizimi ortak ışık katmanındadır.
    expect(view.objects).toHaveLength(2);
  });

  it('bağlantı parçanın yerel uzayındadır: konum, dönüş ve büyüklük parçayı izler', () => {
    const { view, stalks } = feelers();
    view.update(100, 50, 0, 1, calm, 0, 16);
    // Sağ duyarga +y yanındadır, sol aynasıdır.
    expect(stalks[1].x).toBeCloseTo(120);
    expect(stalks[1].y).toBeCloseTo(54);
    expect(stalks[0].y).toBeCloseTo(46);
    view.update(100, 50, Math.PI / 2, 2, calm, 0, 16);
    // 90° dönmüş ve iki kat büyümüş parçada anchor (20, 4) → (-8, 40) kaymasıdır.
    expect(stalks[1].x).toBeCloseTo(100 - 8);
    expect(stalks[1].y).toBeCloseTo(50 + 40);
  });

  it('öne bakan duyarga dışa açılır, arkaya bakan arkadan dışa açılır; ışık ucu ucundadır', () => {
    const front = feelers();
    front.view.update(0, 0, 0, 1, calm, 0, 16);
    expect(Math.sin(front.stalks[1].rotation as number)).toBeGreaterThan(0);
    expect(Math.cos(front.stalks[1].rotation as number)).toBeGreaterThan(0);
    const back = feelers({ ...ART, facing: -1 });
    back.view.update(0, 0, 0, 1, calm, 0, 16);
    expect(Math.cos(back.stalks[1].rotation as number)).toBeLessThan(0);
    const tip = front.tips[1];
    const stalk = front.stalks[1];
    const angle = stalk.rotation as number;
    expect(tip.x).toBeCloseTo((stalk.x as number) + Math.cos(angle) * ART.length);
    expect(tip.y).toBeCloseTo((stalk.y as number) + Math.sin(angle) * ART.length);
  });

  it('dönüşte geride sürüklenir, hızlanınca arkaya yatar', () => {
    const turning = feelers();
    turning.view.update(0, 0, 0, 1, calm, 0, 16);
    const rest = turning.stalks[1].rotation as number;
    for (let step = 0; step < 20; step++)
      turning.view.update(0, 0, 0, 1, { angularVelocity: 3, effort: 0 }, 0, 16);
    expect(turning.stalks[1].rotation as number).not.toBeCloseTo(rest, 2);

    const fast = feelers();
    fast.view.update(0, 0, 0, 1, calm, 0, 16);
    for (let step = 0; step < 40; step++)
      fast.view.update(0, 0, 0, 1, { angularVelocity: 0, effort: 1 }, 0, 16);
    // Hızlanınca öne bakan sağ duyarga eksenden daha çok açılır (arkaya yatar).
    expect(fast.stalks[1].rotation as number).toBeGreaterThan(rest);
  });

  it('yok edilince bütün görüntüleri yıkar', () => {
    const { view, stalks, tips } = feelers();
    view.destroy();
    for (const object of [...stalks, ...tips])
      expect(object.calls.some(([name]) => name === 'destroy')).toBe(true);
  });
});

describe('CorePulse', () => {
  it('çekirdek ölçeğe oranla büyür; boşta atar, hız ve atılımla sıklaşıp büyür', () => {
    const scene = fakeScene();
    const small = new CorePulse(scene as unknown as Phaser.Scene, 0.75, 0xffffff);
    const big = new CorePulse(scene as unknown as Phaser.Scene, 1.5, 0xffffff);
    small.update(0, false, 16);
    big.update(0, false, 16);
    expect(big.image.scale).toBeCloseTo(small.image.scale * 2);

    const calm = new CorePulse(scene as unknown as Phaser.Scene, 0.75, 0xffffff);
    const boosted = new CorePulse(scene as unknown as Phaser.Scene, 0.75, 0xffffff);
    calm.update(0, false, 16);
    boosted.update(1, true, 16);
    expect(boosted.image.scale).toBeGreaterThan(calm.image.scale);
    expect(calm.image.scale).toBeLessThan(INV);
  });

  it('büyüklük çarpanı çekirdeği parçayla birlikte büyütür ve alfa nabızla oynar', () => {
    const scene = fakeScene();
    const core = new CorePulse(scene as unknown as Phaser.Scene, 0.75, 0xffffff);
    core.update(0, false, 0, 1);
    const base = core.image.scale;
    core.update(0, false, 0, 1.5);
    expect(core.image.scale).toBeCloseTo(base * 1.5, 3);
    const alphas = new Set<number>();
    for (let step = 0; step < 60; step++) {
      core.update(0, false, 50);
      alphas.add(Number(core.image.alpha));
    }
    expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(0.2);
  });

  it('place çekirdeği verilen noktaya koyar', () => {
    const scene = fakeScene();
    const core = new CorePulse(scene as unknown as Phaser.Scene, 0.75, 0xffffff);
    core.place(3, -4);
    expect(core.image.x).toBe(3);
    expect(core.image.y).toBe(-4);
  });
});
