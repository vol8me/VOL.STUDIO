import { Vector2 } from '../math/Vector2';
import { createIdleActions, type InputState } from './InputState';

type VectorChannel = 'move' | 'aim';

/**
 * Kare basışlarını ilk ticke, fiziksel düzeyi her ticke taşır.
 *
 * Vektör kanallarında kenar da taşınır: sıfırdan sıfıra düşen son değer,
 * kendisini bildiren karede sabit tick üretilmemişse bir sonraki tickte
 * bir kez daha okunur. Aksi hâlde tick'ten kısa bir dokunuş, hiç üretmediği
 * tick'te kaybolur.
 */
export class InputStepBuffer<TAction extends string> {
  private state: InputState<TAction>;
  private readonly pending = new Set<TAction>();
  private readonly held = new Set<TAction>();
  private readonly actions: readonly TAction[];
  private readonly edge: Record<VectorChannel, Vector2> = {
    move: Vector2.zero(),
    aim: Vector2.zero(),
  };
  private readonly armed: Record<VectorChannel, boolean> = { move: false, aim: false };

  constructor(actions: readonly TAction[]) {
    this.actions = [...actions];
    this.state = this.idle();
  }

  sample(state: InputState<TAction>): void {
    const heldActions = { ...(state.heldActions ?? state.actions) };
    for (const action of this.actions) {
      if (state.pressedActions?.[action] || (heldActions[action] && !this.held.has(action)))
        this.pending.add(action);
      if (heldActions[action]) this.held.add(action);
      else this.held.delete(action);
    }
    this.rememberEdge('move', state.move);
    this.rememberEdge('aim', state.aim);
    this.state = {
      move: new Vector2(state.move.x, state.move.y),
      aim: new Vector2(state.aim.x, state.aim.y),
      actions: heldActions,
      heldActions,
    };
  }

  consume(): InputState<TAction> {
    const pressedActions = createIdleActions(this.actions);
    const actions = { ...this.state.actions } as Record<TAction, boolean>;
    for (const action of this.pending) {
      actions[action] = true;
      pressedActions[action] = true;
    }
    this.pending.clear();
    return {
      move: this.readChannel('move'),
      aim: this.readChannel('aim'),
      actions,
      heldActions: { ...this.state.actions },
      pressedActions,
    };
  }

  reset(): void {
    this.pending.clear();
    this.held.clear();
    this.armed.move = false;
    this.armed.aim = false;
    this.state = this.idle();
  }

  private rememberEdge(channel: VectorChannel, value: Vector2): void {
    if (value.x === 0 && value.y === 0) return;
    const edge = this.edge[channel];
    edge.x = value.x;
    edge.y = value.y;
    this.armed[channel] = true;
  }

  private readChannel(channel: VectorChannel): Vector2 {
    const current = this.state[channel];
    if (!this.armed[channel]) return new Vector2(current.x, current.y);
    this.armed[channel] = false;
    const edge = this.edge[channel];
    const x = current.x === 0 && current.y === 0 ? edge.x : current.x;
    const y = current.x === 0 && current.y === 0 ? edge.y : current.y;
    return new Vector2(x, y);
  }

  private idle(): InputState<TAction> {
    return { move: Vector2.zero(), aim: Vector2.zero(), actions: createIdleActions(this.actions) };
  }
}
