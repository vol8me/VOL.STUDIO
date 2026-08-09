import { Vector2 } from '../math/Vector2';
import { normalizeAnalog, normalizeDirection } from './InputUtils';
import type { InputState } from './InputState';

export interface WasdDownState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface PointerLikeState {
  x: number;
  y: number;
  isDown: boolean;
  leftButtonDown: boolean;
  wasTouch: boolean;
}

export interface ExtraKeysState {
  dash: boolean;
}

/**
 * WASD + pointer'dan InputState hesaplayan saf mantık, Phaser nesnelerinden bağımsız
 * (PCController tipleri çevirip burayı çağırır) — Phaser.Scene kurmadan test edilebilir.
 */
export function computePCInputState(
  keys: WasdDownState,
  pointer: PointerLikeState,
  worldTarget: Vector2,
  playerPosition: Vector2,
  extra: ExtraKeysState,
): InputState {
  const move = new Vector2();
  if (keys.up) move.y -= 1;
  if (keys.down) move.y += 1;
  if (keys.left) move.x -= 1;
  if (keys.right) move.x += 1;

  const aimRaw = new Vector2(worldTarget.x - playerPosition.x, worldTarget.y - playerPosition.y);

  return {
    move: normalizeAnalog(move),
    aim: normalizeDirection(aimRaw),
    fire: pointer.leftButtonDown && !pointer.wasTouch,
    dash: extra.dash,
  };
}

/**
 * Gerçek klavye/pointer girdisi var mı? `wasTouch` KASITLI kontrol edilmez —
 * miras kalan pointer durumu tek başına provider'ı "aktif" göstermemeli.
 */
export function isPCInputActive(
  keys: WasdDownState,
  pointer: PointerLikeState,
  extra: ExtraKeysState,
): boolean {
  return (
    keys.up ||
    keys.down ||
    keys.left ||
    keys.right ||
    extra.dash ||
    (pointer.isDown && !pointer.wasTouch)
  );
}
