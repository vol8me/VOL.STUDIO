import { describe, it, expect } from 'vitest';
import { Vector2 } from '../../src/math/Vector2';
import { normalizeAnalog, normalizeDirection } from '../../src/input/InputUtils';
import {
  computePCInputState,
  isPCInputActive,
  resolvePCActions,
  type PCActionBinding,
  type PointerLikeState,
  type MoveDownState,
} from '../../src/input/PCInputState';

/**
 * Testin KENDİ eylem sözlüğü — VOL.HELL'in kümesinden bilinçli olarak farklı
 * seçildi. Bu katman hiçbir eylem adı bilmez; adlar yalnızca `bindings`
 * kaydının anahtarlarıdır.
 */
type TestAction = 'engage' | 'boost';

/** `engage` pointer sol düğmesine, `boost` bir klavye tuşuna bağlı. */
const BOOST_KEY = 32;
const bindings: Readonly<Record<TestAction, PCActionBinding>> = {
  engage: { source: 'pointerButton', button: 'left' },
  boost: { source: 'key', keyCode: BOOST_KEY },
};

const noKeys: MoveDownState = { up: false, down: false, left: false, right: false };
const noActions: Readonly<Record<TestAction, boolean>> = { engage: false, boost: false };
const idlePointer: PointerLikeState = {
  x: 0,
  y: 0,
  isDown: false,
  leftButtonDown: false,
  wasTouch: false,
};

/** Hiçbir tuş basılı değil. */
const noKeyDown = (): boolean => false;

describe('isPCInputActive', () => {
  it('hiçbir tuş/pointer aktif değilken false döner', () => {
    expect(isPCInputActive(noKeys, idlePointer, noActions)).toBe(false);
  });

  it('herhangi bir eylem basılıyken true döner (eylem ADINDAN bağımsız)', () => {
    expect(isPCInputActive(noKeys, idlePointer, { engage: false, boost: true })).toBe(true);
    expect(isPCInputActive(noKeys, idlePointer, { engage: true, boost: false })).toBe(true);
  });

  it('boş eylem kaydıyla çağrılabilir (eylemi olmayan bir tüketici)', () => {
    expect(isPCInputActive(noKeys, idlePointer, {})).toBe(false);
    expect(isPCInputActive({ ...noKeys, up: true }, idlePointer, {})).toBe(true);
  });

  it('herhangi bir WASD tuşu basılıyken true döner', () => {
    expect(isPCInputActive({ ...noKeys, up: true }, idlePointer, noActions)).toBe(true);
    expect(isPCInputActive({ ...noKeys, left: true }, idlePointer, noActions)).toBe(true);
  });

  it('gerçek (touch olmayan) pointer basılıyken true döner', () => {
    expect(
      isPCInputActive(noKeys, { ...idlePointer, isDown: true, wasTouch: false }, noActions),
    ).toBe(true);
  });

  it('touch kaynaklı pointer basılıyken true dönmez', () => {
    // wasTouch=true ise basılı olsa bile aktif sayılmaz.
    expect(
      isPCInputActive(noKeys, { ...idlePointer, isDown: true, wasTouch: true }, noActions),
    ).toBe(false);
  });

  it('hiçbir girdi yokken false döner', () => {
    // wasTouch=false ve isDown=false tek başına aktiflik değildir.
    expect(
      isPCInputActive(noKeys, { ...idlePointer, isDown: false, wasTouch: false }, noActions),
    ).toBe(false);
  });
});

describe('computePCInputState', () => {
  it('tuş yokken move sıfırdır', () => {
    const state = computePCInputState(
      noKeys,
      idlePointer,
      Vector2.zero(),
      Vector2.zero(),
      noActions,
    );
    expect(state.move.x).toBe(0);
    expect(state.move.y).toBe(0);
  });

  it('W+A birlikte basılınca çapraz hareket normalize edilir (uzunluk 1)', () => {
    const state = computePCInputState(
      { ...noKeys, up: true, left: true },
      idlePointer,
      Vector2.zero(),
      Vector2.zero(),
      noActions,
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
      noActions,
    );
    expect(state.move.x).toBeCloseTo(1, 5);
    expect(state.move.y).toBe(0);
  });

  it('aim, oyuncu pozisyonundan dünya hedefine olan yön vektörüdür', () => {
    const playerPos = new Vector2(0, 0);
    const worldTarget = new Vector2(100, 0);
    const state = computePCInputState(noKeys, idlePointer, worldTarget, playerPos, noActions);

    expect(state.aim.x).toBeCloseTo(1, 5);
    expect(state.aim.y).toBeCloseTo(0, 5);
  });

  it('oyuncu ile hedef aynı noktadaysa aim sıfırdır', () => {
    const state = computePCInputState(
      noKeys,
      idlePointer,
      Vector2.zero(),
      Vector2.zero(),
      noActions,
    );
    expect(state.aim.x).toBe(0);
    expect(state.aim.y).toBe(0);
  });

  it('actions kaydı olduğu gibi taşınır — bu katman eylem HESAPLAMAZ', () => {
    const actions: Record<TestAction, boolean> = { engage: true, boost: false };
    const state = computePCInputState(noKeys, idlePointer, Vector2.zero(), Vector2.zero(), actions);
    expect(state.actions).toEqual({ engage: true, boost: false });
  });
});

