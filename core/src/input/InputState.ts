import type { Vector2 } from '../math/Vector2';

export interface InputState {
  /** Hareket yönü ve büyüklüğü; uzunluk [0, 1]. */
  move: Vector2;
  /** Nişan yönü; uzunluk 0 veya 1. */
  aim: Vector2;
  /** Ateş tetikleyici. */
  fire: boolean;
  /** Dash tetikleyici. */
  dash: boolean;
}
