import type { Vector2 } from '../math/Vector2';

/**
 * Bir karedeki girdi durumu.
 *
 * **Eylem kümesi CORE'da tanımlı değildir.** `move`/`aim` her yön tabanlı
 * oyunda aynı anlamı taşıdığı için burada durur; ama "ateş et", "dash at",
 * "inşa modu" gibi EYLEMLER bir oyunun sözlüğüdür. Bu yüzden eylemler adlı
 * alanlar olarak değil, tüketicinin tanımladığı `TAction` kümesiyle
 * anahtarlanmış bir kayıt olarak taşınır:
 *
 * ```ts
 * type HellAction = 'fire' | 'dash';
 * const state: InputState<HellAction> = manager.getState(pos);
 * if (state.actions.dash) player.tryDash(aim);
 * ```
 *
 * Yan kazanç: eylem → tuş eşlemesi artık veridir (bkz. `PCActionBinding`),
 * yani yeniden atanabilir tuşlar mekanizma değişikliği gerektirmez.
 */
export interface InputState<TAction extends string> {
  /** Hareket yönü ve büyüklüğü; uzunluk [0, 1]. */
  move: Vector2;
  /** Nişan/bakış yönü; uzunluk 0 veya 1. */
  aim: Vector2;
  /** Eylem adı → o kare basılı mı. Kümenin tamamı her zaman doludur. */
  actions: Readonly<Record<TAction, boolean>>;
}

/**
 * Verilen eylem kümesi için "hiçbiri basılı değil" kaydı üretir.
 *
 * Eksik anahtar bırakmamak sözleşmenin parçası: `state.actions.dash`
 * okuyan çağıran `undefined` ile karşılaşmamalı, aktif provider olmadığında
 * bile `false` görmeli.
 */
export function createIdleActions<TAction extends string>(
  actions: readonly TAction[],
): Record<TAction, boolean> {
  const result = {} as Record<TAction, boolean>;
  for (const action of actions) {
    result[action] = false;
  }
  return result;
}
