import { FocusNavController } from '@volstudio/core';

/**
 * Kol ile ekran gezinmesinin uygulama ömürlü sahibi.
 *
 * `FocusNavController` belge düzeyinde yaşar: D-pad/sol çubuk odak taşır,
 * A odaktaki düğmeyi etkinleştirir, B/Escape ortak geri yığınına düşer
 * (Android geri ile aynı zincir — `pushBackHandler` kayıtları otomatik
 * devreye girer). Menu/Start burada `onMenu` delegesine yönlenir.
 *
 * `onMenu` ve `onOverlayOpen` oyunun sahip olduğu anlamlardır ama hangi
 * sahnenin aktif olduğu bootstrap'ta bilinmez — aktif sahne (GameScene)
 * kendini `setGamepadNavDelegate` ile kaydeder; sahne yoksa basımlar no-op.
 */
export interface GamepadNavDelegate {
  /** Menu/Start basımı — oyunda pause toggle. */
  onMenu(): void;
  /** Steam overlay AÇILDI — oyunu duraklatır (geri almaz). */
  onOverlayOpen(): void;
}

let delegate: GamepadNavDelegate | null = null;

const focusNav = new FocusNavController({
  onMenu: () => delegate?.onMenu(),
});

/** Dinleyicileri ve kol yoklamasını kurar; bootstrap'te bir kez çağrılır. */
export function startGamepadNavigation(): void {
  focusNav.start();
}

/** Aktif sahnenin Menu/overlay niyetlerini kaydeder; `null` kaydı siler. */
export function setGamepadNavDelegate(next: GamepadNavDelegate | null): void {
  delegate = next;
}

/** Steam overlay açılışını aktif delegeye iletir (bootstrap çağırır). */
export function notifyGamepadOverlayOpen(): void {
  delegate?.onOverlayOpen();
}
