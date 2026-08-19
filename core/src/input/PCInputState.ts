import { Vector2 } from '../math/Vector2';
import { normalizeAnalog, normalizeDirection } from './InputUtils';
import type { InputState } from './InputState';

/**
 * Hareket eksenlerinin o karedeki basılı durumu.
 *
 * Adı bir dönem `WasdDownState`'ti ve YANILTICIYDI: tuş eşlemesi artık
 * yapılandırılabilir (`MoveKeyBindings`, varsayılanı WASD ama ok tuşları da
 * verilebilir). Tip adının tek bir klavye düzenini çivilemesi, mekanizmanın
 * düzenden bağımsız olduğu gerçeğini gizliyordu.
 */
export interface MoveDownState {
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

/** Pointer düğmesi — `PointerLikeState`'in raporladığı düğmelerle sınırlı. */
export type PointerButton = 'left';

/**
 * Bir eylemin PC'de neye bağlandığı.
 *
 * Eşleme VERİDİR: hangi eylemin hangi tuşa/düğmeye bağlı olduğunu CORE
 * bilmez, tüketici verir. Bu yüzden tuşları yeniden atamak bir kayıt
 * değişikliğidir, kod değişikliği değil.
 */
export type PCActionBinding =
  | { source: 'key'; keyCode: number }
  | { source: 'pointerButton'; button: PointerButton };

/**
 * Eylem eşlemelerini o karenin basılı/basılı değil kaydına çevirir.
 *
 * `keyDown` çağrılabilir olarak alınır (Phaser `Key` nesnesi değil) — böylece
 * bu mantık Phaser sahnesi kurulmadan test edilebilir.
 *
 * **`wasTouch` koruması:** pointer düğmesine bağlı eylemler, pointer'ın son
 * olayı bir DOKUNUŞ ise basılı SAYILMAZ. Dokunmatikte joystick zaten kendi
 * eylemini üretir; bu koruma olmadan tek bir dokunuş hem stick'i hem PC
 * eylemini tetikler (çift girdi).
 */
export function resolvePCActions<TAction extends string>(
  bindings: Readonly<Record<TAction, PCActionBinding>>,
  keyDown: (keyCode: number) => boolean,
  pointer: PointerLikeState,
): Record<TAction, boolean> {
  const result = {} as Record<TAction, boolean>;

  for (const action of Object.keys(bindings) as TAction[]) {
    const binding = bindings[action];
    result[action] =
      binding.source === 'key'
        ? keyDown(binding.keyCode)
        : pointer.leftButtonDown && !pointer.wasTouch;
  }

  return result;
}

/**
 * WASD + pointer'dan InputState hesaplayan saf mantık, Phaser nesnelerinden bağımsız
 * (PCController tipleri çevirip burayı çağırır) — Phaser.Scene kurmadan test edilebilir.
 */
export function computePCInputState<TAction extends string>(
  keys: MoveDownState,
  pointer: PointerLikeState,
  worldTarget: Vector2,
  playerPosition: Vector2,
  actions: Readonly<Record<TAction, boolean>>,
): InputState<TAction> {
  const move = new Vector2();
  if (keys.up) move.y -= 1;
  if (keys.down) move.y += 1;
  if (keys.left) move.x -= 1;
  if (keys.right) move.x += 1;

  const aimRaw = new Vector2(worldTarget.x - playerPosition.x, worldTarget.y - playerPosition.y);

  return {
    move: normalizeAnalog(move),
    aim: normalizeDirection(aimRaw),
    actions,
  };
}

/**
 * Gerçek klavye/pointer girdisi var mı? `wasTouch` KASITLI kontrol edilmez —
 * miras kalan pointer durumu tek başına provider'ı "aktif" göstermemeli.
 *
 * Eylemler tek tek adlarıyla değil topluca sorgulanır: hangi eylemlerin var
 * olduğu CORE'un bilgisi değil, "herhangi biri basılı mı" sorusu yeterli.
 */
export function isPCInputActive(
  keys: MoveDownState,
  pointer: PointerLikeState,
  actions: Readonly<Record<string, boolean>>,
): boolean {
  return (
    keys.up ||
    keys.down ||
    keys.left ||
    keys.right ||
    Object.values(actions).some(Boolean) ||
    (pointer.isDown && !pointer.wasTouch)
  );
}
