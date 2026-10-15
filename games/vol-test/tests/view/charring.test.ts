import { describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { WATER_VIEW } from '@/config/waterView';
import { CHAR_TINT, setCharred, sinkRoot, submergeRoot } from '@/view/charring';

interface FakeImage {
  tint: number | null;
  visible: boolean;
  blendMode: number;
  isTinted: boolean;
  tintTopLeft: number;
  setTint(value: number): void;
  clearTint(): void;
  setVisible(value: boolean): void;
}

function image(tint: number | null = null, blendMode = 0): FakeImage {
  const self: FakeImage = {
    tint,
    visible: true,
    blendMode,
    isTinted: tint !== null,
    tintTopLeft: tint ?? 0xffffff,
    setTint(value) {
      self.tint = value;
      self.isTinted = true;
      self.tintTopLeft = value;
    },
    clearTint() {
      self.tint = null;
      self.isTinted = false;
    },
    setVisible(value) {
      self.visible = value;
    },
  };
  return self;
}

const container = (...list: unknown[]) => ({ list }) as unknown as Phaser.GameObjects.Container;

describe('setCharred', () => {
  it('iç içe kapsayıcıdaki her görüntüyü karartır ve ışık katmanını gizler', () => {
    const hull = image();
    const nested = image();
    const glow = image(0xb15cff, Phaser.BlendModes.ADD);
    setCharred(container(hull, container(nested, glow)), true);
    expect(hull.tint).toBe(CHAR_TINT);
    expect(nested.tint).toBe(CHAR_TINT);
    expect(glow.tint).toBe(CHAR_TINT);
    expect(glow.visible).toBe(false);
    expect(hull.visible).toBe(true);
  });

  it('geri alınca renkleri ve ışık katmanını eski hâline getirir; iki kez karartmak rengi ezmez', () => {
    const plain = image();
    const stub = image(0x2b2326);
    const glow = image(0xb15cff, Phaser.BlendModes.ADD);
    const root = container(plain, stub, glow);
    setCharred(root, true);
    setCharred(root, true);
    setCharred(root, false);
    expect(plain.tint).toBeNull();
    expect(plain.isTinted).toBe(false);
    expect(stub.tint).toBe(0x2b2326);
    expect(glow.tint).toBe(0xb15cff);
    expect(glow.visible).toBe(true);
  });

  it('boyanamayan nesneleri (grafik) atlar', () => {
    const graphics = { list: undefined, visible: true };
    expect(() => setCharred(container(graphics, image()), true)).not.toThrow();
  });
});

/** Kapsayıcı gibi davranan sahte kök: poz, ölçek, saydamlık ve çocuk listesi. */
function fakeRoot(...list: unknown[]) {
  const state = { alpha: 1, scale: 1, x: 100, y: 50, rotation: 0.4 };
  const fake = {
    list,
    state,
    get x() {
      return state.x;
    },
    get y() {
      return state.y;
    },
    get rotation() {
      return state.rotation;
    },
    setAlpha(value: number) {
      state.alpha = value;
      return fake;
    },
    setScale(value: number) {
      state.scale = value;
      return fake;
    },
    setPosition(x: number, y: number) {
      state.x = x;
      state.y = y;
      return fake;
    },
    setRotation(value: number) {
      state.rotation = value;
      return fake;
    },
  };
  return fake as unknown as typeof fake & Phaser.GameObjects.Container;
}

describe('sinkRoot', () => {
  it('ilerledikçe solar, küçülür, yan yatar ve kararır; sıfır her şeyi eski hâle döndürür', () => {
    const hull = image();
    const target = fakeRoot(hull);
    sinkRoot(target, 0.5, 0.6);
    expect(target.state.alpha).toBeCloseTo(1 - 0.5 ** 2.4, 6);
    expect(target.state.scale).toBeLessThan(1);
    expect(target.state.scale).toBeGreaterThan(0.6);
    expect(Math.abs(target.state.rotation - 0.4)).toBeGreaterThan(0.05);
    expect(hull.tint).not.toBeNull();
    sinkRoot(target, 3, 0.6);
    expect(target.state.alpha).toBe(0);
    expect(target.state.scale).toBeCloseTo(0.6, 6);
    expect(Math.abs(target.state.rotation - 0.4)).toBeCloseTo(WATER_VIEW.sink.list, 6);
    sinkRoot(target, -2, 0.6);
    expect(target.state).toEqual({ alpha: 1, scale: 1, x: 100, y: 50, rotation: 0.4 });
    expect(hull.tint).toBeNull();
    expect(hull.isTinted).toBe(false);
  });

  it('yatış yönü konumdan türer: aynı yerde batan hep aynı yana yatar', () => {
    const a = fakeRoot();
    const b = fakeRoot();
    sinkRoot(a, 0.8, 0.6);
    sinkRoot(b, 0.8, 0.6);
    expect(a.state.rotation).toBe(b.state.rotation);
  });

  it('batıp yeniden doğan araç eski renge döner (isli → batış → geri)', () => {
    const hull = image(0x9a8f7a);
    const target = fakeRoot(hull);
    setCharred(target, true);
    sinkRoot(target, 0.7, 0.6);
    sinkRoot(target, 0, 0.6);
    setCharred(target, false);
    expect(hull.tint).toBe(0x9a8f7a);
  });
});

describe('submergeRoot', () => {
  it('kıyıda dokunmaz; derinleştikçe suyun rengine çeker ve soldurur, kıyıya dönünce eski hâle gelir', () => {
    const hull = image(0xc0b090);
    const glow = image(0x77ffee, Phaser.BlendModes.ADD);
    const target = fakeRoot(hull, glow);
    submergeRoot(target, 0);
    expect(hull.tint).toBe(0xc0b090);
    expect(target.state.alpha).toBe(1);
    submergeRoot(target, 0.5);
    const middle = hull.tint;
    expect(middle).not.toBe(0xc0b090);
    expect(target.state.alpha).toBeLessThan(1);
    submergeRoot(target, 1);
    expect(target.state.alpha).toBeCloseTo(WATER_VIEW.submerge.alphaMin, 2);
    expect(hull.tint).not.toBe(middle);
    // Işık katmanına (ADD) dokunulmaz.
    expect(glow.tint).toBe(0x77ffee);
    submergeRoot(target, 0);
    expect(hull.tint).toBe(0xc0b090);
    expect(target.state.alpha).toBe(1);
  });

  it('boyasız gövde geri dönünce boyasız olur; aynı derinlik tekrar iş yapmaz', () => {
    const hull = image();
    const target = fakeRoot(hull);
    submergeRoot(target, 0.7);
    expect(hull.isTinted).toBe(true);
    hull.tint = 0x123456;
    submergeRoot(target, 0.7);
    expect(hull.tint).toBe(0x123456);
    submergeRoot(target, 0);
    expect(hull.isTinted).toBe(false);
  });
});
