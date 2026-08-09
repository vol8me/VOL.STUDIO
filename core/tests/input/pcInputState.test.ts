import { describe, it, expect } from 'vitest';
import { Vector2 } from '../../src/math/Vector2';
import {
  computePCInputState,
  isPCInputActive,
  type PointerLikeState,
  type WasdDownState,
  type ExtraKeysState,
} from '../../src/input/PCInputState';

const noKeys: WasdDownState = { up: false, down: false, left: false, right: false };
const noExtra: ExtraKeysState = { dash: false };
const idlePointer: PointerLikeState = {
  x: 0,
  y: 0,
  isDown: false,
  leftButtonDown: false,
  wasTouch: false,
};

describe('isPCInputActive', () => {
  it('hiçbir tuş/pointer aktif değilken false döner', () => {
    expect(isPCInputActive(noKeys, idlePointer, noExtra)).toBe(false);
  });

  it('herhangi bir WASD tuşu basılıyken true döner', () => {
    expect(isPCInputActive({ ...noKeys, up: true }, idlePointer, noExtra)).toBe(true);
    expect(isPCInputActive({ ...noKeys, left: true }, idlePointer, noExtra)).toBe(true);
  });

  it('gerçek (touch olmayan) pointer basılıyken true döner', () => {
    expect(isPCInputActive(noKeys, { ...idlePointer, isDown: true, wasTouch: false }, noExtra)).toBe(true);
  });

  it('touch kaynaklı pointer basılıyken true DÖNMEZ (regresyon: eski hata her zaman true dönüyordu)', () => {
    // Eski hata: `!pointer.wasTouch` tek başına kontrol edildiği için,
    // dokunulmamış hiçbir tuş/pointer olmasa bile wasTouch=false olduğu
    // sürece isActive her zaman true dönüyordu (hiçbir girdi yokken bile).
    expect(isPCInputActive(noKeys, { ...idlePointer, isDown: true, wasTouch: true }, noExtra)).toBe(false);
  });

  it('hiçbir girdi yokken ve pointer hiç dokunulmamışsa (wasTouch=false, isDown=false) false döner', () => {
    // Bu, eski `!pointer.wasTouch || ...` mantığının anlamsızlığını
    // doğrudan test eder: yalnızca "dokunulmamış" olmak aktiflik değildir.
    expect(isPCInputActive(noKeys, { ...idlePointer, isDown: false, wasTouch: false }, noExtra)).toBe(false);
  });
});

describe('computePCInputState', () => {
  it('tuş yokken move sıfırdır', () => {
    const state = computePCInputState(noKeys, idlePointer, Vector2.zero(), Vector2.zero(), noExtra);
    expect(state.move.x).toBe(0);
    expect(state.move.y).toBe(0);
  });

  it('W+A birlikte basılınca çapraz hareket normalize edilir (uzunluk 1)', () => {
    const state = computePCInputState(
      { ...noKeys, up: true, left: true },
      idlePointer,
      Vector2.zero(),
      Vector2.zero(),
      noExtra,
    );
    expect(state.move.length()).toBeCloseTo(1, 5);
    expect(state.move.x).toBeLessThan(0);
    expect(state.move.y).toBeLessThan(0);
  });

  it('D tuşu pozitif x hareketi üretir', () => {
    const state = computePCInputState(
      { ...noKeys, right: true },
      idlePointer,
      Vector2.zero(),
      Vector2.zero(),
      noExtra,
    );
    expect(state.move.x).toBeCloseTo(1, 5);
    expect(state.move.y).toBe(0);
  });

  it('aim, oyuncu pozisyonundan dünya hedefine olan yön vektörüdür', () => {
    const playerPos = new Vector2(0, 0);
    const worldTarget = new Vector2(100, 0);
    const state = computePCInputState(noKeys, idlePointer, worldTarget, playerPos, noExtra);

    expect(state.aim.x).toBeCloseTo(1, 5);
    expect(state.aim.y).toBeCloseTo(0, 5);
  });

  it('oyuncu ile hedef aynı noktadaysa aim sıfırdır', () => {
    const state = computePCInputState(noKeys, idlePointer, Vector2.zero(), Vector2.zero(), noExtra);
    expect(state.aim.x).toBe(0);
    expect(state.aim.y).toBe(0);
  });

  it('gerçek fare sol tık basılıyken fire true olur', () => {
    const state = computePCInputState(
      noKeys,
      { ...idlePointer, leftButtonDown: true, wasTouch: false },
      Vector2.zero(),
      Vector2.zero(),
      noExtra,
    );
    expect(state.fire).toBe(true);
  });

  it('touch kaynaklı "sol tık" fire üretmez (PC ateşleme touch ile karışmaz)', () => {
    const state = computePCInputState(
      noKeys,
      { ...idlePointer, leftButtonDown: true, wasTouch: true },
      Vector2.zero(),
      Vector2.zero(),
      noExtra,
    );
    expect(state.fire).toBe(false);
  });
});
