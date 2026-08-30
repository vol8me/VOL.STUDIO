import type { Vector2 } from '../math/Vector2';
import type { InputState } from './InputState';
import type { InputSnapshot } from './InputSnapshot';

export interface InputProvider<TAction extends string> {
  /**
   * Sağlayıcı kimliği (`'pc'`, `'touch'`, `'gamepad'`…). Diagnostics
   * snapshot'ında modality'yi bu ad tanımlar; CORE kapalı bir liste tutmaz.
   */
  readonly id: string;

  /** Bu provider şu an aktif girdi üretiyor mu? */
  get isActive(): boolean;

  /** playerPosition ekran değil, dünya koordinatı olmalıdır. */
  getState(playerPosition: Vector2): InputState<TAction>;

  /** Diagnostics için ham input durumunu döner; isteğe bağlıdır. */
  getDebugSnapshot?(): InputSnapshot;

  /**
   * Bu sağlayıcı, kullanıcı AKTİF bir şey yapmasa da anlamlı bir durum
   * bildiriyor mu?
   *
   * Fare böyledir: imleç her zaman bir yerdedir, yani nişan yönü SÜREKLİ bir
   * sinyaldir. Dokunmatik değildir: parmak ekranda yoksa nişan diye bir şey
   * yoktur. `InputManager` hiçbir sağlayıcı "aktif" değilken sıfır durum
   * uydurmak yerine bu bayrağı taşıyan sağlayıcıya sorar.
   */
  readonly providesRestingState?: boolean;

  update(delta: number): void;
  /** Geçiş/yeniden başlatma sınırlarında tutulmuş fiziksel girdiyi bırakır. */
  reset?(): void;
  destroy(): void;
}
