import { describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { CHAR_TINT, setCharred, sinkRoot } from '@/view/charring';

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

describe('sinkRoot', () => {
  const root = () => {
    const state = { alpha: 1, scale: 1 };
    const fake = {
      state,
      setAlpha(value: number) {
        state.alpha = value;
      },
      setScale(value: number) {
        state.scale = value;
      },
    };
    return fake as typeof fake & Phaser.GameObjects.Container;
  };

  it('ilerledikçe solar ve küçülür; sıfır eski hâle döndürür, taşan değer kenetlenir', () => {
    const target = root();
    sinkRoot(target, 0.5, 0.6);
    expect(target.state.alpha).toBeCloseTo(0.75, 9);
    expect(target.state.scale).toBeCloseTo(0.8, 9);
    sinkRoot(target, 3, 0.6);
    expect(target.state).toEqual({ alpha: 0, scale: 0.6 });
    sinkRoot(target, -2, 0.6);
    expect(target.state).toEqual({ alpha: 1, scale: 1 });
  });
});
