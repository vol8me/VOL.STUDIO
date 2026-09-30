import { describe, expect, it } from 'vitest';
import { ActionEdges } from '../../src/input/ActionEdges';

type Action = 'grid' | 'pause' | 'zoomIn' | 'fire';
const WATCHED: readonly Action[] = ['grid', 'pause', 'zoomIn'];
const idle = (): Record<Action, boolean> => ({
  grid: false,
  pause: false,
  zoomIn: false,
  fire: false,
});

describe('ActionEdges', () => {
  it('basılı tutulan eylem yalnız ilk karede tetiklenir', () => {
    const edges = new ActionEdges<Action>();
    const actions = idle();
    actions.grid = true;
    edges.update(actions, WATCHED);
    expect(edges.wasPressed('grid')).toBe(true);
    edges.update(actions, WATCHED);
    expect(edges.wasPressed('grid')).toBe(false);
    actions.grid = false;
    edges.update(actions, WATCHED);
    actions.grid = true;
    edges.update(actions, WATCHED);
    expect(edges.wasPressed('grid')).toBe(true);
  });

  it('bastırılan eylem bırakılana dek tetiklenmez', () => {
    const edges = new ActionEdges<Action>();
    const actions = idle();
    edges.suppress('pause');
    actions.pause = true;
    edges.update(actions, WATCHED);
    expect(edges.wasPressed('pause')).toBe(false);
    actions.pause = false;
    edges.update(actions, WATCHED);
    actions.pause = true;
    edges.update(actions, WATCHED);
    expect(edges.wasPressed('pause')).toBe(true);
  });

  it('sıfırlama tutulan durumu unutur', () => {
    const edges = new ActionEdges<Action>();
    const actions = idle();
    actions.zoomIn = true;
    edges.update(actions, WATCHED);
    edges.reset();
    expect(edges.wasPressed('zoomIn')).toBe(false);
    edges.update(actions, WATCHED);
    expect(edges.wasPressed('zoomIn')).toBe(true);
  });
});