describe('resolvePCActions', () => {
  it('klavye bağlantısı tuşun basılı durumunu okur', () => {
    const down = resolvePCActions(bindings, (code) => code === BOOST_KEY, idlePointer);
    expect(down.boost).toBe(true);

    const up = resolvePCActions(bindings, noKeyDown, idlePointer);
    expect(up.boost).toBe(false);
  });

  it('gerçek fare sol tık basılıyken pointer bağlantısı true olur', () => {
    const actions = resolvePCActions(bindings, noKeyDown, {
      ...idlePointer,
      leftButtonDown: true,
      wasTouch: false,
    });
    expect(actions.engage).toBe(true);
  });

  it('touch kaynaklı "sol tık" eylemi tetiklemez', () => {
    // Dokunmatik kaynaklı pointer PC eylemini çalıştırmamalı; çift girdi engellenir.
    const actions = resolvePCActions(bindings, noKeyDown, {
      ...idlePointer,
      leftButtonDown: true,
      wasTouch: true,
    });
    expect(actions.engage).toBe(false);
  });

  it('kayıt HER eylemi taşır — basılı olmayan eylem undefined değil false olur', () => {
    const actions = resolvePCActions(bindings, noKeyDown, idlePointer);
    expect(Object.keys(actions).sort()).toEqual(['boost', 'engage']);
    expect(actions.engage).toBe(false);
    expect(actions.boost).toBe(false);
  });
});

describe('joystick sınır sözleşmesi', () => {
  const full = new Vector2(1, 0);

  /*
   * `deadZone === 1` bir dönem `(ratio - 1) / (1 - 1)` üretiyordu: tam güçle
   * itilen bir çubukta `0 / 0`, yani NaN bir hareket niyeti. Niyet oradan
   * gövdeye, gövdeden konuma geçer ve bir kare sonra hatanın nereden geldiği
   * görülmez. Yapılandırma bu yüzden AKIŞ gibi yok sayılmaz, REDDEDİLİR.
   */
  it('deadZone [0,1) dışındaysa reddedilir', () => {
    expect(() => normalizeAnalog(full, 1)).toThrow(RangeError);
    expect(() => normalizeAnalog(full, 1.5)).toThrow(RangeError);
    expect(() => normalizeAnalog(full, -0.1)).toThrow(RangeError);
    expect(() => normalizeDirection(full, 1)).toThrow(RangeError);
  });

  it('sonlu olmayan deadZone/maxRadius reddedilir', () => {
    expect(() => normalizeAnalog(full, Number.NaN)).toThrow(TypeError);
    expect(() => normalizeAnalog(full, 0.15, Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => normalizeDirection(full, Number.NaN)).toThrow(TypeError);
  });

  it('maxRadius pozitif olmalı', () => {
    expect(() => normalizeAnalog(full, 0.15, 0)).toThrow(RangeError);
    expect(() => normalizeDirection(full, 0.15, -1)).toThrow(RangeError);
  });

  it('geçerli sınırlarda çıktı her zaman SONLU kalır', () => {
    for (const deadZone of [0, 0.15, 0.5, 0.99]) {
      for (const magnitude of [0, 1e-9, 0.15, 0.5, 1, 4]) {
        const result = normalizeAnalog(new Vector2(magnitude, 0), deadZone);
        expect(Number.isFinite(result.x), `deadZone ${deadZone} × ${magnitude}`).toBe(true);
        expect(Number.isFinite(result.y)).toBe(true);
        expect(result.length()).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('BOZUK bir vektör akış değeridir: sıfırlanır, fırlatmaz', () => {
    expect(normalizeAnalog(new Vector2(Number.NaN, 0)).length()).toBe(0);
    expect(normalizeDirection(new Vector2(Number.POSITIVE_INFINITY, 0)).length()).toBe(0);
  });
});
