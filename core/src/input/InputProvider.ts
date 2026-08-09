import type { Vector2 } from '../math/Vector2';
import type { InputState } from './InputState';
import type { InputSnapshot } from './InputSnapshot';

export interface InputProvider {
  /** Bu provider şu an aktif girdi üretiyor mu? */
  get isActive(): boolean;

  /** playerPosition ekran değil, dünya koordinatı olmalıdır. */
  getState(playerPosition: Vector2): InputState;

  /** Diagnostics için ham input durumunu döner; isteğe bağlıdır. */
  getDebugSnapshot?(): InputSnapshot;

  update(delta: number): void;
  destroy(): void;
}
