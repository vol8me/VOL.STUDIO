import type { StatBlock } from '@volstudio/core';

/**
 * VOL.HELL'in stat SÖZLÜĞÜ.
 *
 * `StatBlock` motoru CORE'da yaşar ve hiçbir stat adı bilmez; hangi stat'ların
 * var olduğu oyunun kararıdır ve bu dosyada durur. Yeni bir stat eklemek tek
 * dosyalık bir veri değişikliğidir — CORE'a dokunmayı gerektirmez.
 *
 * - `damage` — vuruş başına hasar.
 * - `speed` — hareket hızı (piksel/saniye).
 * - `health` — maksimum can.
 * - `fireRate` — saldırılar arası bekleme (COOLDOWN, ms). **Düşük değer =
 *   hızlı saldırı.** "Ateş hızı %25 artsın" isteyen bir kaynak
 *   `{ type: 'multiply', value: 0.8 }` verir; `1.25` vermek ateşi yavaşlatır.
 */
export type HellStat = 'damage' | 'speed' | 'health' | 'fireRate';

/** Tüm stat anahtarları — iterasyon ve katalog doğrulaması için. */
export const HELL_STAT_KEYS: readonly HellStat[] = ['damage', 'speed', 'health', 'fireRate'];

/** Taban stat değerleri — dört stat da zorunludur. */
export type HellBaseStats = Record<HellStat, number>;

/**
 * Oyunun stat kümesiyle parametrelenmiş `StatBlock`.
 *
 * Runtime imzalarında çıplak `StatBlock` yerine bu takma ad kullanılır:
 * `StatBlock` artık jenerik ve varsayılansızdır, tip parametresini her
 * imzada tekrar yazmak gürültü üretir.
 */
export type HellStatBlock = StatBlock<HellStat>;
