import {
  DEFAULT_MOVE_KEYS,
  type MoveKeyBindings,
  type NormalizedInputRegion,
  type PCActionBinding,
} from '@volstudio/core';

/**
 * Oyunun eylem sözlüğü. `InputManager` motoru CORE'da yaşar ve hiçbir eylem
 * adı bilmez; hangi eylemin hangi tuşa bağlandığı burada durur.
 */
export type ArachnidAction = 'dash';

export const ARACHNID_ACTIONS: readonly ArachnidAction[] = ['dash'];

export const ARACHNID_PC_BINDINGS: Readonly<Record<ArachnidAction, PCActionBinding>> = {
  // 32 = Space. Phaser KeyCodes yerine sayı: bu dosya saf veridir.
  dash: { source: 'key', keyCode: 32 },
};

/** Hareket tuşları — CORE varsayılanı (WASD). */
export const ARACHNID_MOVE_KEYS: MoveKeyBindings = DEFAULT_MOVE_KEYS;

/**
 * Hareket stick'i yalnız SOL BAŞPARMAĞIN doğal erişim alanında doğar.
 *
 * Üst yarıda bir modal/HUD öğesine ya da sağ tarafta atılım düğmesine dokunmak
 * hareket girdisine dönüşmez. Sağ stick bu oyunda nişan üretmediği için tamamen
 * kapalıdır; görünmez ama aktif bir kontrol alanı bırakılmaz.
 */
export const ARACHNID_LEFT_STICK_REGION: NormalizedInputRegion = {
  minX: 0,
  maxX: 0.48,
  minY: 0.42,
  maxY: 1,
};
