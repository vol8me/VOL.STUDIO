import { describe, expect, it } from 'vitest';
import {
  ActionEdges,
  AIM_STICK_ACTION,
  EDGE_ACTIONS,
  GAMEPAD_BINDINGS,
  PC_BINDINGS,
  TEST_ACTIONS,
  type TestAction,
} from '@/input/bindings';

const idle = (): Record<TestAction, boolean> =>
  Object.fromEntries(TEST_ACTIONS.map((action) => [action, false])) as Record<TestAction, boolean>;

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
});

describe('ActionEdges', () => {
  it('basılı tutulan eylem yalnız ilk karede tetiklenir', () => {
    const edges = new ActionEdges<TestAction>();
    const actions = idle();
    actions.grid = true;
    edges.update(actions, EDGE_ACTIONS);
    expect(edges.wasPressed('grid')).toBe(true);
    edges.update(actions, EDGE_ACTIONS);
    expect(edges.wasPressed('grid')).toBe(false);
    actions.grid = false;
    edges.update(actions, EDGE_ACTIONS);
    actions.grid = true;
    edges.update(actions, EDGE_ACTIONS);
    expect(edges.wasPressed('grid')).toBe(true);
  });

  it('bastırılan eylem bırakılana dek tetiklenmez', () => {
    const edges = new ActionEdges<TestAction>();
    const actions = idle();
    edges.suppress('pause');
    actions.pause = true;
    edges.update(actions, EDGE_ACTIONS);
    expect(edges.wasPressed('pause')).toBe(false);
    actions.pause = false;
    edges.update(actions, EDGE_ACTIONS);
    actions.pause = true;
    edges.update(actions, EDGE_ACTIONS);
    expect(edges.wasPressed('pause')).toBe(true);
  });

  it('sıfırlama tutulan durumu unutur', () => {
    const edges = new ActionEdges<TestAction>();
    const actions = idle();
    actions.zoomIn = true;
    edges.update(actions, EDGE_ACTIONS);
    edges.reset();
    expect(edges.wasPressed('zoomIn')).toBe(false);
    edges.update(actions, EDGE_ACTIONS);
    expect(edges.wasPressed('zoomIn')).toBe(true);
  });
});
