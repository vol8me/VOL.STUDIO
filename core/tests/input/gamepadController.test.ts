import { describe, it, expect } from 'vitest';
import { Vector2 } from '../../src/math/Vector2';
import { GamepadController } from '../../src/input/GamepadController';
import {
  GAMEPAD_BUTTON,
  computeGamepadInput,
  isGamepadInputActive,
  resolveGamepadActions,
  type PadLike,
} from '../../src/input/GamepadState';
import type { GamepadActionBinding } from '../../src/input/GamepadState';

type TestAction = 'fire' | 'dash';
const TEST_ACTIONS: readonly TestAction[] = ['fire', 'dash'];
const BINDINGS: Readonly<Record<TestAction, GamepadActionBinding>> = {
  fire: { source: 'button', button: GAMEPAD_BUTTON.rightTrigger },
  dash: { source: 'button', button: GAMEPAD_BUTTON.primary },
};

/** Sahte kol — 17 düğme + 4 eksen, hepsi sıfır başlangıçlı. */
function makePad(overrides: Partial<PadLike> = {}): PadLike {
  return {
    id: 'Steam Deck Controller',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    ...overrides,
  };
}

function withButton(pad: PadLike, index: number): PadLike {
  const buttons = pad.buttons.map((b, i) => (i === index ? { pressed: true, value: 1 } : b));
  return { ...pad, buttons };
}

function withAxes(pad: PadLike, axes: readonly number[]): PadLike {
  return { ...pad, axes };
}

describe('GamepadState saf mantık', () => {
  it('sol çubuk hareketi analog büyüklük taşır', () => {
    const pad = withAxes(makePad(), [0.5, -0.5, 0, 0]);
    const state = computeGamepadInput(
      pad,
      resolveGamepadActions(BINDINGS, () => false),
    );
    // normalizeAnalog deadzone sonrası yeniden ölçekler; yön korunur.
    expect(state.move.x).toBeGreaterThan(0);
    expect(state.move.y).toBeLessThan(0);
    expect(state.move.length()).toBeLessThanOrEqual(1);
    expect(state.move.length()).toBeGreaterThan(0);
  });

  it('deadzone altındaki çubuk gürültüsü sıfır hareket üretir', () => {
    const pad = withAxes(makePad(), [0.1, 0.05, 0, 0]);
    const state = computeGamepadInput(
      pad,
      resolveGamepadActions(BINDINGS, () => false),
    );
    expect(state.move.length()).toBe(0);
  });

  it('sağ çubuk nişanı yalnız yön taşır (uzunluk 0 veya 1)', () => {
    const pad = withAxes(makePad(), [0, 0, 0.3, 0.3]);
    const state = computeGamepadInput(
      pad,
      resolveGamepadActions(BINDINGS, () => false),
    );
    expect(state.aim.length()).toBeCloseTo(1, 5);
    expect(state.aim.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(state.aim.y).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('eylem bağları düğme dizinine göre çözülür', () => {
    const pad = withButton(makePad(), GAMEPAD_BUTTON.primary);
    const pressed = (i: number) => pad.buttons[i]?.pressed ?? false;
    const actions = resolveGamepadActions(BINDINGS, pressed);
    expect(actions.dash).toBe(true);
    expect(actions.fire).toBe(false);
  });

  it('isGamepadInputActive düğme ya da deadzone-ötesi eksen ister', () => {
    expect(isGamepadInputActive(makePad(), 0.15)).toBe(false);
    expect(isGamepadInputActive(withAxes(makePad(), [0.1, 0, 0, 0]), 0.15)).toBe(false);
    expect(isGamepadInputActive(withAxes(makePad(), [0.5, 0, 0, 0]), 0.15)).toBe(true);
    expect(isGamepadInputActive(withButton(makePad(), GAMEPAD_BUTTON.dpadUp), 0.15)).toBe(true);
  });
});

describe('GamepadController sağlayıcı', () => {
  it("update sonrası seçilen kol durumu getState'e yansır", () => {
    const pad = withAxes(withButton(makePad(), GAMEPAD_BUTTON.rightTrigger), [1, 0, 0, 0]);
    const controller = new GamepadController<TestAction>({
      actions: TEST_ACTIONS,
      actionBindings: BINDINGS,
      getGamepads: () => [pad],
    });

    controller.update(16);
    const state = controller.getState();

    expect(controller.isActive).toBe(true);
    expect(state.actions.fire).toBe(true);
    expect(state.move.x).toBeCloseTo(1, 5);
  });

  it('kol bağlı değilse etkin değildir ve sıfır durum döner', () => {
    const controller = new GamepadController<TestAction>({
      actions: TEST_ACTIONS,
      actionBindings: BINDINGS,
      getGamepads: () => [null, makePad({ connected: false, index: 1 })],
    });

    controller.update(16);

    expect(controller.isActive).toBe(false);
    const state = controller.getState();
    expect(state.move.length()).toBe(0);
    expect(state.actions).toEqual({ fire: false, dash: false });
  });

  it('standard eşleme olmayan kol yerine standard kol tercih edilir', () => {
    const custom = makePad({ index: 0, mapping: '', id: 'custom-pad' });
    const standard = makePad({ index: 1, id: 'standard-pad' });
    const controller = new GamepadController<TestAction>({
      actions: TEST_ACTIONS,
      actionBindings: BINDINGS,
      getGamepads: () => [custom, standard],
    });

    controller.update(16);
    const snapshot = controller.getDebugSnapshot();
    expect(snapshot.providers?.gamepad?.padId).toBe('standard-pad');
  });

  it('padIndex verilirse o kol okunur', () => {
    const idle = makePad({ index: 0 });
    const pressed = withButton(makePad({ index: 1, id: 'pad-1' }), GAMEPAD_BUTTON.primary);
    const controller = new GamepadController<TestAction>({
      actions: TEST_ACTIONS,
      actionBindings: BINDINGS,
      padIndex: 1,
      getGamepads: () => [idle, pressed],
    });

    controller.update(16);
    expect(controller.isActive).toBe(true);
    expect(controller.getState().actions.dash).toBe(true);
  });

  it('getGamepads verilmezse DOMsuz ortamda sessizce boş kalır', () => {
    const controller = new GamepadController<TestAction>({
      actions: TEST_ACTIONS,
      actionBindings: BINDINGS,
    });
    expect(() => controller.update(16)).not.toThrow();
  });

  it('Vector2 import edilebilir durumda (InputState sözleşmesi)', () => {
    expect(Vector2.zero().length()).toBe(0);
  });
});
