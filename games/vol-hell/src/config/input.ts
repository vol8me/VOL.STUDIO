import {
  DEFAULT_MOVE_KEYS,
  GAMEPAD_BUTTON,
  type GamepadActionBinding,
  type MoveKeyBindings,
  type PCActionBinding,
} from '@volstudio/core';

/**
 * VOL.HELL eylem sözlüğü ve tuş eşlemesi — `InputManager` eylem adı bilmez;
 * eylem eklemek ya da tuş değiştirmek VERİ değişikliğidir ve burada durur.
 * `fire` mermi ateşleme (basılı tutulabilir), `dash` kısa sıçrama (tek tetik).
 */
export type HellAction = 'fire' | 'dash';

/** Tanınan tüm eylemler — `InputState.actions` her karede bu kümenin tamamını taşır. */
export const HELL_ACTIONS: readonly HellAction[] = ['fire', 'dash'];

/**
 * `fire` fare sol düğmesinde: CORE, pointer'ın son olayı dokunuşsa eylemi
 * basılı saymaz — dokunmatikte sağ joystick ile fare tıklaması karışmaz.
 */
export const HELL_PC_BINDINGS: Readonly<Record<HellAction, PCActionBinding>> = {
  fire: { source: 'pointerButton', button: 'left' },
  // 32 = Space. Phaser KeyCodes yerine sayı: bu dosya saf veridir, tuş
  // atama ekranı/kayıt dosyası da aynı sayıyı taşıyacak.
  dash: { source: 'key', keyCode: 32 },
};

/** Hareket tuşları — CORE varsayılanı (WASD). */
export const HELL_MOVE_KEYS: MoveKeyBindings = DEFAULT_MOVE_KEYS;

/**
 * Kol eşlemesi (W3C `standard` dizinleri). Sol çubuk hareket, sağ çubuk
 * nişan — eksenleri `gamepad` sağlayıcısı okur; burada yalnız eylem
 * düğmeleri var: `fire` sağ tetikte (RT), `dash` A/✕'te. Menu/Start
 * bilerek yoktur: gezinme katmanına aittir (`FocusNavController.onMenu`).
 */
export const HELL_GAMEPAD_BINDINGS: Readonly<Record<HellAction, GamepadActionBinding>> = {
  fire: { source: 'button', button: GAMEPAD_BUTTON.rightTrigger },
  dash: { source: 'button', button: GAMEPAD_BUTTON.primary },
};

/** Dokunmatikte sağ joystick'in ürettiği eylem; CORE dokunma katmanı eylem adı bilmez. */
export const HELL_AIM_STICK_ACTION: HellAction = 'fire';

/** Sağ çubuğa basmak otomatik nişanı başlatır; sürüklemek manuel nişandır. */
export const HELL_AIM_STICK_ACTIVATES_ON_TOUCH = true;
