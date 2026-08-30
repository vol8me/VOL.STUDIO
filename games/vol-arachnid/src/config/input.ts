import { DEFAULT_MOVE_KEYS, type MoveKeyBindings, type PCActionBinding } from '@volstudio/core';

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
