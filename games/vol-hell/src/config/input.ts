import { DEFAULT_MOVE_KEYS, type MoveKeyBindings, type PCActionBinding } from '@volstudio/core';

/**
 * VOL.HELL'in eylem SÖZLÜĞÜ ve tuş eşlemesi.
 *
 * `InputManager` motoru CORE'da yaşar ve hiçbir eylem adı bilmez; hangi
 * eylemlerin var olduğu ve neye bağlandığı oyunun kararıdır ve bu dosyada
 * durur — yani bir eylem eklemek ya da tuş değiştirmek VERİ değişikliğidir.
 *
 * - `fire` — mermi ateşleme (sürekli; basılı tutuldukça ateş eder).
 * - `dash` — kısa mesafeli sıçrama (tek tetik).
 */
export type HellAction = 'fire' | 'dash';

/** Tanınan tüm eylemler — `InputState.actions` her karede bu kümenin tamamını taşır. */
export const HELL_ACTIONS: readonly HellAction[] = ['fire', 'dash'];

/**
 * Klavye/fare eşlemesi.
 *
 * `fire` fare sol düğmesine bağlıdır: CORE bu bağlantıda pointer'ın son
 * olayı bir DOKUNUŞ ise eylemi basılı saymaz, yani dokunmatikte sağ
 * joystick ile fare tıklaması birbirine karışmaz.
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
 * Dokunmatikte sağ joystick deadzone'u aşınca `fire` basılı sayılır —
 * "nişan al + otomatik ateş" deseni. Bu bir OYUN tercihidir; CORE'un
 * dokunmatik katmanı kendi başına hiçbir eylem üretmez.
 */
export const HELL_AIM_STICK_ACTION: HellAction = 'fire';
