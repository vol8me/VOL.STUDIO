import { describe, expect, it } from 'vitest';
import { GAMEPAD_BUTTON } from '@volstudio/core/input/gamepad';
import {
  AIM_STICK_ACTION,
  EDGE_ACTIONS,
  GAMEPAD_BINDINGS,
  PC_BINDINGS,
  TEST_ACTIONS,
} from '@/input/bindings';

describe('bindings', () => {
  it('her eylem klavye/fare ve kolda bağlıdır', () => {
    for (const action of TEST_ACTIONS) {
      expect(PC_BINDINGS[action], action).toBeDefined();
      expect(GAMEPAD_BINDINGS[action], action).toBeDefined();
    }
    expect(TEST_ACTIONS).toContain(AIM_STICK_ACTION);
  });

  it('iki eylem aynı tuşu ya da düğmeyi paylaşmaz', () => {
    const keys = TEST_ACTIONS.map((action) => JSON.stringify(PC_BINDINGS[action]));
    const buttons = TEST_ACTIONS.map((action) => GAMEPAD_BINDINGS[action].button);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(buttons).size).toBe(buttons.length);
  });

  it('kenar eylemleri sözlükte tanımlıdır', () => {
    for (const action of EDGE_ACTIONS) expect(TEST_ACTIONS).toContain(action);
    expect(EDGE_ACTIONS).not.toContain('fire');
  });

  it('fren basılı tutulan eylemdir: Space ve kolun sağ yüz düğmesi (B)', () => {
    expect(PC_BINDINGS.brake).toEqual({ source: 'key', keyCode: 32 });
    expect(GAMEPAD_BINDINGS.brake.button).toBe(GAMEPAD_BUTTON.secondary);
    expect(EDGE_ACTIONS).not.toContain('brake');
  });
});
